package memeclicker.idf.clickerbackend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

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
 * Сценарии "плохой погоды" на Testcontainers (Kafka + Redis), тот же контекст, что у
 * GameFlowIntegrationTest. Везде проверяется один инвариант ТЗ:
 * счёт игрока = число уникальных clickUUID, на которые сервер ответил 202.
 */
class ResilienceIntegrationTest extends AbstractIntegrationTest {

    private static final int PLAYERS = 5;

    @Autowired
    Environment env;
    @Autowired
    Json json;
    @Autowired
    StringRedisTemplate redis;

    final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    record Round(String roundId, long startAt, Map<String, String> tokens) {
    }

    @BeforeEach
    void cleanLobby() {
        redis.delete(List.of(RedisKeys.PLAYERS, RedisKeys.READY, RedisKeys.PHASE, RedisKeys.TOKENS, RedisKeys.ROUND));
    }

    /** Redis "замирает" на 1.5 с посреди раунда: клики не теряются, итог сходится. */
    @Test
    void redisStallMidRoundKeepsInvariant() throws Exception {
        var round = startRound();
        var accepted = newAccepted(round);
        var docker = REDIS.getDockerClient();

        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (var entry : round.tokens().entrySet()) {
                pool.submit(() -> {
                    for (int i = 0; i < 100; i++) {
                        var uuid = UUID.randomUUID().toString();
                        if (click(entry.getValue(), round.roundId(), uuid) == 202) {
                            accepted.get(entry.getKey()).add(uuid);
                        }
                        Thread.sleep(30);
                    }
                    return null;
                });
            }
            pool.submit(() -> {
                Thread.sleep(1000);
                docker.pauseContainerCmd(REDIS.getContainerId()).exec();
                try {
                    Thread.sleep(1500);
                } finally {
                    docker.unpauseContainerCmd(REDIS.getContainerId()).exec();
                }
                return null;
            });
        }

        assertInvariant(round, accepted);
    }

    /** Один и тот же clickUUID шлют 10 потоков одновременно: засчитан ровно один раз. */
    @Test
    void duplicateStormCountsEachUuidOnce() throws Exception {
        var round = startRound();
        var accepted = newAccepted(round);

        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            // p1: 20 uuid, каждый уходит 10 раз параллельно
            pool.submit(() -> {
                for (int i = 0; i < 20; i++) {
                    var uuid = UUID.randomUUID().toString();
                    try (var inner = Executors.newVirtualThreadPerTaskExecutor()) {
                        for (int s = 0; s < 10; s++) {
                            inner.submit(() -> {
                                if (click(round.tokens().get("p1"), round.roundId(), uuid) == 202) {
                                    accepted.get("p1").add(uuid);
                                }
                                return null;
                            });
                        }
                    }
                    Thread.sleep(40);
                }
                return null;
            });
            // остальные: обычные клики
            for (var entry : round.tokens().entrySet()) {
                if (entry.getKey().equals("p1")) {
                    continue;
                }
                pool.submit(() -> {
                    for (int i = 0; i < 20; i++) {
                        var uuid = UUID.randomUUID().toString();
                        if (click(entry.getValue(), round.roundId(), uuid) == 202) {
                            accepted.get(entry.getKey()).add(uuid);
                        }
                        Thread.sleep(50);
                    }
                    return null;
                });
            }
        }

        assertThat(accepted.get("p1").size()).isLessThanOrEqualTo(20);
        assertInvariant(round, accepted);
    }

    // ---------- вспомогательное ----------

    private Round startRound() throws Exception {
        var tokens = new HashMap<String, String>();
        for (int i = 1; i <= PLAYERS; i++) {
            var resp = post("/api/lobby/join", null, "{\"nickname\":\"p" + i + "\"}");
            assertThat(resp.statusCode()).isEqualTo(200);
            tokens.put("p" + i, json.read(resp.body(), JoinResponse.class).playerToken());
        }
        for (var token : tokens.values()) {
            assertThat(post("/api/lobby/ready", token, "").statusCode()).isEqualTo(204);
        }
        var roundId = (String) redis.opsForHash().get(RedisKeys.ROUND, "roundId");
        long startAt = Long.parseLong((String) redis.opsForHash().get(RedisKeys.ROUND, "startAt"));
        assertThat(roundId).isNotNull();
        Thread.sleep(Math.max(0, startAt - System.currentTimeMillis()) + 100);
        return new Round(roundId, startAt, tokens);
    }

    private Map<String, Set<String>> newAccepted(Round round) {
        Map<String, Set<String>> accepted = new ConcurrentHashMap<>();
        round.tokens().keySet().forEach(p -> accepted.put(p, ConcurrentHashMap.newKeySet()));
        return accepted;
    }

    private void assertInvariant(Round round, Map<String, Set<String>> accepted) throws Exception {
        var results = awaitResults(round.roundId(), Duration.ofSeconds(30));
        Map<String, Long> scores = new HashMap<>();
        results.entries().forEach(e -> scores.put(e.nickname(), e.score()));
        for (var player : round.tokens().keySet()) {
            long expected = accepted.get(player).size();
            assertThat(expected).as("accepted clicks of %s", player).isPositive();
            assertThat(scores.getOrDefault(player, 0L)).as("score of %s", player).isEqualTo(expected);
        }
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
