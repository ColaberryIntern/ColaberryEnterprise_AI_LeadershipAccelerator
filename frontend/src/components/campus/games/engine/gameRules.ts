/**
 * A COPY of the server's score ceilings (backend services/gameRoom/gameRoomRules.ts). The frontend never imports backend code; a drift
 * test reads the backend file's text and fails if these numbers differ. Used by the engine tests' greedy bot to prove an honest player
 * stays under what the server accepts.
 */
export const GAME_RULES = {
  'byte-chase': { ceilingPerSecond: 200, burst: 1500, absoluteCap: 200000 },
  'launch-lab': { ceilingPerSecond: 2000, burst: 4000, absoluteCap: 200000 },
  'bug-breaker': { ceilingPerSecond: 250, burst: 1000, absoluteCap: 200000 },
} as const;
export type GameId = keyof typeof GAME_RULES;
export const GAME_IDS: GameId[] = ['byte-chase', 'launch-lab', 'bug-breaker'];

export function maxScoreFor(game: GameId, secondsUsed: number): number {
  const r = GAME_RULES[game];
  return Math.min(r.absoluteCap, r.ceilingPerSecond * (Math.max(0, secondsUsed) + 30) + r.burst);
}
