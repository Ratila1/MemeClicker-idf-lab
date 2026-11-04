# MemeClicker

Платформа соревновательного кликинга в реальном времени. Игроки заходят в общее лобби по никнейму. Когда в лобби минимум 5 человек и все нажали «ГОТОВ», у всех одновременно стартует 60-секундный раунд. Каждый клик проходит через Kafka, консьюмер учитывает его в Redis, лидерборд приходит по WebSocket.

ТЗ: [`TZ.md`](TZ.md).

## Стек

Java 25, Spring Boot 4.0, Spring MVC + Virtual Threads, Gradle (Wrapper), React + Vite, Kafka (Aiven), Redis (Upstash), Testcontainers, Render (Docker).

## Архитектура

```
[React SPA] --REST--> [Spring MVC + Virtual Threads]
     ^                        |
     |<-----WebSocket---------+  /ws/lobby (лобби, game-start), /ws/leaderboard (лидерборд, round-end)
     |                   +----+-----+
     |                   v          v
     |             [Redis]      [Kafka Producer]  acks=all, idempotence, .get(2 s)
     |             (лобби)          |
     |                              v
     |                  [Kafka: clicks, 1 партиция]  клики + маркер ROUND_END
     |                              |
     |                              v
     |              [Kafka Consumer, AckMode.MANUAL]
     |                  Lua: SET NX dedup + ZINCRBY  -> ack
     |                              |
     |                              v
     |                [тик 100 мс -> /ws/leaderboard]
     |                              |
     |                              v  (маркер ROUND_END)
     |                   [Redis: история матчей] -> round-end
```

### Поток данных

1. **Лобби.** `POST /api/lobby/join` → `join.lua` (атомарно: проверка фазы, `HSETNX` ника, выдача `playerToken`). `POST /api/lobby/ready` → `ready.lua`: отмечает готовность и в том же скрипте проверяет «все готовы». Если все готовы, ставит `phase = starting` и записывает раунд. Два одновременных «ГОТОВ» не могут создать два раунда.
2. **Старт.** Сервер шлёт в `/ws/lobby` событие `game-start {roundId, startAt, roundEndTime, serverTime}` с `startAt = now + 3 с`. Клиенты синхронизируют часы по `serverTime` и стартуют по `startAt`. В `startAt` серверный таймер ставит `phase = running`.
3. **Клик.** `POST /api/click` (`X-Player-Token`, `{roundId, clickUUID}`): токен и окно раунда проверяются по кешу в памяти, без Redis. Сообщение `{roundId, nickname, clickUUID, receivedAt, endAt}` уходит в Kafka с `.get(2 с)`. Ответы: `202` (записан в Kafka), `423` (раунд не идёт), `400`, `401`, `503` (Kafka не успевает, повторите с тем же UUID).
4. **Консьюмер.** Для каждого клика выполняется один Lua-скрипт: `SET dedup:{roundId}:{uuid} NX EX 86400`, и только если ключ создан, `ZINCRBY leaderboard:{roundId}`. Офсет коммитится после скрипта. Клики с `receivedAt > endAt` игнорируются.
5. **Лидерборд.** Консьюмер помечает лидерборд «грязным». Раз в 100 мс, если были изменения, `ZREVRANGE` рассылается в `/ws/leaderboard`.
6. **Конец раунда.** В `endAt + 1 с` таймер ждёт, пока завершатся уже принятые запросы `/api/click`, и публикует в тот же топик маркер `ROUND_END`. Партиция одна, поэтому, когда консьюмер дошёл до маркера, все клики раунда уже учтены. Только тогда `finish_round.lua` атомарно пишет `match:{roundId}`, `matches:history` и `phase = finished`, а клиенты получают `round-end`. Итоги по таймеру не читаются.
7. **Новое лобби.** Первый `join` после завершённого раунда очищает лобби: игроки после финального экрана заходят заново, старые ники свободны. История матчей при этом не трогается.

### API

