package memeclicker.idf.clickerbackend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;

/** Redis composite operations are executed atomically through Lua scripts. */
@Configuration
public class RedisScripts {

    @Bean
    RedisScript<String> joinScript() { return script("scripts/join.lua", String.class); }

    @Bean
    RedisScript<String> readyScript() { return script("scripts/ready.lua", String.class); }

    @Bean
    RedisScript<Long> beginRoundScript() { return script("scripts/begin_round.lua", Long.class); }

    @Bean
    RedisScript<Long> clickScript() { return script("scripts/click.lua", Long.class); }

    @Bean
    RedisScript<Long> finishRoundScript() { return script("scripts/finish_round.lua", Long.class); }

    @Bean
    RedisScript<Long> leaveScript() { return script("scripts/leave.lua", Long.class); }

    private static <T> RedisScript<T> script(String path, Class<T> type) {
        var script = new DefaultRedisScript<T>();
        script.setLocation(new ClassPathResource(path));
        script.setResultType(type);
        return script;
    }
}
