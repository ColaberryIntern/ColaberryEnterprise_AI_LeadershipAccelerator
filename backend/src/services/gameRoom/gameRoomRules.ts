/**
 * Which games exist and which scores the server accepts (Colaberry Campus C10). The frontend keeps a COPY of these numbers
 * (components/campus/games/engine/gameRules.ts) with a drift test, and a seeded "greedy bot" test drives each real engine to prove
 * an honest player stays under the ceiling.
 *
 * A score is accepted iff it is a whole number, 0 <= score <= ceilingPerSecond x (server-measured seconds + 30) + burst, and
 * score <= absoluteCap. The +30 s and the burst absorb a game's lumpy scoring (a level clear, a big shot) at the start of a run; the
 * ceiling stops a submit that claims far more than the run's real time could earn.
 */
export const GAMES = ['byte-chase', 'launch-lab', 'bug-breaker', 'stack-drop', 'token-trail'] as const;
export type GameId = typeof GAMES[number];

export interface GameRule { ceilingPerSecond: number; burst: number; absoluteCap: number }

export const GAME_RULES: Record<GameId, GameRule> = {
  // bits 10, keys 50, frozen glitch reset 100, level clear 500
  'byte-chase': { ceilingPerSecond: 200, burst: 1500, absoluteCap: 200000 },
  // blocks 50, glitch nodes 500, unused orbs 300 each; a whole level (up to ~3,200) can clear in about 1.5 s of aim and flight
  'launch-lab': { ceilingPerSecond: 2000, burst: 4000, absoluteCap: 200000 },
  // bricks 25 x level, level clear 250
  'bug-breaker': { ceilingPerSecond: 250, burst: 1000, absoluteCap: 200000 },
  // C35: clears 100/300/500/800 x level (scoring level capped at 10) + 2 a row hard-dropped; a perfect run at 2.5 pieces a second
  // (all four-row clears) earns about 2,090 a second at the cap
  'stack-drop': { ceilingPerSecond: 2200, burst: 4000, absoluteCap: 2000000 },
  // C35: tokens 10 x level (scoring level capped at 15) at up to 18 moves a second; even a token every four moves is 675 a second
  'token-trail': { ceilingPerSecond: 800, burst: 1000, absoluteCap: 2000000 },
};

/** C35: the games' names as people read them (challenges, recent highs). */
export const GAME_NAMES: Record<GameId, string> = {
  'byte-chase': 'Byte Chase', 'launch-lab': 'Launch Lab', 'bug-breaker': 'Bug Breaker', 'stack-drop': 'Stack Drop', 'token-trail': 'Token Trail',
};

export const isGame =(g: unknown): g is GameId => typeof g === 'string' && (GAMES as readonly string[]).includes(g);

export function maxScoreFor(game: GameId, secondsUsed: number): number {
  const r = GAME_RULES[game];
  return Math.min(r.absoluteCap, r.ceilingPerSecond * (Math.max(0, secondsUsed) + 30) + r.burst);
}

export function acceptScore(game: GameId, score: unknown, secondsUsed: number): boolean {
  return typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= maxScoreFor(game, secondsUsed);
}
