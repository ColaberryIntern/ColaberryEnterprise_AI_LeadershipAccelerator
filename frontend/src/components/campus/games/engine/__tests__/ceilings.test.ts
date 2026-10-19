/**
 * C10: an honest player is never refused by the server.
 *  - DRIFT: the frontend copy of the ceilings equals the backend's (read as text; the frontend never imports backend code).
 *  - BOTS: a greedy bot drives each real engine for 120 simulated seconds over 20 seeds; at every second its score is at most what the
 *    server accepts for that many seconds (ceiling x (t + 30) + burst). The bot is a lower bound on human skill; the burst and the
 *    analytic Launch Lab bound below are the margin.
 *  - LAUNCH LAB ANALYTIC: even clearing every level perfectly in 1.5 s each stays under the ceiling.
 */
import fs from 'fs';
import path from 'path';
import { GAME_RULES, GameId, maxScoreFor } from '../gameRules';
import { seededRng, Input, NO_INPUT, Engine } from '../engineTypes';
import { byteChase, open, ByteChaseState } from '../byteChaseEngine';
import { bugBreaker, BugBreakerState } from '../bugBreakerEngine';
import { launchLab, maxLevelScore, LaunchLabState } from '../launchLabEngine';

describe('the frontend copy matches the server', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'backend', 'src', 'services', 'gameRoom', 'gameRoomRules.ts'), 'utf8');
  it.each(Object.keys(GAME_RULES) as GameId[])('%s', (g) => {
    const r = GAME_RULES[g];
    expect(src).toContain(`'${g}': { ceilingPerSecond: ${r.ceilingPerSecond}, burst: ${r.burst}, absoluteCap: ${r.absoluteCap} }`);
  });
});

/** Run an engine with a policy; return the score at each whole second. */
function play<S>(engine: Engine<S>, seed: number, policy: (s: S) => Input, seconds = 120, dt = 1 / 30): number[] {
  const rng = seededRng(seed);
  const s = engine.init(rng);
  const at: number[] = [];
  for (let f = 1; f <= seconds / dt; f += 1) {
    engine.update(s, dt, policy(s), rng);
    if (Math.abs((f * dt) % 1) < 1e-9 || Math.abs((f * dt) % 1 - 1) < 1e-6) at.push(engine.hud(s).score);
  }
  return at;
}

function underCeiling(game: GameId, scores: number[]): void {
  scores.forEach((score, i) => { expect({ t: i + 1, ok: score <= maxScoreFor(game, i + 1) }).toEqual({ t: i + 1, ok: true }); });
}

/** Byte Chase bot: walk the shortest path to the nearest bit or key. */
function chaseBot(s: ByteChaseState): Input {
  const start = `${s.player.x},${s.player.y}`;
  const prev = new Map<string, string>([[start, '']]);
  const q: Array<[number, number]> = [[s.player.x, s.player.y]];
  let goal: string | null = null;
  while (q.length && !goal) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
      if (prev.has(k) || !open(s.grid, nx, ny)) continue;
      prev.set(k, `${x},${y}`);
      if (s.grid[ny][nx] === '.' || s.grid[ny][nx] === 'k') { goal = k; break; }
      q.push([nx, ny]);
    }
  }
  if (!goal) return NO_INPUT;
  let step = goal;
  while (prev.get(step) !== start && prev.get(step)) step = prev.get(step)!;
  const [sx, sy] = step.split(',').map(Number);
  return { ...NO_INPUT, left: sx < s.player.x, right: sx > s.player.x, up: sy < s.player.y, down: sy > s.player.y };
}

/** Bug Breaker bot: a perfect paddle under the ball, serving at once. */
const breakerBot = (s: BugBreakerState): Input => ({ ...NO_INPUT, action: !s.ball, pointer: { x: s.ball ? s.ball.x : 240, y: 320, down: false } });

/** Launch Lab bot: sweep angle and power each shot (seeded by the frame), launching as soon as it can. */
let shot = 0;
const launchBot = (s: LaunchLabState): Input => {
  if (s.orb) return NO_INPUT;
  shot += 1;
  s.angle = 20 + ((shot * 17) % 50);
  s.power = 450 + ((shot * 131) % 450);
  return { ...NO_INPUT, action: true };
};

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('greedy bots never exceed what the server accepts', () => {
  it.each(SEEDS)('Byte Chase, seed %i', (seed) => { underCeiling('byte-chase', play(byteChase, seed, chaseBot)); });
  it.each(SEEDS)('Bug Breaker, seed %i', (seed) => { underCeiling('bug-breaker', play(bugBreaker, seed, breakerBot)); });
  it.each(SEEDS)('Launch Lab, seed %i', (seed) => { shot = seed; underCeiling('launch-lab', play(launchLab, seed, launchBot)); });
  it('the bots actually score (the test is not vacuous)', () => {
    expect(play(byteChase, 1, chaseBot, 30).pop()).toBeGreaterThan(300);
    expect(play(bugBreaker, 1, breakerBot, 30).pop()).toBeGreaterThan(200);
  });
});

describe('Launch Lab: a perfect run is still accepted', () => {
  it('clearing levels 1..60 in 1.5 s each stays under the ceiling at every level', () => {
    let total = 0;
    for (let lv = 1; lv <= 60; lv += 1) {
      total += maxLevelScore(lv);
      expect({ lv, ok: total <= maxScoreFor('launch-lab', lv * 1.5) }).toEqual({ lv, ok: true });
    }
  });
});
