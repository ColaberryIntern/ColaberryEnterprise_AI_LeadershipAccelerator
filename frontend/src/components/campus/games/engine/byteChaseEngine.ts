import type { Ctx, Engine, Hud, Input, Palette, Rng } from './engineTypes';

/**
 * BYTE CHASE (Colaberry Campus C10). An ORIGINAL maze game, deliberately not the prototype's chomping wedge:
 *  - you are a DATA PACKET (a diamond with a light trail) on a circuit-board grid;
 *  - you collect BITS (10) and KEYS (50); a key gives a SHIELD for 6 s that FREEZES the glitches in place (they stop; touching a
 *    frozen glitch reboots it to its spawn for 100). Nothing flees and nothing is eaten;
 *  - GLITCHES are jagged shards that patrol the lanes and home in on you; touching an active one costs a life (3 lives);
 *  - clearing every bit and key is a level (500), and each level is faster.
 * Scoring here must stay under the server ceiling (backend gameRoomRules 'byte-chase'); the bot test proves it.
 */
export const T = 24;
export const MAZE: readonly string[] = [
  '####################',
  '#k....#......#....k#',
  '#.##..#.####.#..##.#',
  '#.#..............#.#',
  '#...##.##..##.##...#',
  '###....#....#....###',
  '#...#.....G....#...#',
  '#.#.#.###..###.#.#.#',
  '#...#....GG....#...#',
  '###....#....#....###',
  '#...##.##..##.##...#',
  '#.#.......P......#.#',
  '#.##..#.####.#..##.#',
  '#k....#......#....k#',
  '####################',
];
export const POINTS = { bit: 10, key: 50, reboot: 100, level: 500 } as const;
export const SHIELD_S = 6;

type Dir = 'left' | 'right' | 'up' | 'down';
const VEC: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const REVERSE: Record<Dir, Dir> = { left: 'right', right: 'left', up: 'down', down: 'up' };
interface Mover { x: number; y: number; dir: Dir | null; prog: number; sx: number; sy: number }

export interface ByteChaseState {
  grid: string[][]; player: Mover & { want: Dir | null }; glitches: Mover[];
  score: number; lives: number; level: number; shield: number; safe: number; over: boolean; trail: Array<[number, number]>;
}

const freshGrid = () => MAZE.map((r) => r.split('').map((c) => (c === 'P' || c === 'G' ? ' ' : c)));
const find = (ch: string) => { const out: Array<[number, number]> = []; MAZE.forEach((r, y) => r.split('').forEach((c, x) => { if (c === ch) out.push([x, y]); })); return out; };
export const open = (g: string[][], x: number, y: number) => g[y] !== undefined && g[y][x] !== undefined && g[y][x] !== '#';
const remaining = (g: string[][]) => g.some((r) => r.some((c) => c === '.' || c === 'k'));
const speeds = (level: number) => ({ player: 6 + level * 0.3, glitch: 3.6 + level * 0.4 });

function place(s: ByteChaseState): void {
  const [[px, py]] = find('P');
  s.player = { x: px, y: py, sx: px, sy: py, dir: null, want: null, prog: 0 };
  s.glitches = find('G').map(([x, y]) => ({ x, y, sx: x, sy: y, dir: 'up' as Dir, prog: 0 }));
  s.safe = 1;
}

function init(): ByteChaseState {
  const s = { grid: freshGrid(), score: 0, lives: 3, level: 1, shield: 0, safe: 1, over: false, trail: [] } as unknown as ByteChaseState;
  place(s);
  return s;
}

function readDir(input: Input): Dir | null {
  if (input.swipe) return input.swipe;
  if (input.left) return 'left';
  if (input.right) return 'right';
  if (input.up) return 'up';
  if (input.down) return 'down';
  return null;
}

/** Advance a mover by `tiles`; `choose` picks the direction at each tile it reaches. Returns tiles arrived at. */
function step(g: string[][], m: Mover, tiles: number, choose: (m: Mover) => Dir | null): Array<[number, number]> {
  const arrived: Array<[number, number]> = [];
  if (m.dir === null) { m.dir = choose(m); if (m.dir === null) return arrived; }
  m.prog += tiles;
  while (m.prog >= 1 && m.dir !== null) {
    m.prog -= 1;
    m.x += VEC[m.dir][0]; m.y += VEC[m.dir][1];
    arrived.push([m.x, m.y]);
    const next = choose(m);
    if (next === null) { m.prog = 0; m.dir = null; } else m.dir = next;
  }
  if (m.dir !== null && !open(g, m.x + VEC[m.dir][0], m.y + VEC[m.dir][1])) { m.prog = 0; m.dir = null; }
  return arrived;
}