| Метод | Ответ |
| --- | --- |
| `POST /api/lobby/join` `{nickname}` | `200 {playerToken}`, `409` ник занят, `423` идёт раунд, `400` |
| `POST /api/lobby/ready` + `X-Player-Token` | `204`, `409` меньше 5 игроков, `423`, `401` |
| `GET /api/lobby` | `{phase, players:[{nickname, ready, joinedAt}], minPlayers}` |
| `POST /api/click` + `X-Player-Token` `{roundId, clickUUID}` | `202`, `400`, `401`, `423`, `503` |
| `GET /api/round/{roundId}/results` | `{roundId, winner, entries:[{nickname, score, winner}], finishedAt}`, `404` пока нет маркера |
| `GET /api/matches?limit=20` | `[{roundId, winner, total, finishedAt}]` |

WebSocket-сообщения: `{"type": "...", "data": ...}`. Типы: `lobby`, `game-start` (`/ws/lobby`), `leaderboard`, `round-end` (`/ws/leaderboard`). При подключении сразу приходит текущий снимок, а если раунд уже идёт, то и `game-start` (переподключение после обновления страницы).

### Ключи Redis

| Ключ | Тип | TTL |
| --- | --- | --- |
| `lobby:global:players` | HASH ник → joinedAt | — |
| `lobby:global:ready` | HASH ник → true/false | — |
| `lobby:global:phase` | STRING waiting / starting / running / finished | — |
| `lobby:global:round` | HASH roundId, startAt, endAt | — |
| `lobby:global:tokens` | HASH playerToken → ник | — |
| `dedup:{roundId}:{clickUUID}` | STRING | 24 ч |
| `leaderboard:{roundId}` | ZSET ник → счёт | — |
| `match:{roundId}` | HASH finishedAt, winner, total | — |
| `matches:history` | ZSET finishedAt → roundId | — |

Победитель — максимальный счёт; при равенстве лексикографически меньший ник (ZSET не хранит, кто набрал счёт раньше).

## Надёжность

- **Идемпотентность.** UUID клика генерирует фронт до отправки. Повтор с тем же UUID (ретрай фронта или повторная доставка из Kafka) отсекается `SET NX` внутри того же Lua-скрипта, что делает `ZINCRBY`.
- **Backpressure.** Клик отвечает только после подтверждения брокера (`acks=all`). Буфер продюсера ограничен (`buffer.memory = 4 МБ`, `max.block.ms = 5 с`), ожидание ответа 2 с. Если Kafka не успевает, клиент получает `503` и повторяет клик с тем же UUID; очередь в памяти не растёт. WebSocket-сессии обёрнуты в `ConcurrentWebSocketSessionDecorator` (лимит 1 с / 64 КБ), медленный клиент отключается.
- **Graceful shutdown.** `server.shutdown=graceful`, 30 с на фазу. Листенер обрабатывает записи синхронно и коммитит офсет после Lua. Убили до коммита: Kafka отдаст запись снова, дубль отсечёт dedup. Продюсер при закрытии делает flush.
- **Рестарт посреди раунда.** При старте приложение читает `phase` и `lobby:global:round` из Redis, восстанавливает кеш и таймеры. Если время раунда уже вышло, маркер публикуется сразу; повторный маркер ничего не ломает.
- **Ошибки консьюмера.** Redis недоступен: офсет не коммитится, запись перечитывается. После 3 повторов (через 500 мс) она уходит в `clicks.dlq` и коммитится, чтобы не блокировать партицию. Нечитаемые сообщения сразу уходят в DLQ.

**Инвариант:** число уникальных `clickUUID` с ответом `202` = `ZSCORE` игрока = число уникальных кликов в Kafka до маркера `ROUND_END`. Проверяется интеграционным тестом и ботами.

## Почему Virtual Threads, а не WebFlux

Нагрузка маленькая (5-10 игроков, ~50 кликов/с). Клиенты Kafka (`KafkaTemplate.send().get()`) и Redis используются блокирующе, и именно блокирующий `.get()` даёт простой backpressure: поток ждёт подтверждения брокера, а виртуальный поток при этом почти ничего не стоит. Код остаётся обычным императивным Spring MVC, ошибки видны в нормальных стектрейсах. WebFlux дал бы выигрыш на тысячах одновременных соединений, но потребовал бы реактивных клиентов и усложнил отладку. При росте числа подписчиков WebSocket стоит рассмотреть WebFlux или лимит сессий.

## Почему без CQRS

