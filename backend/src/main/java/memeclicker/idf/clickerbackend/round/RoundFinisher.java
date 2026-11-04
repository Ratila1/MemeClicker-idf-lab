package memeclicker.idf.clickerbackend.round;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import memeclicker.idf.clickerbackend.config.RedisKeys;
import memeclicker.idf.clickerbackend.leaderboard.LeaderboardService;
import memeclicker.idf.clickerbackend.lobby.LobbyChangedEvent;
import memeclicker.idf.clickerbackend.ws.WsHub;

/**
 * Обработка маркера ROUND_END консьюмером. Партиция одна, поэтому к этому
 * моменту все клики раунда уже учтены: итоги окончательные.
 */
@Component
public class RoundFinisher {

    private static final Logger log = LoggerFactory.getLogger(RoundFinisher.class);

    private final StringRedisTemplate redis;
    private final RedisScript<Long> finishRoundScript;
    private final RoundStateHolder rounds;
    private final LeaderboardService leaderboard;
    private final WsHub hub;
    private final ApplicationEventPublisher events;

    public RoundFinisher(StringRedisTemplate redis, RedisScript<Long> finishRoundScript, RoundStateHolder rounds,
                         LeaderboardService leaderboard, WsHub hub, ApplicationEventPublisher events) {
        this.redis = redis;
        this.finishRoundScript = finishRoundScript;
        this.rounds = rounds;
        this.leaderboard = leaderboard;
        this.hub = hub;
        this.events = events;
    }

    public void finish(String roundId) {
        if (roundId == null) {
            return;
        }
        Long written = redis.execute(finishRoundScript,
                List.of(RedisKeys.leaderboard(roundId), RedisKeys.match(roundId), RedisKeys.HISTORY,
                        RedisKeys.PHASE, RedisKeys.ROUND),
                roundId, Long.toString(System.currentTimeMillis()));
        log.info("round {} finished (first time: {})", roundId, written != null && written == 1L);
        rounds.clearIf(roundId);
        leaderboard.roundFinished(roundId);
        hub.leaderboard().broadcast(hub.encode("round-end", Map.of("roundId", roundId)));
        events.publishEvent(new LobbyChangedEvent());
    }
}