function glitchChoice(g: string[][], m: Mover, target: Mover, rng: Rng): Dir | null {
  const dirs = (Object.keys(VEC) as Dir[]).filter((d) => open(g, m.x + VEC[d][0], m.y + VEC[d][1]));
  const forward = dirs.filter((d) => !m.dir || d !== REVERSE[m.dir]);
  const pool = forward.length ? forward : dirs;
  if (!pool.length) return null;
  if (rng() < 0.6) {
    const dist = (d: Dir) => Math.abs(m.x + VEC[d][0] - target.x) + Math.abs(m.y + VEC[d][1] - target.y);
    return pool.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  }
  return pool[Math.floor(rng() * pool.length)];
}

function collect(s: ByteChaseState, x: number, y: number): void {
  const c = s.grid[y][x];
  if (c === '.') { s.score += POINTS.bit; s.grid[y][x] = ' '; }
  if (c === 'k') { s.score += POINTS.key; s.grid[y][x] = ' '; s.shield = SHIELD_S; }
}

function touch(s: ByteChaseState): void {
  for (const gl of s.glitches) {
    if (gl.x !== s.player.x || gl.y !== s.player.y) continue;
    if (s.shield > 0) { s.score += POINTS.reboot; gl.x = gl.sx; gl.y = gl.sy; gl.prog = 0; gl.dir = null; continue; }
    if (s.safe > 0) continue;
    s.lives -= 1;
    if (s.lives <= 0) { s.over = true; return; }
    place(s);
    return;
  }
}

function update(s: ByteChaseState, dt: number, input: Input, rng: Rng): void {
  if (s.over) return;
  const d = Math.min(dt, 0.05);
  s.shield = Math.max(0, s.shield - d); s.safe = Math.max(0, s.safe - d);
  const want = readDir(input);
  if (want) s.player.want = want;
  const sp = speeds(s.level);
  const p = s.player;
  const choosePlayer = (m: Mover): Dir | null => {
    if (p.want && open(s.grid, m.x + VEC[p.want][0], m.y + VEC[p.want][1])) return p.want;
    return m.dir && open(s.grid, m.x + VEC[m.dir][0], m.y + VEC[m.dir][1]) ? m.dir : null;
  };
  for (const [x, y] of step(s.grid, p, sp.player * d, choosePlayer)) { collect(s, x, y); s.trail = [[x, y] as [number, number], ...s.trail].slice(0, 4); touch(s); if (s.over) return; }
  if (s.shield <= 0) for (const gl of s.glitches) { step(s.grid, gl, sp.glitch * d, (m) => glitchChoice(s.grid, m, p, rng)); }
  touch(s);
  if (!s.over && !remaining(s.grid)) { s.score += POINTS.level; s.level += 1; s.grid = freshGrid(); place(s); }
}

/** The player is a diamond drawn with straight lines only (no arcs, no mouth). */
export function drawPlayer(ctx: Ctx, cx: number, cy: number, p: Palette): void {
  ctx.fillStyle = p.berry;
  ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 9, cy); ctx.closePath(); ctx.fill();
}

function drawGlitch(ctx: Ctx, cx: number, cy: number, frozen: boolean, p: Palette): void {
  ctx.fillStyle = frozen ? p.muted : p.cherry;
  ctx.beginPath(); ctx.moveTo(cx - 9, cy - 7); ctx.lineTo(cx - 2, cy - 10); ctx.lineTo(cx + 3, cy - 4); ctx.lineTo(cx + 10, cy - 8);
  ctx.lineTo(cx + 7, cy + 9); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 8, cy + 10); ctx.closePath(); ctx.fill();
}

function draw(ctx: Ctx, s: ByteChaseState, p: Palette): void {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, 480, 360);
  s.grid.forEach((row, y) => row.forEach((c, x) => {
    if (c === '#') { ctx.fillStyle = p.line; ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4); }
    if (c === '.') { ctx.fillStyle = p.leaf; ctx.fillRect(x * T + 10, y * T + 10, 4, 4); }
    if (c === 'k') { ctx.fillStyle = p.amber; ctx.fillRect(x * T + 7, y * T + 10, 10, 4); ctx.fillRect(x * T + 14, y * T + 10, 3, 8); }
  }));
  ctx.globalAlpha = 0.3; ctx.fillStyle = p.berry;
  for (const [x, y] of s.trail) ctx.fillRect(x * T + 9, y * T + 9, 6, 6);
  ctx.globalAlpha = 1;
  const pt = s.player;
  const along = (m: Mover) => (m.dir ? [VEC[m.dir][0] * m.prog, VEC[m.dir][1] * m.prog] : [0, 0]);
  const [dx, dy] = along(pt);
  drawPlayer(ctx, (pt.x + dx) * T + T / 2, (pt.y + dy) * T + T / 2, p);
  for (const gl of s.glitches) { const [gx, gy] = along(gl); drawGlitch(ctx, (gl.x + gx) * T + T / 2, (gl.y + gy) * T + T / 2, s.shield > 0, p); }
}

const hud = (s: ByteChaseState): Hud => ({ score: s.score, lives: s.lives, level: s.level, over: s.over, hint: 'Arrows, WASD or swipe. Keys freeze the glitches.' });

export const byteChase: Engine<ByteChaseState> = { id: 'byte-chase', init, update, draw, hud };
