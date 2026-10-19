import type { Ctx, Engine, Hud, Input, Palette } from './engineTypes';

/**
 * BUG BREAKER (Colaberry Campus C10). Keep a ball in play with the paddle and clear the wall of bugs.
 *  - bricks are BUGS in a 8 x 5 wall; each is worth 25 x the level; from level 2 the top row takes two hits;
 *  - clearing the wall is a level (250) and the ball gets faster; 3 lives;
 *  - move with the mouse or a finger, the arrows or A/D; click, tap or Space to serve.
 * Scoring here must stay under the server ceiling (backend gameRoomRules 'bug-breaker'); the bot test proves it.
 */
export const POINTS = { brickPerLevel: 25, level: 250 } as const;
const COLS = 8; const ROWS = 5; const BW = 52; const BH = 18; const GAP = 4; const TOP = 40;
const LEFT = (480 - (COLS * BW + (COLS - 1) * GAP)) / 2;
export const PADDLE = { w: 84, h: 10, y: 322 };
const R = 6;

export interface Brick { x: number; y: number; hits: number }
export interface BugBreakerState {
  level: number; bricks: Brick[]; score: number; lives: number; over: boolean;
  paddleX: number; ball: { x: number; y: number; vx: number; vy: number } | null; speed: number;
}

export function wall(level: number): Brick[] {
  const out: Brick[] = [];
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) out.push({ x: LEFT + c * (BW + GAP), y: TOP + r * (BH + GAP), hits: level >= 2 && r === 0 ? 2 : 1 });
  return out;
}

const speedFor = (level: number) => 300 + level * 30;

function init(): BugBreakerState {
  return { level: 1, bricks: wall(1), score: 0, lives: 3, over: false, paddleX: 240, ball: null, speed: speedFor(1) };
}

function serve(s: BugBreakerState): void {
  s.ball = { x: s.paddleX, y: PADDLE.y - R - 1, vx: s.speed * 0.45, vy: -s.speed * 0.9 };
}

function movePaddle(s: BugBreakerState, d: number, input: Input): void {
  if (input.pointer) s.paddleX = input.pointer.x;
  if (input.left) s.paddleX -= 420 * d;
  if (input.right) s.paddleX += 420 * d;
  s.paddleX = Math.max(PADDLE.w / 2, Math.min(480 - PADDLE.w / 2, s.paddleX));
}

function bounceBricks(s: BugBreakerState): void {
  const b = s.ball!;
  for (const br of s.bricks) {
    if (br.hits <= 0) continue;
    if (b.x + R < br.x || b.x - R > br.x + BW || b.y + R < br.y || b.y - R > br.y + BH) continue;
    br.hits -= 1;
    if (br.hits === 0) s.score += POINTS.brickPerLevel * s.level;
    const fromSide = b.x < br.x || b.x > br.x + BW;
    if (fromSide) b.vx = -b.vx; else b.vy = -b.vy;
    return;
  }
}

function update(s: BugBreakerState, dt: number, input: Input): void {
  if (s.over) return;
  const d = Math.min(dt, 0.05);
  movePaddle(s, d, input);
  if (!s.ball) { if (input.action || (input.pointer?.down ?? false)) serve(s); return; }
  const b = s.ball;
  b.x += b.vx * d; b.y += b.vy * d;
  if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); }
  if (b.x > 480 - R) { b.x = 480 - R; b.vx = -Math.abs(b.vx); }
  if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); }
  const onPaddle = b.vy > 0 && b.y + R >= PADDLE.y && b.y + R <= PADDLE.y + PADDLE.h + 8 && Math.abs(b.x - s.paddleX) <= PADDLE.w / 2 + R;
  if (onPaddle) {
    const off = (b.x - s.paddleX) / (PADDLE.w / 2); // -1..1 steers the ball
    const sp = Math.hypot(b.vx, b.vy) * 1.01;
    b.vx = sp * off * 0.75; b.vy = -Math.sqrt(Math.max(1, sp * sp - b.vx * b.vx));
  }
  bounceBricks(s);
  if (b.y > 370) {
    s.ball = null; s.lives -= 1;
    if (s.lives <= 0) s.over = true;
    return;
  }
  if (s.bricks.every((br) => br.hits <= 0)) {
    s.score += POINTS.level; s.level += 1; s.bricks = wall(s.level); s.speed = speedFor(s.level); s.ball = null;
  }
}

function draw(ctx: Ctx, s: BugBreakerState, p: Palette): void {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, 480, 360);
  for (const br of s.bricks) {
    if (br.hits <= 0) continue;
    ctx.fillStyle = br.hits > 1 ? p.cherry : p.leaf;
    ctx.fillRect(br.x, br.y, BW, BH);
    ctx.fillStyle = p.bg; ctx.fillRect(br.x + BW / 2 - 1, br.y + 3, 2, BH - 6); // a bug's split shell
  }
  ctx.fillStyle = p.berry; ctx.fillRect(s.paddleX - PADDLE.w / 2, PADDLE.y, PADDLE.w, PADDLE.h);
  const b = s.ball ?? { x: s.paddleX, y: PADDLE.y - R - 1 };
  ctx.fillStyle = p.ink; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
}

const hud = (s: BugBreakerState): Hud => ({ score: s.score, lives: s.lives, level: s.level, over: s.over, hint: 'Mouse, finger, arrows or A/D. Click, tap or Space to serve.' });

export const bugBreaker: Engine<BugBreakerState> = { id: 'bug-breaker', init, update: (s, dt, input) => update(s, dt, input), draw, hud };
