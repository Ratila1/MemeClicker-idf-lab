package memeclicker.idf.clickerbackend.ws;

import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import memeclicker.idf.clickerbackend.config.Json;
import memeclicker.idf.clickerbackend.lobby.LobbyService;

/** /ws/lobby carries lobby snapshots, game-start and authenticated chat messages. */
@Component
public class LobbySocketHandler extends TextWebSocketHandler {

    private static final String LAST_CHAT_SENT_AT = "lastChatSentAt";
    private static final int MAX_CHAT_LENGTH = 300;
    private static final long CHAT_INTERVAL_MS = 500;

    private final WsHub hub;
    private final LobbyService lobby;
    private final Json json;

    public LobbySocketHandler(WsHub hub, LobbyService lobby, Json json) {
        this.hub = hub;
        this.lobby = lobby;
        this.json = json;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        var decorated = hub.lobby().add(session);
        hub.lobby().send(decorated, hub.encode("lobby", lobby.snapshot()));
        lobby.activeRoundStart().ifPresent(start -> hub.lobby().send(decorated, hub.encode("game-start", start)));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            var request = json.read(message.getPayload(), ChatRequest.class);
            if (request == null || !"chat".equals(request.type()) || request.data() == null) return;
            var data = request.data();
            var nickname = lobby.nicknameForToken(data.token()).orElse(null);
            if (nickname == null || data.text() == null) return;
            var text = data.text().strip();
            if (text.isEmpty() || text.length() > MAX_CHAT_LENGTH) return;

            long now = System.currentTimeMillis();
            Object previous = session.getAttributes().get(LAST_CHAT_SENT_AT);
            if (previous instanceof Long last && now - last < CHAT_INTERVAL_MS) return;
            session.getAttributes().put(LAST_CHAT_SENT_AT, now);

            hub.lobby().broadcast(hub.encode("chat", Map.of(
                    "id", session.getId() + "-" + now,
                    "nickname", nickname,
                    "text", text,
                    "sentAt", now)));
        } catch (RuntimeException ignored) {
            // Ignore malformed/unexpected websocket messages; do not break the lobby connection.
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        hub.lobby().remove(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        hub.lobby().remove(session);
    }

    private record ChatRequest(String type, ChatData data) { }
    private record ChatData(String token, String text) { }
}
