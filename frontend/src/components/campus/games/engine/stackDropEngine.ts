import type { Ctx, Engine, Hud, Input, Palette, Rng } from './engineTypes';

/**
 * STACK DROP (Campus v8 G3, Basecamp C35): an original falling-block puzzle. A 10 x 20 well, seven four-cell shapes dealt from a
 * shuffled bag of seven (seeded rng, so a run is reproducible), a ghost showing where the piece will land, a NEXT preview and LINES.
 *  - left / right move (held keys repeat), up rotates with simple wall kicks, down soft-drops (+1 a row), Space hard-drops (+2 a row);
 *  - swipes: left / right move, up rotates, down hard-drops;
 *  - clearing 1 / 2 / 3 / 4 rows scores 100 / 300 / 500 / 800 x level; level = 1 + floor(lines / 8); gravity quickens with level.
 * The SCORING level stops at 10 (gravity is near its fastest by then): with an unbounded level a perfect run grows quadratically
 * and no time-linear server ceiling could accept it. The analytic test in ceilings.test proves a perfect run at a human pace is
 * accepted. Original name, colors and copy: no third-party trade dress.
 */
export const COLS = 10;
export const ROWS = 20;
const CELL = 16;
const OX = 120;
const OY = 20;
export const CLEAR_POINTS = [0, 100, 300, 500, 800] as const;
export const LINES_PER_LEVEL = 8;
export const MAX_SCORE_LEVEL = 10;
const REPEAT_S = 0.11;

/** The seven shapes in their spawn rotation, as cells inside an n x n box. */
const SHAPES: { n: number; cells: [number, number][] }[] = [
  { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] }, // bar
  { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] }, // square
  { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] }, // tee
  { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] }, // step right
  { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }, // step left
  { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] }, // hook left
  { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }, // hook right
];

export interface Piece { k: number; cells: [number, number][]; x: number; y: number }
export interface StackDropState {
  grid: number[][]; cur: Piece; next: number; bag: number[];
  score: number; lines: number; level: number; over: boolean;
  fall: number; repeat: number; prevUp: boolean; prevLeft: boolean; prevRight: boolean;
}

export const rotate = (cells: [number, number][], n: number): [number, number][] => cells.map(([x, y]) => [n - 1 - y, x] as [number, number]);
export const levelFor = (lines: number): number => 1 + Math.floor(lines / LINES_PER_LEVEL);
export const gravityFor = (level: number): number => Math.max(0.08, 0.8 - (level - 1) * 0.07);
export const clearScore = (n: number, level: number): number => CLEAR_POINTS[n] * Math.min(level, MAX_SCORE_LEVEL);

function shuffledBag(rng: Rng): number[] {
  const b = [0, 1, 2, 3, 4, 5, 6];
  for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

function draw7(s: { bag: number[] }, rng: Rng): number {
  if (!s.bag.length) s.bag = shuffledBag(rng);
  return s.bag.shift()!;
}

const spawn = (k: number): Piece => ({ k, cells: SHAPES[k].cells.map(([x, y]) => [x, y] as [number, number]), x: Math.floor((COLS - SHAPES[k].n) / 2), y: 0 });

export function fits(grid: number[][], p: Piece, dx = 0, dy = 0, cells = p.cells): boolean {
  return cells.every(([cx, cy]) => {
    const x = p.x + cx + dx; const y = p.y + cy + dy;
    return x >= 0 && x < COLS && y < ROWS && (y < 0 || grid[y][x] === 0);
  });
}

/** How far the piece can fall from where it is (the ghost and a hard drop). */
export function dropDistance(grid: number[][], p: Piece): number {
  let d = 0;
  while (fits(grid, p, 0, d + 1)) d += 1;
  return d;
}

/** Rotate with simple wall kicks: try in place, then one and two cells either way. */
export function tryRotate(grid: number[][], p: Piece): boolean {
  const turned = rotate(p.cells, SHAPES[p.k].n);
  for (const dx of [0, -1, 1, -2, 2]) {
    if (fits(grid, p, dx, 0, turned)) { p.cells = turned; p.x += dx; return true; }
  }
  return false;
}

/** Fix the piece into the well, clear full rows, score, level up, and deal the next piece (or end the game). */
export function lock(s: StackDropState, rng: Rng): number {
  for (const [cx, cy] of s.cur.cells) { const y = s.cur.y + cy; if (y >= 0) s.grid[y][s.cur.x + cx] = s.cur.k + 1; }
  const kept = s.grid.filter((row) => row.some((c) => c === 0));
  const cleared = ROWS - kept.length;
  while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(0));
  s.grid = kept;
  if (cleared) { s.score += clearScore(cleared, s.level); s.lines += cleared; s.level = levelFor(s.lines); }
  s.cur = spawn(s.next);
  s.next = draw7(s, rng);
  s.fall = 0;
  if (!fits(s.grid, s.cur)) s.over = true;
  return cleared;
}

