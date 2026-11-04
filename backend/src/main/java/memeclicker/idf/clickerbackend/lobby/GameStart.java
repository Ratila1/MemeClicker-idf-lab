package memeclicker.idf.clickerbackend.lobby;

/**
 * Событие game-start. Клиент стартует по абсолютному startAt и синхронизирует
 * часы по serverTime (время сервера в момент отправки).
 */
public record GameStart(String roundId, long startAt, long roundEndTime, long serverTime) {
}
