// === DTOs, соответствующие бэкенду (TZ) ===

export interface PlayerInfo {
  nickname: string;
  ready: boolean;
  joinedAt: number;
}

export interface LobbySnapshot {
  phase: "waiting" | "starting" | "running" | "finished";
  players: PlayerInfo[];
  minPlayers: number;
}

export interface RoundInfo {
  roundId: string;
  startAt: number; // server epoch ms
  roundEndTime: number; // server epoch ms
  serverTime?: number; // server epoch ms at event time
}

export interface LeaderboardEntry {
  nickname: string;
  score: number;
}

export interface RoundResults {
  roundId: string;
  winner: string | null;
  entries: { nickname: string; score: number; winner: boolean }[];
  finishedAt: number;
}

export interface Session {
  nickname: string;
  playerToken: string;
}
