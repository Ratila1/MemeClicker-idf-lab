import type { Session } from "../types";

const SESSION_KEY = "mc_session";
const NICKNAME_KEY = "mc_nickname";

// Unicode property escapes must use a single backslash in a regex literal.
const NICKNAME_RE = /^[\p{L}\p{N}_-]{1,20}$/u;

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
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // Storage may be disabled; session state still works for the current page.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore unavailable browser storage.
  }
}

export function loadSavedNickname(): string | null {
  try {
    const raw = localStorage.getItem(NICKNAME_KEY);
    if (!raw) return null;
    const value = raw.trim();
    return NICKNAME_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveNickname(nickname: string): void {
  const value = nickname.trim();
  if (!NICKNAME_RE.test(value)) return;
  try {
    localStorage.setItem(NICKNAME_KEY, value);
  } catch {
    // Nickname persistence is best effort if browser storage is unavailable.
  }
}

export function clearSavedNickname(): void {
  try {
    localStorage.removeItem(NICKNAME_KEY);
  } catch {
    // Ignore unavailable browser storage.
  }
}
