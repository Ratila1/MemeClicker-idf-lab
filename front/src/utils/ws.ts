export function wsBase(): string {
  const wsBase = import.meta.env.VITE_WS_BASE;
  if (wsBase) return wsBase.replace(/\/$/, "");
  const apiBase = import.meta.env.VITE_API_BASE;
  if (apiBase) {
    return apiBase.replace(/\/$/, "").replace(/^http/, "ws");
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

export function wsUrl(path: string): string {
  return `${wsBase()}${path}`;
}
