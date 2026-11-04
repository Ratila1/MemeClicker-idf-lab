package memeclicker.idf.clickerbackend.lobby;

import java.util.List;

public record LobbySnapshot(String phase, List<PlayerInfo> players, int minPlayers) {
}
