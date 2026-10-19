/** C10 Bug Breaker: serving, bouncing, bricks worth 25 x level, two-hit top row from level 2, level clear, lives. */
import { bugBreaker, wall, POINTS, PADDLE, BugBreakerState } from '../bugBreakerEngine';
import { seededRng } from '../engineTypes';
import { input } from '../testKit';

const rng = seededRng(3);
const fresh = (): BugBreakerState => bugBreaker.init(rng);

it('the wall is 8 x 5; from level 2 the top row takes two hits', () => {
  expect(wall(1)).toHaveLength(40);
  expect(wall(1).every((b) => b.hits === 1)).toBe(true);
  expect(wall(2).filter((b) => b.hits === 2)).toHaveLength(8);
});

it('nothing moves until a serve (Space or a tap)', () => {
  const s = fresh();
  bugBreaker.update(s, 0.02, input(), rng);
  expect(s.ball).toBeNull();
  bugBreaker.update(s, 0.02, input({ action: true }), rng);
  expect(s.ball).not.toBeNull();
});

it('the paddle follows the pointer and stays on screen', () => {
  const s = fresh();
  bugBreaker.update(s, 0.02, input({ pointer: { x: 5, y: 300, down: false } }), rng);
  expect(s.paddleX).toBe(PADDLE.w / 2);
});

it('a brick is worth 25 x the level', () => {
  const s = fresh();
  s.level = 3;
  const br = s.bricks[0];
  s.ball = { x: br.x + 20, y: br.y + 25, vx: 0, vy: -300 };
  bugBreaker.update(s, 0.02, input(), rng);
  expect(s.score).toBe(POINTS.brickPerLevel * 3);
  expect(s.ball!.vy).toBeGreaterThan(0);
});

it('a missed ball costs a life; the third ends the game', () => {
  const s = fresh();
  for (let i = 1; i <= 3; i += 1) {
    s.ball = { x: 10, y: 365, vx: 0, vy: 300 };
    s.paddleX = 400;
    bugBreaker.update(s, 0.05, input(), rng);
    expect(s.lives).toBe(3 - i);
  }
  expect(s.over).toBe(true);
});

it('clearing the wall is a level (250) and the ball gets faster', () => {
  const s = fresh();
  s.bricks.forEach((b) => { b.hits = 0; });
  const last = s.bricks[0]; last.hits = 1;
  s.ball = { x: last.x + 20, y: last.y + 25, vx: 0, vy: -300 };
  bugBreaker.update(s, 0.02, input(), rng);
  expect(s.score).toBe(POINTS.brickPerLevel + POINTS.level);
  expect(s.level).toBe(2);
  expect(s.speed).toBeGreaterThan(330);
});
