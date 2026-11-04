package memeclicker.idf.clickerbackend.click;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ClickController {

    private final ClickService clicks;

    public ClickController(ClickService clicks) {
        this.clicks = clicks;
    }

    /** 202 Accepted: клик записан в Kafka (acks=all). Ретрай с тем же clickUUID безопасен. */
    @PostMapping("/api/click")
    public ResponseEntity<Void> click(@RequestHeader("X-Player-Token") String token,
                                      @RequestBody ClickRequest request) {
        clicks.accept(token, request);
        return ResponseEntity.accepted().build();
    }
}
