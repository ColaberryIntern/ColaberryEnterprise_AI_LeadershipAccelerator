import type { Ctx, Engine, Hud, Input, Palette, Rng } from './engineTypes';

/**
 * TOKEN TRAIL (Campus v8 G3, Basecamp C35): an original snake-style game. A 24 x 26 grid; you start in the middle heading up and
 * collect "T" tokens to grow. Each token is +10 x level; every 6 tokens is a level and the trail moves faster. Hitting a wall or your
 * own trail ends the run. Arrow keys, WASD or a swipe turn you (never straight back into yourself).
 * The SCORING level stops at 15 (the speed is capped there too): unbounded, a perfect run would grow quadratically past any
 * time-linear server ceiling; ceilings.test's bot and analytic bound prove an honest run is accepted.
 */
export const COLS = 24;
export const ROWS = 26;
const CELL = 13;
const OX = Math.floor((480 - COLS * CELL) / 2);
const OY = Math.floor((360 - ROWS * CELL) / 2);
export const TOKEN_POINTS = 10;
export const TOKENS_PER_LEVEL = 6;
export const MAX_SCORE_LEVEL = 15;

export type Dir = 'up' | 'down' | 'left' | 'right';
const STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export interface TokenTrailState {
  body: [number, number][]; dir: Dir; queued: Dir | null; token: [number, number];
  tokens: number; score: number; level: number; over: boolean; acc: number; grow: number;
}

export const levelFor = (tokens: number): number => 1 + Math.floor(tokens / TOKENS_PER_LEVEL);
/** Moves per second: 7 at level 1, one more a level, at most 18. */
export const speedFor = (level: number): number => Math.min(18, 6 + Math.min(level, MAX_SCORE_LEVEL));
export const tokenScore = (level: number): number => TOKEN_POINTS * Math.min(level, MAX_SCORE_LEVEL);

/** A free cell for the next token (the seeded rng picks among the free cells, so a run is reproducible). */
export function placeToken(body: [number, number][], rng: Rng): [number, number] {
  const taken = new Set(body.map(([x, y]) => `${x},${y}`));
  const free: [number, number][] = [];
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (!taken.has(`${x},${y}`)) free.push([x, y]);
  return free[Math.floor(rng() * free.length)] ?? [0, 0];
}

function init(rng: Rng): TokenTrailState {
  const cx = COLS / 2; const cy = ROWS / 2;
  const body: [number, number][] = [[cx, cy], [cx, cy + 1], [cx, cy + 2]];
  return { body, dir: 'up', queued: null, token: placeToken(body, rng), tokens: 0, score: 0, level: 1, over: false, acc: 0, grow: 0 };
}

function wanted(input: Input): Dir | null {
  if (input.swipe) return input.swipe;
  if (input.up) return 'up';
  if (input.down) return 'down';
  if (input.left) return 'left';
  if (input.right) return 'right';
  return null;
}

/** One move: turn if asked (never into yourself), step, eat, or end on a wall or your own trail. */
export function step(s: TokenTrailState, rng: Rng): void {
  if (s.queued && s.queued !== OPPOSITE[s.dir]) s.dir = s.queued;
  s.queued = null;
  const [hx, hy] = s.body[0];
  const [dx, dy] = STEP[s.dir];
  const nx = hx + dx; const ny = hy + dy;
  const tail = s.grow > 0 ? s.body.length : s.body.length - 1; // the tail moves away this step unless growing
  const hitsSelf = s.body.slice(0, tail).some(([x, y]) => x === nx && y === ny);
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || hitsSelf) { s.over = true; return; }
  s.body.unshift([nx, ny]);
  if (s.grow > 0) s.grow -= 1; else s.body.pop();
  if (nx === s.token[0] && ny === s.token[1]) {
    s.score += tokenScore(s.level); s.tokens += 1; s.level = levelFor(s.tokens); s.grow += 1;
    s.token = placeToken(s.body, rng);
  }
}

function update(s: TokenTrailState, dt: number, input: Input, rng: Rng): void {
  if (s.over) return;
  const w = wanted(input);
  if (w) s.queued = w;
  s.acc += Math.min(dt, 0.05);
  const interval = 1 / speedFor(s.level);
  while (s.acc >= interval && !s.over) { s.acc -= interval; step(s, rng); }
}

function draw(ctx: Ctx, s: TokenTrailState, p: Palette): void {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, 480, 360);
  ctx.strokeStyle = p.line; ctx.lineWidth = 2; ctx.strokeRect(OX - 2, OY - 2, COLS * CELL + 4, ROWS * CELL + 4);
  ctx.fillStyle = p.amber; ctx.fillRect(OX + s.token[0] * CELL + 1, OY + s.token[1] * CELL + 1, CELL - 2, CELL - 2);
  ctx.fillStyle = p.bg; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
  ctx.fillText('T', OX + s.token[0] * CELL + CELL / 2, OY + s.token[1] * CELL + CELL - 3);
  s.body.forEach(([x, y], i) => { ctx.fillStyle = i === 0 ? p.cherry : p.leaf; ctx.fillRect(OX + x * CELL + 1, OY + y * CELL + 1, CELL - 2, CELL - 2); });
}

const hud = (s: TokenTrailState): Hud => ({ score: s.score, lives: 0, level: s.level, over: s.over, hint: 'Arrows, WASD or swipe to turn. Collect the T tokens; avoid the walls and your own trail.' });

export const tokenTrail: Engine<TokenTrailState> = { id: 'token-trail', init, update, draw, hud };
