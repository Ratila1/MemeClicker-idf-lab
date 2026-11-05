package memeclicker.idf.clickerbackend.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("clicker")
public record ClickerProperties(
        @DefaultValue("5") int minPlayers,
        @DefaultValue("5s") Duration startDelay,
        @DefaultValue("60s") Duration roundDuration,
        @DefaultValue("1s") Duration roundEndGrace,
        @DefaultValue("2s") Duration clickSendTimeout,
        @DefaultValue("86400") long dedupTtlSeconds,
        @DefaultValue("3") int consumerMaxRetries,
        @DefaultValue("clicks") String clicksTopic,
        @DefaultValue("clicks.dlq") String dlqTopic,
        @DefaultValue("true") boolean createTopics
) { }
