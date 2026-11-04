import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

/**
 * Нагрузочные боты MemeClicker. Без зависимостей, запуск (JDK 21+):
 *
 *   java bots/Bots.java [baseUrl] [ботов] [кликов/с]
 *   java bots/Bots.java http://localhost:8080 5 10
 *   java bots/Bots.java https://<app>.onrender.com 5 10
 *
 * Сценарий: join -> подписка на /ws/lobby -> все «ГОТОВ» -> старт по startAt из game-start
 * -> каждый бот кликает с заданной частотой, ~5% кликов отправляются повторно с тем же UUID
 * -> после конца раунда сверка итогов /api/round/{id}/results с числом уникальных 202.
 */
public class Bots {

    static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .executor(Executors.newVirtualThreadPerTaskExecutor())
            .build();

    static String base;

    public static void main(String[] args) throws Exception {
        base = args.length > 0 ? args[0].replaceAll("/$", "") : "http://localhost:8080";
        int bots = args.length > 1 ? Integer.parseInt(args[1]) : 5;
        int cps = args.length > 2 ? Integer.parseInt(args[2]) : 10;
        var prefix = "bot" + UUID.randomUUID().toString().substring(0, 4);

        Map<String, String> tokens = new HashMap<>();
        for (int i = 1; i <= bots; i++) {
            var nick = prefix + "-" + i;
            var resp = post("/api/lobby/join", null, "{\"nickname\":\"" + nick + "\"}");
            if (resp.statusCode() != 200) {
                throw new IllegalStateException("join " + nick + ": " + resp.statusCode() + " " + resp.body());
            }
            tokens.put(nick, field(resp.body(), "playerToken"));
        }
        System.out.printf("joined %d bots (%s-*)%n", bots, prefix);

        var gameStart = new CompletableFuture<String>();
        var wsUrl = base.replaceFirst("^http", "ws") + "/ws/lobby";
        var ws = HTTP.newWebSocketBuilder().buildAsync(URI.create(wsUrl), new WebSocket.Listener() {
            final StringBuilder buf = new StringBuilder();

            @Override
            public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
                buf.append(data);
                if (last) {
                    var msg = buf.toString();
                    buf.setLength(0);
                    if (msg.contains("\"type\":\"game-start\"")) {
                        gameStart.complete(msg);
                    }
                }
                webSocket.request(1);
                return null;
            }
        }).get(10, TimeUnit.SECONDS);

        for (var token : tokens.values()) {
            var resp = post("/api/lobby/ready", token, "");
            if (resp.statusCode() != 204) {
                System.out.println("ready: " + resp.statusCode() + " " + resp.body());
            }
        }
        var start = gameStart.get(30, TimeUnit.SECONDS);
        long receivedAt = System.currentTimeMillis();
        var roundId = field(start, "roundId");
        long startAt = Long.parseLong(field(start, "startAt"));
        long endAt = Long.parseLong(field(start, "roundEndTime"));
        long offset = Long.parseLong(field(start, "serverTime")) - receivedAt; // server - local
        ws.sendClose(WebSocket.NORMAL_CLOSURE, "bye");
        System.out.printf("round %s, start in %d ms, duration %d s%n",
                roundId, startAt - (System.currentTimeMillis() + offset), (endAt - startAt) / 1000);

