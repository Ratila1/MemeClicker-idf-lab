package memeclicker.idf.clickerbackend.round;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import memeclicker.idf.clickerbackend.config.RedisKeys;
import memeclicker.idf.clickerbackend.leaderboard.LeaderboardService;

/** Чтение истории матчей (запись делает finish_round.lua по маркеру ROUND_END). */
@Service
public class MatchHistoryService {

    private final StringRedisTemplate redis;
    private final LeaderboardService leaderboard;

    public MatchHistoryService(StringRedisTemplate redis, LeaderboardService leaderboard) {
        this.redis = redis;
        this.leaderboard = leaderboard;
    }

    /** Пусто, если раунда нет или маркер ROUND_END ещё не обработан. */
    public Optional<RoundResults> results(String roundId) {
        Map<Object, Object> match = redis.opsForHash().entries(RedisKeys.match(roundId));
        if (match.isEmpty()) {
            return Optional.empty();
        }
        var winner = emptyToNull(match.get("winner"));
        var entries = leaderboard.entries(roundId).stream()
                .map(e -> new RoundResults.ResultEntry(e.nickname(), e.score(), e.nickname().equals(winner)))
                .toList();
        return Optional.of(new RoundResults(roundId, winner, entries, asLong(match.get("finishedAt"))));
    }

    public List<MatchSummary> latest(int limit) {
        var ids = redis.opsForZSet().reverseRange(RedisKeys.HISTORY, 0, Math.max(0, limit - 1));
        var result = new ArrayList<MatchSummary>();
        if (ids == null) {
            return result;
        }
        for (var id : ids) {
            Map<Object, Object> m = redis.opsForHash().entries(RedisKeys.match(id));
            if (!m.isEmpty()) {
                result.add(new MatchSummary(id, emptyToNull(m.get("winner")),
                        asLong(m.get("total")), asLong(m.get("finishedAt"))));
            }
        }
        return result;
    }

    private static String emptyToNull(Object value) {
        return value == null || value.toString().isEmpty() ? null : value.toString();
    }

    private static long asLong(Object value) {
        return value == null ? 0L : (long) Double.parseDouble(value.toString());
    }
}
