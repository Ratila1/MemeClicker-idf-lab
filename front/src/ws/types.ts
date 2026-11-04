export type WsMessage =
  | { type: "lobby"; data: unknown }
  | { type: "leaderboard"; data: unknown }
  | { type: "game-start"; data: { roundId: string; startAt: number; roundEndTime: number; serverTime: number } }
  | { type: "round-end"; data: { roundId: string } }
  | { type: "error"; data: { message: string } };
