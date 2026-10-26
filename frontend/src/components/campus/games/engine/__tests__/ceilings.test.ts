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
import { stackDrop, COLS as SD_COLS, fits as sdFits, dropDistance, clearScore as sdClear, levelFor as sdLevel, StackDropState } from '../stackDropEngine';
import { tokenTrail, COLS as TT_COLS, ROWS as TT_ROWS, levelFor as ttLevel, speedFor as ttSpeed, tokenScore as ttScore, TokenTrailState } from '../tokenTrailEngine';

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

/** Stack Drop bot (C35): every 0.4 s (2.5 pieces a second, a fast human) put the piece where it clears most and leaves the flattest
 *  well, then hard-drop it. */
function bestPlacement(s: StackDropState): { cells: [number, number][]; x: number } | null {
  let best: { cells: [number, number][]; x: number; v: number } | null = null;
  let cells = s.cur.cells;
  for (let r = 0; r < 4; r += 1) {
    for (let x = -2; x < SD_COLS; x += 1) {
      const p = { ...s.cur, cells, x, y: 0 };
      if (!sdFits(s.grid, p)) continue;
      p.y += dropDistance(s.grid, p);
      const g = s.grid.map((row) => row.slice());
      for (const [cx, cy] of p.cells) if (p.y + cy >= 0) g[p.y + cy][p.x + cx] = 1;
      const full = g.filter((row) => row.every((c) => c)).length;
      const heights = Array.from({ length: SD_COLS }, (_, c) => { const top = g.findIndex((row) => row[c]); return top < 0 ? 0 : g.length - top; });
      const holes = heights.reduce((n, h, c) => n + g.slice(g.length - h).filter((row) => !row[c]).length, 0);
      const v = full * 10 - heights.reduce((a, b) => a + b, 0) * 0.5 - holes * 4;
      if (!best || v > best.v) best = { cells, x, v };
    }
    cells = cells.map(([cx, cy]) => [3 - cy, cx] as [number, number]);
  }
  return best;
}
let sdFrame = 0;
const stackBot = (s: StackDropState): Input => {
  sdFrame += 1;
  if (sdFrame % 12 !== 0) return NO_INPUT;
  const b = bestPlacement(s);
  if (b) { s.cur.cells = b.cells; s.cur.x = b.x; s.cur.y = 0; }
  return { ...NO_INPUT, action: true };
};

/** Token Trail bot (C35): the shortest safe path to the token. */
function trailBot(s: TokenTrailState): Input {
  const key = (x: number, y: number) => `${x},${y}`;
  const blocked = new Set(s.body.slice(0, -1).map(([x, y]) => key(x, y)));
  const [hx, hy] = s.body[0];
  const prev = new Map<string, string>([[key(hx, hy), '']]);
  const q: [number, number][] = [[hx, hy]];
  const goal = key(s.token[0], s.token[1]);
  while (q.length && !prev.has(goal)) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx; const ny = y + dy; const k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= TT_COLS || ny >= TT_ROWS || blocked.has(k) || prev.has(k)) continue;
      prev.set(k, key(x, y)); q.push([nx, ny]);
    }
  }
  if (!prev.has(goal)) return NO_INPUT;
  let stepK = goal;
  while (prev.get(stepK) && prev.get(stepK) !== key(hx, hy)) stepK = prev.get(stepK)!;
  const [sx, sy] = stepK.split(',').map(Number);
  return { ...NO_INPUT, left: sx < hx, right: sx > hx, up: sy < hy, down: sy > hy };
}

describe('C35: the new games stay under what the server accepts', () => {
  it.each(SEEDS)('Stack Drop bot, seed %i', (seed) => { sdFrame = 0; underCeiling('stack-drop', play(stackDrop, seed, stackBot)); });
  it.each(SEEDS)('Token Trail bot, seed %i', (seed) => { underCeiling('token-trail', play(tokenTrail, seed, trailBot)); });
  it('the bots actually score', () => {
    sdFrame = 0;
    expect(play(stackDrop, 1, stackBot, 60).pop()).toBeGreaterThan(1000);
    expect(play(tokenTrail, 1, trailBot, 60).pop()).toBeGreaterThan(200);
  });
  it('Stack Drop: a perfect run (2.5 pieces a second, every clear four rows, 19-row hard drops) is accepted for the whole 15 minutes', () => {
    let total = 0; let lines = 0;
    for (let t = 1; t <= 900; t += 1) {
      lines += 1; // 2.5 pieces x 4 cells / 10 columns = 1 row a second
      total += sdClear(4, sdLevel(lines)) / 4 + 2.5 * 2 * 19;
      expect({ t, ok: total <= maxScoreFor('stack-drop', t) }).toEqual({ t, ok: true });
    }
  });
  it('Token Trail: a token every four moves at full speed is accepted for the whole 15 minutes', () => {
    let total = 0; let tokens = 0;
    for (let t = 1; t <= 900; t += 1) {
      const per = ttSpeed(ttLevel(tokens)) / 4;
      for (let i = 0; i < Math.floor(per); i += 1) { total += ttScore(ttLevel(tokens)); tokens += 1; }
      expect({ t, ok: total <= maxScoreFor('token-trail', t) }).toEqual({ t, ok: true });
    }
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
