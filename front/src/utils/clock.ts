let offset = 0;

export function setOffset(serverTime: number) {
  offset = serverTime - Date.now();
}

export function serverNow() {
  return Date.now() + offset;
}
