import type { Ctx, Engine, Hud, Input, Palette } from './engineTypes';

/**
 * LAUNCH LAB (Colaberry Campus C10). An ORIGINAL artillery puzzle, deliberately not the prototype's slingshot-and-cherry look:
 *  - a LAUNCH PAD fires a DATA ORB (no band, no bird, no fruit); aim with the arrows (up/down angle, left/right power) and Space, or
 *    drag back from the pad and let go;
 *  - SERVER RACKS of blocks stand on the floor with a GLITCH NODE on top of each; a fast orb knocks a block out (50), and hitting a
 *    node clears it (500);
 *  - 3 orbs per level; clearing every node is a level, with 300 for each orb you did not need.
 * Racks are laid out by level (no randomness), so the maximum a level can pay is known and checked against the server ceiling.
 */
export const G = 900;
export const FLOOR = 330;
export const PAD = { x: 60, y: 300 };
export const POINTS = { block: 50, node: 500, spareOrb: 300 } as const;
export const ORBS_PER_LEVEL = 3;
const BW = 26; const BH = 20; const NODE = 16; const R = 7;

export interface Rack { x: number; blocks: number; node: boolean }
export interface LaunchLabState {
  level: number; racks: Rack[]; score: number; orbsLeft: number; over: boolean;
  angle: number; power: number; aiming: boolean;
  orb: { x: number; y: number; vx: number; vy: number; t: number } | null;
  endIn: number | null;
}

/** The racks for a level: 2 to 4 racks, 2 to 4 blocks high, deterministic. */
export function levelLayout(level: number): Rack[] {
  const n = Math.min(4, 1 + level);
  // evenly spaced between x 250 and 430
  return Array.from({ length: n }, (_, i) => ({ x: 250 + i * (180 / (n - 1)), blocks: 2 + ((level + i) % 3), node: true }));
}

/** The most a level can pay: every block, every node, and two spare orbs. */
export const maxLevelScore = (level: number) => levelLayout(level).reduce((a, r) => a + r.blocks * POINTS.block + POINTS.node, 0) + (ORBS_PER_LEVEL - 1) * POINTS.spareOrb;

function init(): LaunchLabState {
  return { level: 1, racks: levelLayout(1), score: 0, orbsLeft: ORBS_PER_LEVEL, over: false, angle: 45, power: 600, aiming: false, orb: null, endIn: null };
}

function fire(s: LaunchLabState): void {
  if (s.orb || s.orbsLeft <= 0 || s.over) return;
  const a = (s.angle * Math.PI) / 180;
  s.orb = { x: PAD.x, y: PAD.y, vx: Math.cos(a) * s.power, vy: -Math.sin(a) * s.power, t: 0 };
  s.orbsLeft -= 1;
}

function aim(s: LaunchLabState, input: Input): void {
  if (input.up) s.angle = Math.min(80, s.angle + 1);
  if (input.down) s.angle = Math.max(10, s.angle - 1);
  if (input.right) s.power = Math.min(900, s.power + 8);
  if (input.left) s.power = Math.max(300, s.power - 8);
  const p = input.pointer;
  if (p && p.down && (s.aiming || Math.hypot(p.x - PAD.x, p.y - PAD.y) < 60)) {
    s.aiming = true;
    const dx = PAD.x - p.x; const dy = p.y - PAD.y;
    s.angle = Math.max(10, Math.min(80, (Math.atan2(dy, Math.max(1, dx)) * 180) / Math.PI));
    s.power = Math.max(300, Math.min(900, Math.hypot(dx, dy) * 9));
  } else if (s.aiming && (!p || !p.down)) { s.aiming = false; fire(s); }
  if (input.action) fire(s);
}

const blockRect = (r: Rack, i: number) => ({ x: r.x - BW / 2, y: FLOOR - (i + 1) * BH, w: BW, h: BH });
const nodeRect = (r: Rack) => ({ x: r.x - NODE / 2, y: FLOOR - r.blocks * BH - NODE, w: NODE, h: NODE });
const hits = (o: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) => o.x + R > b.x && o.x - R < b.x + b.w && o.y + R > b.y && o.y - R < b.y + b.h;

