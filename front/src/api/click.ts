import { ApiError } from "./client";

export interface ClickPayload {
  roundId: string;
  clickUUID: string;
}

export async function sendClick(
  token: string,
  payload: ClickPayload,
): Promise<number> {
  const res = await fetch("/api/click", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Player-Token": token,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });
  return res.status;
}

export { ApiError };
