package memeclicker.idf.clickerbackend.ws;

import org.springframework.stereotype.Component;

import memeclicker.idf.clickerbackend.config.Json;

/** Точка рассылки для сервисов: каналы /ws/lobby и /ws/leaderboard. */
@Component
public class WsHub {

    private final WsChannel lobby = new WsChannel("lobby");
    private final WsChannel leaderboard = new WsChannel("leaderboard");
    private final Json json;

    public WsHub(Json json) {
        this.json = json;
    }

    public WsChannel lobby() {
        return lobby;
    }

    public WsChannel leaderboard() {
        return leaderboard;
    }

    public String encode(String type, Object data) {
        return json.write(new WsMessage(type, data));
    }
}
