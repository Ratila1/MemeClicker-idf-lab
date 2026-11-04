package memeclicker.idf.clickerbackend.lobby;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import memeclicker.idf.clickerbackend.ws.WsHub;

/**
 * На любое изменение лобби перечитывает состояние из Redis и рассылает снимок
 * всем сессиям /ws/lobby. Работает на одном инстансе; для нескольких нужен Redis Pub/Sub.
 */
@Component
public class LobbyBroadcaster {

    private final LobbyService lobby;
    private final WsHub hub;

    public LobbyBroadcaster(LobbyService lobby, WsHub hub) {
        this.lobby = lobby;
        this.hub = hub;
    }

    @EventListener
    public void onLobbyChanged(LobbyChangedEvent event) {
        if (hub.lobby().size() == 0) {
            return;
        }
        hub.lobby().broadcast(hub.encode("lobby", lobby.snapshot()));
    }
}
