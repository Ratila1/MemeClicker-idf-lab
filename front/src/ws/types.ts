package memeclicker.idf.clickerbackend.ws;

export type WsMessage =
  | { type: "lobby"; data: unknown }
  | { type: "leaderboard"; data: unknown }
  | { type: "game-start"; data: { roundId: string; startAt: number; roundEndTime: number; serverTime: number } }
  | { type: "round-end"; data: { roundId: string } }
  | { type: "chat-history"; data: ChatMessage[] }
  | { type: "chat-message"; data: ChatMessage }
  | { type: "chat-cleared"; data: unknown }
  | { type: "chat-error"; data: { message: string } }
  | { type: "error"; data: { message: string } };

export interface ChatMessage {
  id: string;
  nickname: string;
  text: string;
  sentAt: number;
}
