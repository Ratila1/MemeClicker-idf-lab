package memeclicker.idf.clickerbackend;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Общие контейнеры Kafka (KRaft) и Redis на все тесты: поднимаются один раз на JVM.
 * Раунд укорочен, чтобы тест шёл секунды, а не минуту.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "clicker.start-delay=500ms",
                "clicker.round-duration=4s",
                "clicker.round-end-grace=500ms"
        })
public abstract class AbstractIntegrationTest {

    static final KafkaContainer KAFKA = new KafkaContainer(DockerImageName.parse("apache/kafka:3.8.1"));
    // 3.9.0 не подходит: её kafka-storage format валидирует advertised.listeners
    // до того, как Testcontainers их подставит, и падает на 0.0.0.0.git diff backend/src/test

    @SuppressWarnings("resource")
    static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
            .withExposedPorts(6379);

    static {
        KAFKA.start();
        REDIS.start();
    }

    @DynamicPropertySource
    static void containers(DynamicPropertyRegistry registry) {
        registry.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }
}