function flyOrb(s: LaunchLabState, d: number): void {
  const o = s.orb!;
  o.t += d; o.vy += G * d; o.x += o.vx * d; o.y += o.vy * d;
  for (const r of s.racks) {
    if (r.node && hits(o, nodeRect(r))) { r.node = false; s.score += POINTS.node; }
    for (let i = r.blocks - 1; i >= 0; i -= 1) {
      if (!hits(o, blockRect(r, i))) continue;
      if (Math.hypot(o.vx, o.vy) > 260) { r.blocks -= 1; s.score += POINTS.block; o.vx *= -0.5; o.vy *= 0.6; } else { o.vx = 0; o.vy = 0; }
      break;
    }
  }
  const done = o.x > 500 || o.x < -20 || o.y > FLOOR || o.t > 4 || (Math.abs(o.vx) < 5 && Math.abs(o.vy) < 5);
  if (done) s.orb = null;
}

function update(s: LaunchLabState, dt: number, input: Input): void {
  if (s.over) return;
  const d = Math.min(dt, 0.05);
  if (!s.orb) aim(s, input); else flyOrb(s, d);
  if (s.orb) return;
  if (!s.racks.some((r) => r.node)) {
    s.score += s.orbsLeft * POINTS.spareOrb;
    s.level += 1; s.racks = levelLayout(s.level); s.orbsLeft = ORBS_PER_LEVEL; s.endIn = null;
    return;
  }
  if (s.orbsLeft <= 0) {
    s.endIn = s.endIn === null ? 1.2 : s.endIn - d;
    if (s.endIn <= 0) s.over = true;
  }
}

function draw(ctx: Ctx, s: LaunchLabState, p: Palette): void {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, 480, 360);
  ctx.fillStyle = p.line; ctx.fillRect(0, FLOOR, 480, 360 - FLOOR);
  // launch pad: a plate with a chevron, no band
  ctx.fillStyle = p.ink; ctx.fillRect(PAD.x - 16, PAD.y + 8, 32, 6);
  ctx.strokeStyle = p.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(PAD.x - 8, PAD.y + 6); ctx.lineTo(PAD.x, PAD.y - 4); ctx.lineTo(PAD.x + 8, PAD.y + 6); ctx.stroke();
  if (!s.orb && !s.over) {
    const a = (s.angle * Math.PI) / 180; const len = s.power / 12;
    ctx.globalAlpha = 0.5; ctx.strokeStyle = p.berry; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD.x, PAD.y); ctx.lineTo(PAD.x + Math.cos(a) * len, PAD.y - Math.sin(a) * len); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const r of s.racks) {
    for (let i = 0; i < r.blocks; i += 1) {
      const b = blockRect(r, i);
      ctx.fillStyle = p.muted; ctx.fillRect(b.x, b.y, b.w, b.h - 2);
      ctx.fillStyle = p.leaf; ctx.fillRect(b.x + 4, b.y + 6, 4, 4); // a rack light
    }
    if (r.node) { const n = nodeRect(r); ctx.fillStyle = p.cherry; ctx.fillRect(n.x, n.y, n.w, n.h); }
  }
  if (s.orb) { ctx.fillStyle = p.berry; ctx.beginPath(); ctx.arc(s.orb.x, s.orb.y, R, 0, Math.PI * 2); ctx.fill(); }
}

const hud = (s: LaunchLabState): Hud => ({ score: s.score, lives: s.orbsLeft, level: s.level, over: s.over, hint: 'Up/Down aim, Left/Right power, Space to launch. Or drag back from the pad.' });

export const launchLab: Engine<LaunchLabState> = { id: 'launch-lab', init, update: (s, dt, input) => update(s, dt, input), draw, hud };
