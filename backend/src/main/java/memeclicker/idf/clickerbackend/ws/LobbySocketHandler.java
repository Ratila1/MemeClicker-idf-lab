package memeclicker.idf.clickerbackend.ws;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import memeclicker.idf.clickerbackend.lobby.LobbyService;

/**
 * /ws/lobby: при подключении отправляет снимок лобби, а если раунд уже
 * стартует или идёт, ещё и game-start (переподключение после обновления страницы).
 * Входящие сообщения игнорируются.
 */
@Component
public class LobbySocketHandler extends TextWebSocketHandler {

    private final WsHub hub;
    private final LobbyService lobby;

    public LobbySocketHandler(WsHub hub, LobbyService lobby) {
        this.hub = hub;
        this.lobby = lobby;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        var decorated = hub.lobby().add(session);
        hub.lobby().send(decorated, hub.encode("lobby", lobby.snapshot()));
        lobby.activeRoundStart().ifPresent(start -> hub.lobby().send(decorated, hub.encode("game-start", start)));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        hub.lobby().remove(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        hub.lobby().remove(session);
    }
}
