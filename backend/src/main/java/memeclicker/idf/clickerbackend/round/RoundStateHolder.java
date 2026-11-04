package memeclicker.idf.clickerbackend.round;

import java.util.Optional;

import org.springframework.stereotype.Component;

/**
 * Кеш текущего раунда в памяти: валидация клика не ходит в Redis.
 * Источник истины по-прежнему Redis (lobby:global:round), при рестарте кеш
 * восстанавливается из него ({@link RoundScheduler#recoverOnStartup}).
 */
@Component
public class RoundStateHolder {

    private volatile RoundState current;

    public Optional<RoundState> current() {
        return Optional.ofNullable(current);
    }

    public void set(RoundState state) {
        this.current = state;
    }

    public void clearIf(String roundId) {
        var c = current;
        if (c != null && c.roundId().equals(roundId)) {
            current = null;
        }
    }
}
