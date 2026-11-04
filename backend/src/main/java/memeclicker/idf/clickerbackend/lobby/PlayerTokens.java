package memeclicker.idf.clickerbackend.lobby;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import memeclicker.idf.clickerbackend.config.RedisKeys;

/**
 * playerToken -> nickname. Токены хранятся в Redis, но кешируются в памяти,
 * чтобы клики не тратили лимит команд Upstash.
 */
@Component
public class PlayerTokens {

    private final StringRedisTemplate redis;
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public PlayerTokens(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void remember(String token, String nickname) {
        cache.put(token, nickname);
    }

    public Optional<String> resolve(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        var cached = cache.get(token);
        if (cached != null) {
            return Optional.of(cached);
        }
        Object fromRedis = redis.opsForHash().get(RedisKeys.TOKENS, token);
        if (fromRedis == null) {
            return Optional.empty();
        }
        var nickname = fromRedis.toString();
        cache.put(token, nickname);
        return Optional.of(nickname);
    }

    public void clear() {
        cache.clear();
    }
}
