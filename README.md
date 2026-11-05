# MemeClicker

**MemeClicker** — браузерная игра на скорость кликов. Игроки входят в общее лобби, общаются в чате, готовятся к старту и соревнуются в 60-секундном раунде. Счёт обновляется в реальном времени, а после раунда игроки видят победителя и результаты.

> Техническое задание: [`TZ.md`](TZ.md)

## Возможности

- Общее лобби с никнеймами, статусом готовности и минимумом игроков для старта.
- Чат лобби через WebSocket. Имя автора берётся из серверного player token, а не из переданного клиентом ника; длина и частота сообщений ограничены.
- Синхронный старт по серверному времени с анимированным пятисекундным отсчётом.
- Раунд на 60 секунд, live-лидерборд, финальный экран с анимацией победителя.
- Передача кликов через Kafka и атомарный учёт в Redis с дедупликацией по UUID.
- Docker-сборка frontend и backend в одном образе; внешние Kafka и Redis.

## Технологии

| Слой | Технологии |
| --- | --- |
| Backend | Java 25, Spring Boot 4, Spring MVC, Virtual Threads, REST, WebSocket |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| События и состояние | Kafka, Redis, Redis Lua scripts |
| Сборка и тесты | Gradle Wrapper, Docker multi-stage build, Testcontainers, GitHub Actions |
| Размещение | Render Web Service + внешние Kafka и Redis (настройки приложения рассчитаны на Aiven и Upstash) |

## Архитектура

```text
┌─────────────────────┐      REST + WebSocket      ┌──────────────────────────┐
│ React SPA           │ ◄────────────────────────► │ Spring Boot backend      │
│ lobby / game / final│                             │ Spring MVC + Virtual     │
└─────────────────────┘                             │ Threads                  │
                                                    └────────────┬─────────────┘
                                                                 │
                        ┌────────────────────────────────────────┼───────────────┐
                        │                                        │               │
                        ▼                                        ▼               ▼
                 ┌────────────┐                           ┌────────────────┐  WebSocket
                 │ Redis      │                           │ Kafka          │  broadcasts
                 │ lobby,     │◄──── consumer + Lua ──────│ clicks         │  lobby,
                 │ scores,    │                           │ + ROUND_END    │  leaderboard,
                 │ results    │                           �───────────────┘  round-end, chat
                 └────────────┘
```

### Поток игры

1. Клиент отправляет `POST /api/lobby/join` с никнеймом. Backend создаёт `playerToken`, записывает состояние игрока в Redis и возвращает токен.
2. Клиенты подключаются к `/ws/lobby`: получают снимок лобби, обновления игроков и события чата. Чат-сообщение отправляется с токеном; backend проверяет токен и рассылает нормализованное сообщение подписчикам.
3. После готовности достаточного числа игроков backend атомарно переводит лобби в `starting`, сохраняет `roundId`, `startAt` и `endAt` в Redis и рассылает `game-start`. Frontend синхронизирует часы и показывает обратный отсчёт до `startAt`.
4. Во время раунда фронтенд отправляет `POST /api/click` с `X-Player-Token`, `roundId` и новым `clickUUID`. Backend проверяет токен и окно раунда, отправляет событие в Kafka и отвечает `202` только после подтверждения producer от брокера.
5. Kafka consumer обрабатывает события по порядку. Lua-скрипт `scripts/click.lua` атомарно создаёт ключ дедупликации `SET NX` и увеличивает счёт в Redis Sorted Set только для нового UUID.
6. Изменения счёта попадают в WebSocket-лидерборд. После окончания раунда backend помещает маркер `ROUND_END` в тот же Kafka-топик; consumer фиксирует итоги, когда доходит до маркера, и отправляет событие `round-end`.
7. Игрок возвращается в главное меню через `POST /api/lobby/leave`. Игрок удаляется из лобби сразу; завершённое состояние раунда очищается, когда выходит последний участник. При следующем входе также предусмотрен сброс завершённого раунда.

### Надёжность и границы гарантий

- Producer настроен с `acks=all` и Kafka idempotence; API ждёт подтверждения отправки с ограниченным timeout. При проблеме отправки backend отвечает ошибкой, чтобы клиент мог повторить запрос с тем же UUID.
- Клик считается принятым HTTP API после ответа `202`, но обновление таблицы происходит асинхронно consumer-ом.
- Повторная обработка события безопасна для счёта: Redis Lua дедуплицирует `roundId + clickUUID`, а увеличение score происходит в той же атомарной операции.
- Consumer подтверждает offset вручную после обработки. Для временных ошибок настроены повторы; после исчерпания попыток событие направляется в `clicks.dlq` для диагностики, а не автоматически засчитывается.
- Очередь повторов клика на клиенте хранится в памяти браузера; она не переживает закрытие/перезагрузку страницы. Поэтому система защищает подтверждённые Kafka события от потери при штатном повторе обработки, но не обещает сохранность клика, который так и не был успешно отправлен.
- В production топики `clicks` и `clicks.dlq` создаются заранее. Для порядка кликов и маркера раунда используется одна партиция.

## API и realtime-события

| Метод / канал | Назначение |
| --- | --- |
| `POST /api/lobby/join` `{ "nickname": "..." }` | Вход в лобби; возвращает `playerToken` |
| `POST /api/lobby/ready` + `X-Player-Token` | Отметиться готовым |
| `POST /api/lobby/leave` + `X-Player-Token` | Покинуть лобби и очистить завершённое лобби при выходе последнего игрока |
| `GET /api/lobby` | Текущий снимок лобби |
| `POST /api/click` + `X-Player-Token` | Принять клик `{ "roundId": "...", "clickUUID": "..." }` |
| `GET /api/round/{roundId}/results` | Финальные результаты раунда |
| `GET /api/matches?limit=20` | История матчей |
| `GET /actuator/health` | Health check приложения |

