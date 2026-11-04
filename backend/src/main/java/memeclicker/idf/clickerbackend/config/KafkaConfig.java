package memeclicker.idf.clickerbackend.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.common.TopicPartition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.CommonErrorHandler;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

import memeclicker.idf.clickerbackend.click.MalformedEventException;

@Configuration
public class KafkaConfig {

    /**
     * Ошибка в листенере (например, Redis недоступен): офсет не коммитится,
     * запись перечитывается. После {@code consumerMaxRetries} повторов запись
     * уходит в DLQ и коммитится, чтобы не блокировать единственную партицию.
     */
    @Bean
    CommonErrorHandler kafkaErrorHandler(KafkaTemplate<String, String> template, ClickerProperties props) {
        var recoverer = new DeadLetterPublishingRecoverer(template,
                (record, ex) -> new TopicPartition(props.dlqTopic(), -1));
        var handler = new DefaultErrorHandler(recoverer, new FixedBackOff(500L, props.consumerMaxRetries()));
        handler.addNotRetryableExceptions(MalformedEventException.class);
        return handler;
    }

    /** Локально и в тестах топики создаются автоматически; на Aiven создаются в консоли. */
    @Bean
    @ConditionalOnProperty(name = "clicker.create-topics", havingValue = "true", matchIfMissing = true)
    NewTopic clicksTopic(ClickerProperties props) {
        return TopicBuilder.name(props.clicksTopic()).partitions(1).replicas(1).build();
    }

    @Bean
    @ConditionalOnProperty(name = "clicker.create-topics", havingValue = "true", matchIfMissing = true)
    NewTopic dlqTopic(ClickerProperties props) {
        return TopicBuilder.name(props.dlqTopic()).partitions(1).replicas(1).build();
    }
}
