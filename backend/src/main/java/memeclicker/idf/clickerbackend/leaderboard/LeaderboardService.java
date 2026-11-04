package memeclicker.idf.clickerbackend.leaderboard;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import memeclicker.idf.clickerbackend.config.RedisKeys;
import memeclicker.idf.clickerbackend.ws.WsHub;

/**
 * Лидерборд из Redis ZSET. Изменения накапливаются флагом dirty, снимок
 * рассылается не чаще раза в 100 мс и только если что-то изменилось
 * (не по сообщению на клик и без лишних команд Upstash).
 */
@Service
public class LeaderboardService {

    private final StringRedisTemplate redis;
    private final WsHub hub;
    private final AtomicBoolean dirty = new AtomicBoolean();
    private volatile String roundId;

    public LeaderboardService(StringRedisTemplate redis, WsHub hub) {
        this.redis = redis;
        this.hub = hub;
    }

    public void roundStarted(String roundId) {
        this.roundId = roundId;
        dirty.set(true);
    }

    public void markDirty(String roundId) {
        if (roundId.equals(this.roundId)) {
            dirty.set(true);
        }
    }

    @Scheduled(fixedRate = 100)
    public void tick() {
        var id = roundId;
        if (id == null || hub.leaderboard().size() == 0 || !dirty.getAndSet(false)) {
            return;
        }
        hub.leaderboard().broadcast(hub.encode("leaderboard", entries(id)));
    }

    /** Финальный снимок по маркеру ROUND_END. */
    public void roundFinished(String finishedRoundId) {
        if (finishedRoundId.equals(roundId)) {
            dirty.set(false);
            hub.leaderboard().broadcast(hub.encode("leaderboard", entries(finishedRoundId)));
        }
    }

    public List<LeaderboardEntry> currentEntries() {
        var id = roundId;
        return id == null ? List.of() : entries(id);
    }

    public List<LeaderboardEntry> entries(String id) {
        var rows = redis.opsForZSet().reverseRangeWithScores(RedisKeys.leaderboard(id), 0, -1);
        var result = new ArrayList<LeaderboardEntry>();
        if (rows != null) {
            for (var row : rows) {
                if (row.getValue() != null && row.getScore() != null) {
                    result.add(new LeaderboardEntry(row.getValue(), row.getScore().longValue()));
                }
            }
        }
        return result;
    }
}
