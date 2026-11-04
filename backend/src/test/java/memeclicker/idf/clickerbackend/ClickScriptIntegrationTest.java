package memeclicker.idf.clickerbackend;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import memeclicker.idf.clickerbackend.config.RedisKeys;

/** Дубликат clickUUID (например, редоставка из Kafka после рестарта) не увеличивает счёт. */
class ClickScriptIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    StringRedisTemplate redis;
    @Autowired
    RedisScript<Long> clickScript;

    @Test
    void duplicateClickCountedOnce() {
        var round = "r-" + UUID.randomUUID();
        var uuid = UUID.randomUUID().toString();
        var keys = List.of(RedisKeys.dedup(round, uuid), RedisKeys.leaderboard(round));

        assertThat(redis.execute(clickScript, keys, "alice", "86400")).isEqualTo(1L);
        assertThat(redis.execute(clickScript, keys, "alice", "86400")).isEqualTo(0L);

        assertThat(redis.opsForZSet().score(RedisKeys.leaderboard(round), "alice")).isEqualTo(1.0);
        assertThat(redis.getExpire(RedisKeys.dedup(round, uuid))).isPositive();
    }
}
