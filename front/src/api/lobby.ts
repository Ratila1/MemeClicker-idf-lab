import { apiFetch } from "./client";
import type { Session, LobbySnapshot } from "../types";

export async function joinLobby(nickname: string): Promise<Session> {
  // POST /api/lobby/join -> { playerToken }
  const data = await apiFetch<{ playerToken: string }>("/api/lobby/join", {
    method: "POST",
    body: JSON.stringify({ nickname }),
  });
  return { nickname, playerToken: data.playerToken };
}

export async function setReady(token: string): Promise<void> {
  await apiFetch<void>("/api/lobby/ready", {
    method: "POST",
    headers: { "X-Player-Token": token },
  });
}

export async function getLobbySnapshot(): Promise<LobbySnapshot> {
  return apiFetch<LobbySnapshot>("/api/lobby");
}
