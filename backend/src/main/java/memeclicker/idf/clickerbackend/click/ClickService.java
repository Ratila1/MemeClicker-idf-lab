package memeclicker.idf.clickerbackend.click;

import java.util.UUID;

import org.springframework.stereotype.Service;

import memeclicker.idf.clickerbackend.lobby.PlayerTokens;
import memeclicker.idf.clickerbackend.round.RoundStateHolder;
import memeclicker.idf.clickerbackend.web.ApiException;

@Service
public class ClickService {

    private final PlayerTokens tokens;
    private final RoundStateHolder rounds;
    private final ClickProducer producer;

    public ClickService(PlayerTokens tokens, RoundStateHolder rounds, ClickProducer producer) {
        this.tokens = tokens;
        this.rounds = rounds;
        this.producer = producer;
    }

    /** Возвращает нормально = 202. Иначе ApiException с 400/401/423/503. */
    public void accept(String token, ClickRequest request) {
        if (request == null || request.roundId() == null || request.clickUUID() == null) {
            throw ApiException.badRequest("Нужны roundId и clickUUID");
        }
        String clickUuid;
        try {
            clickUuid = UUID.fromString(request.clickUUID()).toString();
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("clickUUID должен быть UUID");
        }
        var nickname = tokens.resolve(token).orElseThrow(ApiException::unauthorized);

        producer.enter();
        try {
            long now = System.currentTimeMillis();
            var round = rounds.current()
                    .filter(r -> r.roundId().equals(request.roundId()))
                    .filter(r -> r.accepts(now))
                    .orElseThrow(() -> ApiException.locked("Раунд не идёт"));
            var event = ClickEvent.click(round.roundId(), nickname, clickUuid, now, round.endAt());
            if (!producer.send(event)) {
                throw ApiException.unavailable("Сервер перегружен, повторите клик");
            }
        } finally {
            producer.exit();
        }
    }
}
