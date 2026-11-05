package memeclicker.idf.clickerbackend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;

/** Все составные операции с Redis выполняются Lua-скриптами атомарно. */
@Configuration
public class RedisScripts {

    @Bean
    RedisScript<String> joinScript() {
        return script("scripts/join.lua", String.class);
    }

    @Bean
    RedisScript<String> readyScript() {
        return script("scripts/ready.lua", String.class);
    }

    @Bean
    RedisScript<Long> beginRoundScript() {
        return script("scripts/begin_round.lua", Long.class);
    }

    @Bean
    RedisScript<Long> clickScript() {
        return script("scripts/click.lua", Long.class);
    }

    @Bean
    RedisScript<Long> finishRoundScript() {
        return script("scripts/finish_round.lua", Long.class);
    }

    @Bean
    RedisScript<Long> chatSendScript() {
        return script("scripts/chat_send.lua", Long.class);
    }

    private static <T> RedisScript<T> script(String path, Class<T> type) {
        var script = new DefaultRedisScript<T>();
        script.setLocation(new ClassPathResource(path));
        script.setResultType(type);
        return script;
    }
}
