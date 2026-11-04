package memeclicker.idf.clickerbackend.ws;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import memeclicker.idf.clickerbackend.leaderboard.LeaderboardService;

/** /ws/leaderboard: при подключении отправляет текущий лидерборд, дальше тики раз в 100 мс. */
@Component
public class LeaderboardSocketHandler extends TextWebSocketHandler {

    private final WsHub hub;
    private final LeaderboardService leaderboard;

    public LeaderboardSocketHandler(WsHub hub, LeaderboardService leaderboard) {
        this.hub = hub;
        this.leaderboard = leaderboard;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        var decorated = hub.leaderboard().add(session);
        hub.leaderboard().send(decorated, hub.encode("leaderboard", leaderboard.currentEntries()));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        hub.leaderboard().remove(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        hub.leaderboard().remove(session);
    }
}