Запись и чтение уже разделены инфраструктурно: команды (клики) идут в Kafka, а чтение (лидерборд, итоги) идёт из Redis ZSET, который обновляет консьюмер. Отдельные модели команд и запросов, шины и проекции на этой нагрузке ничего не дают, кроме лишнего кода и мест для ошибок. Если появятся несколько видов проекций (статистика, рейтинги за сезон), их можно добавить отдельными консьюмерами того же топика.

## Бюджет Upstash (500K команд/мес, 10K команд/с)

| Источник | Команд на раунд |
| --- | --- |
| Клики: 5 игроков × 10/с × 60 с, один `EVAL` на клик | ~3 000 |
| Тики лидерборда: ≤ 10/с × 60 с, только если были изменения и есть подписчики | ≤ 600 |
| Лобби: 5 × (`join` + снимок 3 команды) + 5 × (`ready` + снимок) | ~40 |
| Старт, `ROUND_END`, итоги, финальный экран (5 × 2) | ~15 |
| **Итого** | **~3 650** |

500 000 / 3 650 ≈ **135 раундов в месяц**. Токены игроков и состояние раунда кешируются в памяти, поэтому клик не делает лишних запросов в Redis. История матчей занимает около 1 КБ на матч.

## Лимиты бесплатных тиров

Условия меняются, перед демо проверить актуальные.

| Сервис | Лимит | Влияние |
| --- | --- | --- |
| Aiven Kafka | ~250 KiB/s, ограничено число топиков и партиций, retention 3 дня, выключается после 24 ч без трафика | 50 кликов/с по ~150 байт — с большим запасом. Перед демо прогреть |
| Upstash Redis | 500K команд/мес, 256 MB, 10K команд/с | ~135 раундов в месяц, см. расчёт |
| Render Web Service | 512 MB RAM, 0.1 CPU, засыпает через 15 мин | Cold start; 0.1 CPU может быть узким местом на TLS. Прогреть перед раундом, не деплоить во время раунда |

## Запуск локально

Нужны JDK 25 и Docker.

```bash
docker compose up -d kafka kafka-init redis   # Kafka на localhost:9094, Redis на 6379
cd backend
./gradlew bootRun                             # http://localhost:8080, профиль local
```

Фронт в режиме разработки (проксирует `/api` и `/ws` на 8080):

```bash
cd front && npm install && npm run dev        # http://localhost:5173
```

Всё в Docker (фронт собирается внутрь jar): `docker compose up --build`, затем http://localhost:8080.

Тесты (Testcontainers поднимает Kafka и Redis сам, нужен Docker):

```bash
cd backend && ./gradlew build
```

## Боты

```bash
java bots/Bots.java http://localhost:8080 5 10
java bots/Bots.java https://<app>.onrender.com 5 10
```

Боты заходят в лобби, ждут `game-start`, кликают с заданной частотой (~5 % кликов дублируются с тем же UUID), повторяют `503` с тем же UUID, а после раунда сверяют `/results` со своими `202`. В конце выводятся статусы ответов, задержки p50/p95/p99 и проверка инварианта.

## Деплой на Render

1. **Aiven Kafka:** создать топики `clicks` и `clicks.dlq` (1 партиция), скачать `ca.pem`, `service.cert`, `service.key`.
2. **Upstash Redis:** создать базу, взять host, port и password.
3. **Render:** Web Service из Dockerfile в корне репозитория. Переменные окружения:

| Переменная | Значение |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `prod` |
| `KAFKA_BOOTSTRAP_SERVERS` | `host:port` из Aiven |
| `KAFKA_CA_PEM`, `KAFKA_CERT_PEM`, `KAFKA_KEY_PEM` | содержимое PEM-файлов |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | из Upstash (`REDIS_USERNAME` по умолчанию `default`) |

Health check: `/actuator/health`.

## Нагрузочный отчёт

Заполнить после прогона ботов против Render:

| Метрика | Значение |
| --- | --- |
| Ботов × кликов/с | 5 × 10 |
| p50 / p95 / p99 `/api/click`, мс | |
| Статусы (202 / 423 / 503) | |
| Инвариант после раунда | |
| `kill -15` посреди раунда: инвариант после рестарта | |
