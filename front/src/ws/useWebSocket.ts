import { useEffect, useRef, useState, useCallback } from "react";

export interface UseWebSocketOptions {
  url: string;
  onMessage: (msg: unknown) => void;
  enabled?: boolean;
}

const RECONNECT_DELAY_MS = 2000;

/**
 * Один сокет на (url, enabled). При смене url или размонтировании старый сокет
 * закрывается окончательно: его onclose больше не переподключается и не
 * перезаписывает wsRef. Иначе после входа в лобби оставался сокет со старым
 * URL (без токена), send() уходил в него, а сообщения приходили дважды.
 */
export function useWebSocket({ url, onMessage, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let reconnectTimer: number | undefined;
    let socket: WebSocket | null = null;

    const connect = () => {
      const ws = new WebSocket(url);
      socket = ws;
      wsRef.current = ws;
      setStatus("connecting");
      ws.onopen = () => {
        if (!disposed) setStatus("open");
      };
      ws.onmessage = (ev) => {
        if (disposed) return;
        try {
          onMessageRef.current(JSON.parse(ev.data));
        } catch {
          // ignore non-JSON
        }
      };
      ws.onerror = () => {
        if (!disposed) setStatus("error");
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        setStatus("closed");
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (socket && wsRef.current === socket) wsRef.current = null;
      socket?.close();
    };
  }, [url, enabled]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  return { status, send };
}
