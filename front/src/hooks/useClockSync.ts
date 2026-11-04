import { useRef, useCallback } from "react";

/**
 * Синхронизация часов: offset = serverTime - clientTime.
 * Используется для вычисления реального startAt/endAt на клиенте.
 */
export function useClockSync() {
  const offsetRef = useRef(0);

  const sync = useCallback((serverTime: number) => {
    offsetRef.current = serverTime - Date.now();
  }, []);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { sync, serverNow, offsetRef };
}
