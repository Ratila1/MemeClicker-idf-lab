package memeclicker.idf.clickerbackend.lobby;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lobby")
public class LobbyController {

    private final LobbyService lobby;

    public LobbyController(LobbyService lobby) {
        this.lobby = lobby;
    }

    @PostMapping("/join")
    public JoinResponse join(@RequestBody JoinRequest request) {
        return new JoinResponse(lobby.join(request.nickname()));
    }

    /** 204 без тела: фронт не парсит JSON только у 204. */
    @PostMapping("/ready")
    public ResponseEntity<Void> ready(@RequestHeader("X-Player-Token") String token) {
        lobby.ready(token);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public LobbySnapshot snapshot() {
        return lobby.snapshot();
    }
}