        Map<String, Set<String>> accepted = new ConcurrentHashMap<>();
        Map<Integer, AtomicInteger> statuses = new ConcurrentHashMap<>();
        List<Long> latencies = Collections.synchronizedList(new ArrayList<>());
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (var e : tokens.entrySet()) {
                accepted.put(e.getKey(), ConcurrentHashMap.newKeySet());
                pool.submit(() -> {
                    sleepUntil(startAt - offset);
                    long interval = 1000L / cps;
                    long next = System.currentTimeMillis();
                    try (var clicks = Executors.newVirtualThreadPerTaskExecutor()) {
                        int n = 0;
                        while (System.currentTimeMillis() + offset < endAt) {
                            var uuid = UUID.randomUUID().toString();
                            int copies = (++n % 20 == 0) ? 2 : 1;
                            for (int c = 0; c < copies; c++) {
                                clicks.submit(() -> clickWithRetry(e.getValue(), e.getKey(), roundId, uuid,
                                        accepted, statuses, latencies));
                            }
                            next += interval;
                            sleepUntil(next);
                        }
                    }
                    return null;
                });
            }
        }

        String results = null;
        for (int i = 0; i < 120 && results == null; i++) {
            var resp = get("/api/round/" + roundId + "/results");
            if (resp.statusCode() == 200) {
                results = resp.body();
            } else {
                Thread.sleep(500);
            }
        }

        var sorted = new ArrayList<>(latencies);
        Collections.sort(sorted);
        System.out.println();
        System.out.println("HTTP статусы /api/click: " + statuses);
        if (!sorted.isEmpty()) {
            System.out.printf("задержка /api/click, мс: p50=%d p95=%d p99=%d max=%d (n=%d)%n",
                    pct(sorted, 50), pct(sorted, 95), pct(sorted, 99), sorted.getLast(), sorted.size());
        }
        if (results == null) {
            System.out.println("итоги раунда не получены за 60 с");
            System.exit(1);
        }
        var scores = new HashMap<String, Long>();
        var m = Pattern.compile("\"nickname\":\"([^\"]+)\",\"score\":(\\d+)").matcher(results);
        while (m.find()) {
            scores.put(m.group(1), Long.parseLong(m.group(2)));
        }
        boolean ok = true;
        System.out.println("бот           202-уникальных  итог  совпадает");
        for (var nick : tokens.keySet().stream().sorted().toList()) {
            long acc = accepted.get(nick).size();
            long score = scores.getOrDefault(nick, 0L);
            ok &= acc == score;
            System.out.printf("%-14s %14d %5d  %s%n", nick, acc, score, acc == score ? "да" : "НЕТ");
        }
        System.out.println("победитель: " + field(results, "winner"));
        System.out.println(ok ? "ИНВАРИАНТ ВЫПОЛНЕН: потерь и двойного счёта нет" : "ИНВАРИАНТ НАРУШЕН");
        System.exit(ok ? 0 : 2);
    }

    static void clickWithRetry(String token, String nick, String roundId, String uuid,
                               Map<String, Set<String>> accepted, Map<Integer, AtomicInteger> statuses,
                               List<Long> latencies) {
        for (int attempt = 0; attempt < 4; attempt++) {
            long t0 = System.nanoTime();
            int status;
            try {
                status = post("/api/click", token,
                        "{\"roundId\":\"" + roundId + "\",\"clickUUID\":\"" + uuid + "\"}").statusCode();
            } catch (Exception e) {
                status = -1;
            }
            latencies.add((System.nanoTime() - t0) / 1_000_000);
            statuses.computeIfAbsent(status, k -> new AtomicInteger()).incrementAndGet();
            if (status == 202) {
                accepted.get(nick).add(uuid);
                return;
            }
            if (status == 423 || status == 400 || status == 401) {
                return;
            }
            sleep(200);
        }
    }

    static HttpResponse<String> post(String path, String token, String body) throws Exception {
        var b = HttpRequest.newBuilder(URI.create(base + path))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null) {
            b.header("X-Player-Token", token);
        }
        return HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    static HttpResponse<String> get(String path) throws Exception {
        return HTTP.send(HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(10)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    static String field(String json, String name) {
        var m = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
        return m.find() ? m.group(1) : null;
    }

    static long pct(List<Long> sorted, int p) {
        return sorted.get(Math.min(sorted.size() - 1, (int) Math.ceil(p / 100.0 * sorted.size()) - 1));
    }

    static void sleepUntil(long epochMs) {
        sleep(epochMs - System.currentTimeMillis());
    }

    static void sleep(long ms) {
        if (ms <= 0) {
            return;
        }
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
