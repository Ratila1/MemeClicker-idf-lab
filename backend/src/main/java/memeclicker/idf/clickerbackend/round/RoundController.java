package memeclicker.idf.clickerbackend.round;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import memeclicker.idf.clickerbackend.web.ApiException;

@RestController
public class RoundController {

    private final MatchHistoryService history;

    public RoundController(MatchHistoryService history) {
        this.history = history;
    }

    /** 404, пока консьюмер не дошёл до маркера ROUND_END: итоги по таймеру не отдаём. */
    @GetMapping("/api/round/{roundId}/results")
    public RoundResults results(@PathVariable String roundId) {
        return history.results(roundId)
                .orElseThrow(() -> ApiException.notFound("Итоги раунда ещё не готовы"));
    }

    @GetMapping("/api/matches")
    public List<MatchSummary> matches(@RequestParam(defaultValue = "20") int limit) {
        return history.latest(Math.min(Math.max(limit, 1), 100));
    }
}
