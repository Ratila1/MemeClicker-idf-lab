package memeclicker.idf.clickerbackend.config;

import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;

/**
 * Тонкая обёртка над Jackson 3 (Spring Boot 4) для сообщений Kafka и WebSocket.
 * Свой экземпляр, чтобы не зависеть от настроек MVC-маппера.
 */
@Component
public class Json {

    private final JsonMapper mapper = JsonMapper.builder().build();

    public String write(Object value) {
        return mapper.writeValueAsString(value);
    }

    public <T> T read(String json, Class<T> type) {
        return mapper.readValue(json, type);
    }
}
