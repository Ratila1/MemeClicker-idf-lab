package memeclicker.idf.clickerbackend.lobby;

/**
 * Внутреннее событие «лобби изменилось». Данных не несёт: это только триггер
 * перечитать состояние из Redis и разослать снимок (источник истины Redis).
 */
public record LobbyChangedEvent() {
}
