package memeclicker.idf.clickerbackend.ws;

/** Конверт всех WebSocket-сообщений: {"type": "...", "data": ...}. */
public record WsMessage(String type, Object data) {
}
