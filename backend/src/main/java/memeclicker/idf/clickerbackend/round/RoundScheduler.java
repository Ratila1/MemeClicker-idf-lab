package memeclicker.idf.clickerbackend.round;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import memeclicker.idf.clickerbackend.click.ClickEvent;
import memeclicker.idf.clickerbackend.click.ClickProducer;
import memeclicker.idf.clickerbackend.config.ClickerProperties;
import memeclicker.idf.clickerbackend.config.RedisKeys;
import memeclicker.idf.clickerbackend.leaderboard.LeaderboardService;
import memeclicker.idf.clickerbackend.lobby.GameStart;
import memeclicker.idf.clickerbackend.lobby.LobbyChangedEvent;
import memeclicker.idf.clickerbackend.ws.WsHub;

/**
 * Серверный таймер раунда:
 * startAt            -> phase = running;
 * endAt + grace      -> маркер ROUND_END в топик clicks.
 * Итоги фиксирует консьюмер, дойдя до маркера (RoundFinisher), а не этот таймер.
 */
@Component
public class RoundScheduler {

    private static final Logger log = LoggerFactory.getLogger(RoundScheduler.class);
    private static final Duration MARKER_RETRY = Duration.ofSeconds(2);

    private final RoundStateHolder rounds;
    private final StringRedisTemplate redis;
    private final RedisScript<Long> beginRoundScript;
    private final ClickProducer producer;
    private final LeaderboardService leaderboard;
    private final WsHub hub;
    private final TaskScheduler scheduler;
    private final ApplicationEventPublisher events;
    private final ClickerProperties props;

    public RoundScheduler(RoundStateHolder rounds, StringRedisTemplate redis, RedisScript<Long> beginRoundScript,
                          ClickProducer producer, LeaderboardService leaderboard, WsHub hub,
                          TaskScheduler scheduler, ApplicationEventPublisher events, ClickerProperties props) {
        this.rounds = rounds;
        this.redis = redis;
        this.beginRoundScript = beginRoundScript;
        this.producer = producer;
        this.leaderboard = leaderboard;
        this.hub = hub;
        this.scheduler = scheduler;
        this.events = events;
        this.props = props;
    }

    /** Раунд создан (все нажали «ГОТОВ»): кеш, game-start всем, таймеры. */
    public void roundCreated(RoundState round) {
        activate(round);
        var start = new GameStart(round.roundId(), round.startAt(), round.endAt(), System.currentTimeMillis());
        hub.lobby().broadcast(hub.encode("game-start", start));
        events.publishEvent(new LobbyChangedEvent());
    }

    private void activate(RoundState round) {
        rounds.set(round);
        leaderboard.roundStarted(round.roundId());
        scheduler.schedule(() -> begin(round), Instant.ofEpochMilli(round.startAt()));
        scheduler.schedule(() -> publishRoundEnd(round),
                Instant.ofEpochMilli(round.endAt() + props.roundEndGrace().toMillis()));
    }

    private void begin(RoundState round) {
        try {
            Long changed = redis.execute(beginRoundScript, List.of(RedisKeys.PHASE, RedisKeys.ROUND), round.roundId());
            if (changed != null && changed == 1L) {
                log.info("round {} is running", round.roundId());
                events.publishEvent(new LobbyChangedEvent());
            }
        } catch (RuntimeException e) {
            log.warn("cannot set phase=running for {}: {}", round.roundId(), e.toString());
        }
    }

    private void publishRoundEnd(RoundState round) {
        producer.awaitInFlight(props.clickSendTimeout().plusSeconds(1));
        if (producer.send(ClickEvent.roundEnd(round.roundId()))) {
            log.info("ROUND_END published for {}", round.roundId());
        } else {
            log.warn("ROUND_END for {} not published, retry in {}", round.roundId(), MARKER_RETRY);
            scheduler.schedule(() -> publishRoundEnd(round), Instant.now().plus(MARKER_RETRY));
        }
    }

    /**
     * Рестарт посреди раунда: восстанавливаем кеш и таймеры из Redis.
     * Если время раунда уже вышло, маркер публикуется сразу; повторный маркер
     * безопасен, фиксация итогов идемпотентна.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void recoverOnStartup() {
        try {
            var phase = redis.opsForValue().get(RedisKeys.PHASE);
            if (!"starting".equals(phase) && !"running".equals(phase)) {
                return;
            }
            Map<Object, Object> r = redis.opsForHash().entries(RedisKeys.ROUND);
            if (r.isEmpty()) {
                return;
            }
            var round = new RoundState(
                    r.get("roundId").toString(),
                    Long.parseLong(r.get("startAt").toString()),
                    Long.parseLong(r.get("endAt").toString()));
            log.info("recovering round {} (phase={})", round.roundId(), phase);
            activate(round);
        } catch (RuntimeException e) {
            log.error("round recovery failed", e);
        }
    }
}
