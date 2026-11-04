package memeclicker.idf.clickerbackend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import memeclicker.idf.clickerbackend.ws.LeaderboardSocketHandler;
import memeclicker.idf.clickerbackend.ws.LobbySocketHandler;

/** Чистый WebSocket без STOMP: фронт использует нативный WebSocket и JSON {type, data}. */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final LobbySocketHandler lobbyHandler;
    private final LeaderboardSocketHandler leaderboardHandler;

    public WebSocketConfig(LobbySocketHandler lobbyHandler, LeaderboardSocketHandler leaderboardHandler) {
        this.lobbyHandler = lobbyHandler;
        this.leaderboardHandler = leaderboardHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(lobbyHandler, "/ws/lobby").setAllowedOriginPatterns("*");
        registry.addHandler(leaderboardHandler, "/ws/leaderboard").setAllowedOriginPatterns("*");
    }
}
