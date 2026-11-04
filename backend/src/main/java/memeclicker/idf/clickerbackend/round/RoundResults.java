package memeclicker.idf.clickerbackend.round;

import java.util.List;

public record RoundResults(String roundId, String winner, List<ResultEntry> entries, long finishedAt) {

    public record ResultEntry(String nickname, long score, boolean winner) {
    }
}
