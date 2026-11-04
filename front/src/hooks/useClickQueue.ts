import { useRef, useCallback } from "react";
import { sendClick } from "../api/click";
import type { Session } from "../types";

interface PendingClick {
  uuid: string;
  sentAt: number;
  retries: number;
}

const RETRY_TIMEOUT_MS = 1500;
const MAX_RETRIES = 5;

/**
 * Очередь кликов: генерирует UUID на фронте, отправляет параллельно,
 * ретраит по таймауту с тем же UUID. Идемпотентность на бэкенде.
 */
export function useClickQueue(session: Session, roundId: string) {
  const pendingRef = useRef<Map<string, PendingClick>>(new Map());
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(async () => {
    const now = Date.now();
    const entries = Array.from(pendingRef.current.values());
    for (const p of entries) {
      if (now - p.sentAt < RETRY_TIMEOUT_MS) continue;
      if (p.retries >= MAX_RETRIES) {
        pendingRef.current.delete(p.uuid);
        continue;
      }
      p.retries += 1;
      p.sentAt = now;
      // fire and forget; статус 202 подтверждает приём
      void sendClick(session.playerToken, { roundId, clickUUID: p.uuid })
        .then((status) => {
          if (status === 202 || status === 423) {
            pendingRef.current.delete(p.uuid);
          }
        })
        .catch(() => {
          // оставляем в очереди для ретрая
        });
    }
  }, [session, roundId]);

  const start = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = window.setInterval(flush, 500);
  }, [flush]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const click = useCallback(() => {
    const uuid = crypto.randomUUID();
    pendingRef.current.set(uuid, { uuid, sentAt: Date.now(), retries: 0 });
    void sendClick(session.playerToken, { roundId, clickUUID: uuid })
      .then((status) => {
        if (status === 202 || status === 423) {
          pendingRef.current.delete(uuid);
        }
      })
      .catch(() => {
        // ретрай через flush
      });
    return uuid;
  }, [session, roundId]);

  return { click, start, stop };
}
