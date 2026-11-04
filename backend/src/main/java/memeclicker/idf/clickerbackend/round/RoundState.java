package memeclicker.idf.clickerbackend.round;

/** Текущий раунд, все времена в epoch ms по часам сервера. */
public record RoundState(String roundId, long startAt, long endAt) {

    public boolean accepts(long now) {
        return startAt <= now && now < endAt;
    }
}
