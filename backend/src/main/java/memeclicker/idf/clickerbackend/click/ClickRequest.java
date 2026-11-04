package memeclicker.idf.clickerbackend.click;

/** Тело POST /api/click. clickUUID генерирует фронт до отправки. */
public record ClickRequest(String roundId, String clickUUID) {
}
