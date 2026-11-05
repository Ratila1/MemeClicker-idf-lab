import type { Session } from "../types";

const SESSION_KEY = "mc_session";
const NICKNAME_KEY = "mc_nickname";

const NICKNAME_RE = /^[\\p{L}\\p{N}_\\-]{1,20}$/u;

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function loadSavedNickname(): string | null {
  try {
    const raw = localStorage.getItem(NICKNAME_KEY);
    if (!raw) return null;
    const value = raw.trim();
    if (!NICKNAME_RE.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function saveNickname(nickname: string): void {
  const value = nickname.trim();
  if (!NICKNAME_RE.test(value)) return;
  localStorage.setItem(NICKNAME_KEY, value);
}

export function clearSavedNickname(): void {
  localStorage.removeItem(NICKNAME_KEY);
}