export function hardDrop(s: StackDropState, rng: Rng): void {
  const d = dropDistance(s.grid, s.cur);
  s.cur.y += d; s.score += 2 * d;
  lock(s, rng);
}

function init(rng: Rng): StackDropState {
  const s = { bag: shuffledBag(rng) } as StackDropState;
  const first = draw7(s, rng);
  return { grid: Array.from({ length: ROWS }, () => new Array(COLS).fill(0)), cur: spawn(first), next: draw7(s, rng), bag: s.bag,
    score: 0, lines: 0, level: 1, over: false, fall: 0, repeat: 0, prevUp: false, prevLeft: false, prevRight: false };
}

function shift(s: StackDropState, d: number, input: Input): void {
  const dir = input.left || input.swipe === 'left' ? -1 : input.right || input.swipe === 'right' ? 1 : 0;
  const fresh = (input.left && !s.prevLeft) || (input.right && !s.prevRight) || (input.swipe === 'left' || input.swipe === 'right');
  s.repeat = dir === 0 ? 0 : fresh ? REPEAT_S * 1.6 : s.repeat - d;
  if (dir !== 0 && (fresh || s.repeat <= 0)) { if (fits(s.grid, s.cur, dir, 0)) s.cur.x += dir; if (!fresh) s.repeat = REPEAT_S; }
  s.prevLeft = input.left; s.prevRight = input.right;
}

function update(s: StackDropState, dt: number, input: Input, rng: Rng): void {
  if (s.over) return;
  const d = Math.min(dt, 0.05);
  shift(s, d, input);
  if ((input.up && !s.prevUp) || input.swipe === 'up') tryRotate(s.grid, s.cur);
  s.prevUp = input.up;
  if (input.action || input.swipe === 'down') { hardDrop(s, rng); return; }
  const interval = input.down ? Math.min(0.05, gravityFor(s.level)) : gravityFor(s.level);
  s.fall += d;
  while (s.fall >= interval && !s.over) {
    s.fall -= interval;
    if (fits(s.grid, s.cur, 0, 1)) { s.cur.y += 1; if (input.down) s.score += 1; } else { lock(s, rng); break; }
  }
}

const colorOf = (k: number, p: Palette): string => [p.berry, p.amber, p.cherry, p.leaf, p.berry, p.leaf, p.amber][k] ?? p.ink;

function cell(ctx: Ctx, x: number, y: number, fill: string): void {
  ctx.fillStyle = fill; ctx.fillRect(OX + x * CELL + 1, OY + y * CELL + 1, CELL - 2, CELL - 2);
}

function draw(ctx: Ctx, s: StackDropState, p: Palette): void {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, 480, 360);
  ctx.strokeStyle = p.line; ctx.lineWidth = 2; ctx.strokeRect(OX - 2, OY - 2, COLS * CELL + 4, ROWS * CELL + 4);
  s.grid.forEach((row, y) => row.forEach((c, x) => { if (c) cell(ctx, x, y, colorOf(c - 1, p)); }));
  const ghost = dropDistance(s.grid, s.cur);
  ctx.globalAlpha = 0.25;
  for (const [cx, cy] of s.cur.cells) cell(ctx, s.cur.x + cx, s.cur.y + cy + ghost, colorOf(s.cur.k, p));
  ctx.globalAlpha = 1;
  for (const [cx, cy] of s.cur.cells) if (s.cur.y + cy >= 0) cell(ctx, s.cur.x + cx, s.cur.y + cy, colorOf(s.cur.k, p));
  ctx.fillStyle = p.muted; ctx.font = '12px monospace'; ctx.textAlign = 'left';
  ctx.fillText('NEXT', 310, 34);
  for (const [cx, cy] of SHAPES[s.next].cells) { ctx.fillStyle = colorOf(s.next, p); ctx.fillRect(312 + cx * 14, 44 + cy * 14, 12, 12); }
  ctx.fillStyle = p.muted; ctx.fillText('LINES', 310, 130);
  ctx.fillStyle = p.ink; ctx.font = '20px monospace'; ctx.fillText(String(s.lines), 310, 154);
}

const hud = (s: StackDropState): Hud => ({ score: s.score, lives: 0, level: s.level, over: s.over, hint: 'Arrows or WASD: move and rotate. Down drops softly, Space drops hard.' });

export const stackDrop: Engine<StackDropState> = { id: 'stack-drop', init, update, draw, hud };
