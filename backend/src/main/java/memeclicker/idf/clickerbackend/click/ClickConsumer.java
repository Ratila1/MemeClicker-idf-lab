package memeclicker.idf.clickerbackend.click;

import java.util.List;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import memeclicker.idf.clickerbackend.config.ClickerProperties;
import memeclicker.idf.clickerbackend.config.Json;
import memeclicker.idf.clickerbackend.config.RedisKeys;
import memeclicker.idf.clickerbackend.leaderboard.LeaderboardService;
import memeclicker.idf.clickerbackend.round.RoundFinisher;

@Component
public class ClickConsumer {

    private static final Logger log = LoggerFactory.getLogger(ClickConsumer.class);

    private final StringRedisTemplate redis;
    private final RedisScript<Long> clickScript;
    private final LeaderboardService leaderboard;
    private final RoundFinisher finisher;
    private final Json json;
    private final ClickerProperties props;

    public ClickConsumer(StringRedisTemplate redis,
                         @Qualifier("clickScript") RedisScript<Long> clickScript,
                         LeaderboardService leaderboard, RoundFinisher finisher,
                         Json json, ClickerProperties props) {
        this.redis = redis;
        this.clickScript = clickScript;
        this.leaderboard = leaderboard;
        this.finisher = finisher;
        this.json = json;
        this.props = props;
    }

    @KafkaListener(topics = "${clicker.clicks-topic:clicks}", concurrency = "1")
    public void onMessage(ConsumerRecord<String, String> record, Acknowledgment ack) {
        var event = parse(record.value());
        switch (event.type()) {
            case ClickEvent.CLICK -> handleClick(event);
            case ClickEvent.ROUND_END -> finisher.finish(event.roundId());
            default -> throw new MalformedEventException("unknown type " + event.type(), null);
        }
        ack.acknowledge();
    }

    private void handleClick(ClickEvent e) {
        if (e.roundId() == null || e.nickname() == null || e.clickUUID() == null
                || e.receivedAt() == null || e.endAt() == null) {
            throw new MalformedEventException("incomplete click " + e, null);
        }
        if (e.receivedAt() > e.endAt()) {
            log.info("late click ignored: round={} uuid={}", e.roundId(), e.clickUUID());
            return;
        }
        Long counted = redis.execute(clickScript,
                List.of(RedisKeys.dedup(e.roundId(), e.clickUUID()), RedisKeys.leaderboard(e.roundId())),
                e.nickname(), Long.toString(props.dedupTtlSeconds()));
        if (counted != null && counted == 1L) {
            leaderboard.markDirty(e.roundId());
        }
    }

    private ClickEvent parse(String value) {
        try {
            var event = json.read(value, ClickEvent.class);
            if (event == null || event.type() == null) {
                throw new MalformedEventException("no type: " + value, null);
            }
            return event;
        } catch (MalformedEventException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new MalformedEventException("cannot parse: " + value, e);
        }
    }
}
