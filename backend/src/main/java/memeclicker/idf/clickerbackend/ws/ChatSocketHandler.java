package memeclicker.idf.clickerbackend.ws;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import memeclicker.idf.clickerbackend.chat.ChatSendRequest;
import memeclicker.idf.clickerbackend.chat.ChatService;
import memeclicker.idf.clickerbackend.config.Json;
import memeclicker.idf.clickerbackend.web.ApiException;

@Component
public class ChatSocketHandler extends TextWebSocketHandler {

    private static final int MAX_FRAME_CHARS = 1024;
    private static final CloseStatus MESSAGE_TOO_BIG = new CloseStatus(1009, "Message too big");

    private final WsHub hub;
    private final ChatService chat;
    private final Json json;

    public ChatSocketHandler(WsHub hub, ChatService chat, Json json) {
        this.hub = hub;
        this.chat = chat;
        this.json = json;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        hub.chat().add(session);
        hub.chat().send(session, hub.encode("chat-history", chat.history()));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        if (message.getPayloadLength() > MAX_FRAME_CHARS) {
            session.close(MESSAGE_TOO_BIG);
            return;
        }
        try {
            var request = json.read(message.getPayload(), ChatSendRequest.class);
            var text = request == null ? null : request.text();
            chat.send(token(session), text);
        } catch (ApiException e) {
            hub.chat().send(session, hub.encode("chat-error", java.util.Map.of("message", e.getMessage())));
        } catch (RuntimeException e) {
            hub.chat().send(session, hub.encode("chat-error", java.util.Map.of("message", "Некорректное сообщение")));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        hub.chat().remove(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        hub.chat().remove(session);
    }

    private static String token(WebSocketSession session) {
        var query = session.getUri() == null ? null : session.getUri().getRawQuery();
        if (query == null) return null;
        return Arrays.stream(query.split("&"))
                .map(part -> part.split("=", 2))
                .filter(pair -> pair.length == 2 && pair[0].equals("token"))
                .map(pair -> URLDecoder.decode(pair[1], StandardCharsets.UTF_8))
                .findFirst().orElse(null);
    }
}
