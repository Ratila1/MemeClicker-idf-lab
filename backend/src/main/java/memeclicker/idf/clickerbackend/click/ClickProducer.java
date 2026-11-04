package memeclicker.idf.clickerbackend.click;

import java.time.Duration;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import memeclicker.idf.clickerbackend.config.ClickerProperties;
import memeclicker.idf.clickerbackend.config.Json;

/**
 * Отправка в Kafka с ожиданием подтверждения брокера (acks=all).
 * Блокирующий .get() в виртуальном потоке и ограниченный buffer.memory
 * дают естественный backpressure: если Kafka не успевает, клиент получает 503,
 * а не растёт очередь в памяти.
 */
@Component
public class ClickProducer {

    private static final Logger log = LoggerFactory.getLogger(ClickProducer.class);

    private final KafkaTemplate<String, String> kafka;
    private final Json json;
    private final ClickerProperties props;
    /** Запросы /api/click, прошедшие проверку окна раунда, но ещё не получившие ответ. */
    private final AtomicInteger inFlight = new AtomicInteger();

    public ClickProducer(KafkaTemplate<String, String> kafka, Json json, ClickerProperties props) {
        this.kafka = kafka;
        this.json = json;
        this.props = props;
    }

    public void enter() {
        inFlight.incrementAndGet();
    }

    public void exit() {
        inFlight.decrementAndGet();
    }

    /**
     * Ждёт, пока завершатся все клики, уже прошедшие валидацию. Вызывается перед
     * публикацией ROUND_END, чтобы маркер встал в партицию после них.
     */
    public void awaitInFlight(Duration max) {
        long deadline = System.nanoTime() + max.toNanos();
        while (inFlight.get() > 0 && System.nanoTime() < deadline) {
            try {
                Thread.sleep(20);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        if (inFlight.get() > 0) {
            log.warn("ROUND_END: {} click requests still in flight after {}", inFlight.get(), max);
        }
    }

    /** @return true, если брокер подтвердил запись за clickSendTimeout. */
    public boolean send(ClickEvent event) {
        try {
            kafka.send(props.clicksTopic(), event.roundId(), json.write(event))
                    .get(props.clickSendTimeout().toMillis(), TimeUnit.MILLISECONDS);
            return true;
        } catch (TimeoutException | ExecutionException | RuntimeException e) {
            log.warn("kafka send failed ({}): {}", event.type(), e.toString());
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
