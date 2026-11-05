package memeclicker.idf.clickerbackend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import memeclicker.idf.clickerbackend.ws.ChatSocketHandler;
import memeclicker.idf.clickerbackend.ws.LeaderboardSocketHandler;
import memeclicker.idf.clickerbackend.ws.LobbySocketHandler;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final LobbySocketHandler lobbyHandler;
    private final LeaderboardSocketHandler leaderboardHandler;
    private final ChatSocketHandler chatHandler;

    public WebSocketConfig(LobbySocketHandler lobbyHandler, LeaderboardSocketHandler leaderboardHandler,
                           ChatSocketHandler chatHandler) {
        this.lobbyHandler = lobbyHandler;
        this.leaderboardHandler = leaderboardHandler;
        this.chatHandler = chatHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(lobbyHandler, "/ws/lobby").setAllowedOriginPatterns("*");
        registry.addHandler(leaderboardHandler, "/ws/leaderboard").setAllowedOriginPatterns("*");
        registry.addHandler(chatHandler, "/ws/chat").setAllowedOriginPatterns("*");
    }
}
