package memeclicker.idf.clickerbackend.click;

/**
 * Сообщение топика clicks. Два типа в одном топике (и одной партиции):
 * CLICK и маркер ROUND_END. Порядок внутри партиции гарантирует, что к моменту
 * чтения маркера все клики раунда уже обработаны.
 * nickname берётся из токена, receivedAt ставит сервер.
 * endAt копируется из раунда, чтобы консьюмер мог отсечь поздние клики без похода в Redis.
 */
public record ClickEvent(String type, String roundId, String nickname, String clickUUID,
                         Long receivedAt, Long endAt) {

    public static final String CLICK = "CLICK";
    public static final String ROUND_END = "ROUND_END";

    public static ClickEvent click(String roundId, String nickname, String clickUuid, long receivedAt, long endAt) {
        return new ClickEvent(CLICK, roundId, nickname, clickUuid, receivedAt, endAt);
    }

    public static ClickEvent roundEnd(String roundId) {
        return new ClickEvent(ROUND_END, roundId, null, null, null, null);
    }
}
