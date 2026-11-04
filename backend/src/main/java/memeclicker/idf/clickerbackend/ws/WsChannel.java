package memeclicker.idf.clickerbackend.ws;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

/**
 * Набор сессий одного эндпоинта. Каждая сессия обёрнута в
 * {@link ConcurrentWebSocketSessionDecorator}: отправка потокобезопасна,
 * а медленный клиент ограничен по времени и буферу и отключается,
 * вместо того чтобы копить память на сервере.
 */
public class WsChannel {

    private static final Logger log = LoggerFactory.getLogger(WsChannel.class);
    private static final int SEND_TIME_LIMIT_MS = 1000;
    private static final int BUFFER_LIMIT_BYTES = 64 * 1024;

    private final String name;
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public WsChannel(String name) {
        this.name = name;
    }

    public WebSocketSession add(WebSocketSession session) {
        var decorated = new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, BUFFER_LIMIT_BYTES);
        sessions.put(session.getId(), decorated);
        return decorated;
    }

    public void remove(WebSocketSession session) {
        sessions.remove(session.getId());
    }

    public int size() {
        return sessions.size();
    }

    public void broadcast(String json) {
        var message = new TextMessage(json);
        for (var session : sessions.values()) {
            send(session, message);
        }
    }

    public void send(WebSocketSession session, String json) {
        send(session, new TextMessage(json));
    }

    private void send(WebSocketSession session, TextMessage message) {
        if (!session.isOpen()) {
            sessions.remove(session.getId());
            return;
        }
        try {
            session.sendMessage(message);
        } catch (IOException | RuntimeException e) {
            log.debug("[{}] drop session {}: {}", name, session.getId(), e.toString());
            sessions.remove(session.getId());
            try {
                session.close();
            } catch (IOException ignored) {
                // сессия уже мертва
            }
        }
    }
}