Сообщения WebSocket используют оболочку `{"type":"...","data":...}`:

| Endpoint | Типы сообщений |
| --- | --- |
| `/ws/lobby` | `lobby`, `game-start`, `chat` |
| `/ws/leaderboard` | `leaderboard`, `round-end` |

Формат входящего сообщения чата: `{"type":"chat","data":{"token":"...","text":"..."}}`. Сервер ограничивает длину текста 300 символами и интервал отправки с одного соединения — 500 мс. История чата сейчас не сохраняется: сообщения видят подключённые клиенты.

## Данные Redis

| Ключ | Тип | Назначение |
| --- | --- | --- |
| `lobby:global:players` | HASH | Никнейм → время входа |
| `lobby:global:ready` | HASH | Никнейм → статус готовности |
| `lobby:global:phase` | STRING | Состояние `waiting`, `starting`, `running` или `finished` |
| `lobby:global:round` | HASH | `roundId`, `startAt`, `endAt` |
| `lobby:global:tokens` | HASH | Player token → никнейм |
| `dedup:{roundId}:{clickUUID}` | STRING с TTL | Идемпотентность клика |
| `leaderboard:{roundId}` | ZSET | Никнейм → число клико�� |
| `match:{roundId}` | HASH | Сохранённые итоги завершённого матча |
| `matches:history` | ZSET | История матчей по времени завершения |

Основные Redis-операции лобби и кликов вынесены в `backend/src/main/resources/scripts/*.lua`, чтобы составные изменения выполнялись атомарно.

## Структура репозитория

```text
backend/
  src/main/java/.../click/       REST, Kafka producer и consumer кликов
  src/main/java/.../lobby/       вход, готовность, токены и выход из лобби
  src/main/java/.../round/       планирование раундов и фиксация результатов
  src/main/java/.../leaderboard/ чтение и рассылка таблицы лидеров
  src/main/java/.../ws/          WebSocket handlers и каналы
  src/main/resources/            профили Spring и Redis Lua scripts
front/
  src/api/                       REST-клиент
  src/components/                экраны лобби, игры и результатов
  src/hooks/                     очередь кликов и синхронизация времени
  src/ws/                        WebSocket-клиент
bots/                            Java и Node.js боты для проверки игры
Dockerfile                       multi-stage сборка React + Spring Boot
 docker-compose.yml              запуск приложения с внешними Kafka/Redis
.github/workflows/ci.yml         backend/frontend checks и Docker build
```

## Локальная разработка

Требуются JDK 25, Node.js 22, Docker (для Testcontainers) и доступные Kafka/Redis. Профиль `local` ожидает Kafka на `localhost:9094` и Redis на `localhost:6379`.

> Важно: текущий `docker-compose.yml` описывает **только приложение** и подключается к внешним Kafka и Redis. Он не поднимает локальные сервисы Kafka/Redis. Для локального запуска сначала запустите их отдельно или используйте собственную конфигурацию.

Запуск backend и frontend в разных терминалах:

```bash
cd backend
./gradlew bootRun
```

```bash
cd front
npm ci
npm run dev
```

Откройте `http://localhost:5173`. Vite проксирует `/api` и `/ws` на backend `localhost:8080`.

С��орка и тесты backend (Testcontainers использует Docker):

```bash
cd backend
./gradlew build
```

Сборка frontend:

```bash
cd front
npm ci
npm run build
```

## Docker и деплой

Корневой `Dockerfile` собирает frontend в Node-этапе, копирует результат в static resources Spring Boot, собирает JAR Gradle и запускает его в минимальном JRE-образе от непривилегированного пользователя. Порт приложения — `8080` или значение `PORT`.

`docker-compose.yml` пригоден для запуска собранного сервиса при наличии внешних зависимостей. Он требует переменные `KAFKA_BOOTSTRAP_SERVERS`, `REDIS_URL` и каталог `./secrets` с файлами Kafka `ca.pem`, `service.cert`, `service.key`.

Для Render Web Service используйте Dockerfile в корне репозитория и production-профиль. По текущему `application-prod.yml` backend ожидает:

| Настройка | Значение |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `prod` |
| `KAFKA_BOOTSTRAP_SERVERS` | Адрес Aiven Kafka `host:port` |
| Kafka PEM certificates | Файлы доступны приложению по путям `/etc/secrets/ca.pem`, `/etc/secrets/service.cert`, `/etc/secrets/service.key` |
| `REDIS_URL` | URL подключения к Upstash Redis |

Создайте в Aiven топики `clicks` и `clicks.dlq` с одной партицией. В production автосоздание топиков выключено (`clicker.create-topics: false`). В настройках Render укажите пути к secret files/volume, соответствующие указанным путям, и health check path `/actuator/health`.

## Боты и ручная проверка

Java-боты входят в лобби, ждут `game-start`, отправляют клики и сравнивают принятые клики с итоговым счётом:

```bash
java bots/Bots.java http://localhost:8080 5 10
java bots/Bots.java https://<app>.onrender.com 5 10
```

Node.js-боты требуют Node.js 22+:

```bash
node bots/bots.mjs http://localhost:8080 5 10
node bots/bots.mjs https://<app>.onrender.com 5 10
```

## CI

GitHub Actions workflow `.github/workflows/ci.yml` запускается на push в `main` и pull request. Он отдельно собирает и тестирует backend, собирает frontend и проверяет Docker-образ. Docker job выполняет build с `push: false`: публикацию образа или деплой workflow не делает.
