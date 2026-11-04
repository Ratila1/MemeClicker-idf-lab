import { useEffect, useRef, useState, useCallback } from "react";

export interface UseWebSocketOptions {
  url: string;
  onMessage: (msg: unknown) => void;
  enabled?: boolean;
}

export function useWebSocket({ url, onMessage, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!enabled) return;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setStatus("open");
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        onMessageRef.current(parsed);
      } catch {
        // ignore non-JSON
      }
    };
    ws.onerror = () => setStatus("error");
    ws.onclose = () => {
      setStatus("closed");
      // reconnect after 2s
      setTimeout(connect, 2000);
    };
  }, [url, enabled]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { status, send };
}
