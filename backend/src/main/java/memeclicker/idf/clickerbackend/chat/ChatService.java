package memeclicker.idf.clickerbackend.chat;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import memeclicker.idf.clickerbackend.config.Json;
import memeclicker.idf.clickerbackend.config.RedisKeys;
import memeclicker.idf.clickerbackend.lobby.PlayerTokens;
import memeclicker.idf.clickerbackend.web.ApiException;
import memeclicker.idf.clickerbackend.ws.WsHub;

@Service
public class ChatService {

    public static final int MAX_HISTORY = 200;
    private static final int MAX_TEXT_LENGTH = 240;
    private static final long WINDOW_SECONDS = 10;
    private static final long WINDOW_MESSAGE_LIMIT = 5;
    private static final long COOLDOWN_MILLIS = 1200;
    private static final long LAST_TEXT_TTL_SECONDS = 60;

    private final StringRedisTemplate redis;
    private final RedisScript<Long> chatSendScript;
    private final PlayerTokens tokens;
    private final Json json;
    private final WsHub hub;

    public ChatService(StringRedisTemplate redis, @Qualifier("chatSendScript") RedisScript<Long> chatSendScript,
                       PlayerTokens tokens, Json json, WsHub hub) {
        this.redis = redis;
        this.chatSendScript = chatSendScript;
        this.tokens = tokens;
        this.json = json;
        this.hub = hub;
    }

    public List<ChatMessage> history() {
        var stored = redis.opsForList().range(RedisKeys.CHAT_HISTORY, 0, MAX_HISTORY - 1L);
        if (stored == null || stored.isEmpty()) return List.of();
        var result = new ArrayList<ChatMessage>(stored.size());
        for (var value : stored) {
            try {
                result.add(json.read(value, ChatMessage.class));
            } catch (RuntimeException ignored) {
                // Skip malformed persisted messages without failing the chat connection.
            }
        }
        Collections.reverse(result);
        return result;
    }

    public ChatMessage send(String token, String rawText) {
        var nickname = tokens.resolve(token).orElseThrow(ApiException::unauthorized);
        var text = rawText == null ? "" : rawText.strip();
        if (text.isEmpty() || text.length() > MAX_TEXT_LENGTH) {
            throw ApiException.badRequest("Сообщение должно содержать от 1 до 240 символов");
        }

        var message = new ChatMessage(UUID.randomUUID().toString(), nickname, text, System.currentTimeMillis());
        Long result = redis.execute(chatSendScript,
                List.of(RedisKeys.CHAT_HISTORY, RedisKeys.chatWindow(token),
                        RedisKeys.chatLastSent(token), RedisKeys.chatLastText(token)),
                json.write(message), Integer.toString(MAX_HISTORY), Long.toString(WINDOW_SECONDS),
                Long.toString(WINDOW_MESSAGE_LIMIT), Long.toString(COOLDOWN_MILLIS),
                Long.toString(LAST_TEXT_TTL_SECONDS), text);

        if (result == null || result == 0L) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "chat_rate_limited",
                    "Слишком часто отправляете сообщения. Подождите немного.");
        }
        if (result < 0) {
            throw ApiException.conflict("chat_duplicate", "Не отправляйте одно и то же сообщение подряд");
        }
        hub.chat().broadcast(hub.encode("chat-message", message));
        return message;
    }

    /** Keep chat through the round and clear it only after the results are finalized. */
    public void clearAfterRound() {
        redis.delete(RedisKeys.CHAT_HISTORY);
        hub.chat().broadcast(hub.encode("chat-cleared", "{}"));
    }
}
