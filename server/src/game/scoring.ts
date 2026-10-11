import type { FinalEntry } from '../../../shared/protocol';

export const GUESS_POINTS = [100, 70] as const;
export const DEFAULT_GUESS_POINTS = 50;
export const DRAWER_POINTS = 50;

/** `position` começa em 0 (0 = primeiro a acertar). */
export function pointsForGuess(position: number): number {
  return position < GUESS_POINTS.length ? GUESS_POINTS[position] : DEFAULT_GUESS_POINTS;
}

/** Classificação com empates (1, 2, 2, 4...). */
export function rankPlayers(players: { id: string; nickname: string; score: number }[]): FinalEntry[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return sorted.map((p) => {
    const firstWithSameScore = sorted.findIndex((q) => q.score === p.score);
    return { playerId: p.id, nickname: p.nickname, score: p.score, rank: firstWithSameScore + 1 };
  });
}
