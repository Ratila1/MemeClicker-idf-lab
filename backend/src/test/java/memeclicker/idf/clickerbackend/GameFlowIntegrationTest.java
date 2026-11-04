package memeclicker.idf.clickerbackend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.data.redis.core.StringRedisTemplate;

import memeclicker.idf.clickerbackend.config.Json;
import memeclicker.idf.clickerbackend.config.RedisKeys;
import memeclicker.idf.clickerbackend.lobby.JoinResponse;
import memeclicker.idf.clickerbackend.round.RoundResults;

/**
 * Полный цикл на Testcontainers (Kafka + Redis): 5 игроков, атомарный старт,
 * клики с дублями UUID, маркер ROUND_END, история матчей.
 * Проверяется инвариант из п. 5 ТЗ: счёт игрока = число уникальных clickUUID с ответом 202.
 */
class GameFlowIntegrationTest extends AbstractIntegrationTest {

    private static final int PLAYERS = 5;
    private static final int CLICKS_PER_PLAYER = 30;

    @Autowired
    Environment env;
    @Autowired
    Json json;
    @Autowired
    StringRedisTemplate redis;

    @BeforeEach
    void cleanLobby() {
        redis.delete(List.of(RedisKeys.PLAYERS, RedisKeys.READY, RedisKeys.PHASE, RedisKeys.TOKENS, RedisKeys.ROUND));
    }

    final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @Test
    void fullRoundKeepsInvariant() throws Exception {
        // --- лобби ---
        var tokens = new HashMap<String, String>();
        for (int i = 1; i <= PLAYERS; i++) {
            var resp = post("/api/lobby/join", null, "{\"nickname\":\"p" + i + "\"}");
            assertThat(resp.statusCode()).isEqualTo(200);
            tokens.put("p" + i, json.read(resp.body(), JoinResponse.class).playerToken());
        }
        assertThat(post("/api/lobby/join", null, "{\"nickname\":\"p1\"}").statusCode()).isEqualTo(409);
        assertThat(post("/api/lobby/ready", "bad-token", "").statusCode()).isEqualTo(401);

        // Все нажимают «ГОТОВ» одновременно: должен стартовать ровно один раунд.
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = new ArrayList<Future<Integer>>();
            for (var token : tokens.values()) {
                futures.add(pool.submit(() -> post("/api/lobby/ready", token, "").statusCode()));
            }
            for (var f : futures) {
                assertThat(f.get()).isEqualTo(204);
            }
        }
        assertThat(redis.opsForValue().get(RedisKeys.PHASE)).isEqualTo("starting");
        var roundId = (String) redis.opsForHash().get(RedisKeys.ROUND, "roundId");
        long startAt = Long.parseLong((String) redis.opsForHash().get(RedisKeys.ROUND, "startAt"));
        assertThat(roundId).isNotNull();

        // До startAt клик не принимается.
        assertThat(click(tokens.get("p1"), roundId, UUID.randomUUID().toString())).isEqualTo(423);
        // Новый игрок во время раунда: 423.
        assertThat(post("/api/lobby/join", null, "{\"nickname\":\"late\"}").statusCode()).isEqualTo(423);

        Thread.sleep(Math.max(0, startAt - System.currentTimeMillis()) + 100);

        assertThat(click(tokens.get("p1"), roundId, "not-a-uuid")).isEqualTo(400);
        assertThat(click(tokens.get("p1"), "other-round", UUID.randomUUID().toString())).isEqualTo(423);

        // --- клики: каждый игрок параллельно, каждый 3-й клик отправляется дважды ---
        Map<String, Set<String>> accepted = new ConcurrentHashMap<>();
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (var entry : tokens.entrySet()) {
                accepted.put(entry.getKey(), ConcurrentHashMap.newKeySet());
                pool.submit(() -> {
                    for (int i = 0; i < CLICKS_PER_PLAYER; i++) {
                        var uuid = UUID.randomUUID().toString();
                        int sends = i % 3 == 0 ? 2 : 1;
                        for (int s = 0; s < sends; s++) {
                            if (click(entry.getValue(), roundId, uuid) == 202) {
                                accepted.get(entry.getKey()).add(uuid);
                            }
                        }
                        Thread.sleep(20);
                    }
                    return null;
                });
            }
        }

        // --- конец раунда: итоги появляются только после маркера ROUND_END ---
        RoundResults results = awaitResults(roundId, Duration.ofSeconds(20));
        assertThat(click(tokens.get("p1"), roundId, UUID.randomUUID().toString())).isEqualTo(423);
        assertThat(redis.opsForValue().get(RedisKeys.PHASE)).isEqualTo("finished");

        Map<String, Long> scores = new HashMap<>();
        results.entries().forEach(e -> scores.put(e.nickname(), e.score()));
        long total = 0;
        for (var player : tokens.keySet()) {
            long expected = accepted.get(player).size();
            assertThat(expected).as("accepted clicks of %s", player).isPositive();
            assertThat(scores.getOrDefault(player, 0L)).as("score of %s", player).isEqualTo(expected);
            total += expected;
        }
        assertThat(results.winner()).isNotNull();
        assertThat(results.entries().getFirst().winner()).isTrue();

        // История матчей
        var matches = get("/api/matches");
        assertThat(matches.statusCode()).isEqualTo(200);
        assertThat(matches.body()).contains(roundId).contains("\"total\":" + total);

        // После раунда лобби открывается заново, старый ник снова свободен.
        assertThat(post("/api/lobby/join", null, "{\"nickname\":\"p1\"}").statusCode()).isEqualTo(200);
        assertThat(redis.opsForValue().get(RedisKeys.PHASE)).isEqualTo("waiting");
    }

    private RoundResults awaitResults(String roundId, Duration timeout) throws Exception {
        long deadline = System.currentTimeMillis() + timeout.toMillis();
        while (System.currentTimeMillis() < deadline) {
            var resp = get("/api/round/" + roundId + "/results");
            if (resp.statusCode() == 200) {
                return json.read(resp.body(), RoundResults.class);
            }
            assertThat(resp.statusCode()).isEqualTo(404);
            Thread.sleep(200);
        }
        throw new AssertionError("round results not ready in " + timeout);
    }

    private int click(String token, String roundId, String uuid) throws Exception {
        return post("/api/click", token, "{\"roundId\":\"" + roundId + "\",\"clickUUID\":\"" + uuid + "\"}")
                .statusCode();
    }

    private HttpResponse<String> post(String path, String token, String body) throws Exception {
        var builder = HttpRequest.newBuilder(uri(path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null) {
            builder.header("X-Player-Token", token);
        }
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> get(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + env.getProperty("local.server.port") + path);
    }
}
