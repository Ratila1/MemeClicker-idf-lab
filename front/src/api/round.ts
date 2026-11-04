import { apiFetch } from "./client";
import type { RoundResults } from "../types";

export async function getRoundResults(roundId: string): Promise<RoundResults> {
  return apiFetch<RoundResults>(`/api/round/${roundId}/results`);
}
