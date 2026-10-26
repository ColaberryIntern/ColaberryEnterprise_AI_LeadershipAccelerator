/** C35 (v8 G3): Stack Drop, deterministic: the bag, collisions and walls, kicks, line clears and their score, drops, game over. */
import { seededRng } from '../engineTypes';
import { stackDrop, COLS, ROWS, fits, dropDistance, tryRotate, lock, hardDrop, clearScore, levelFor, gravityFor, type StackDropState } from '../stackDropEngine';
import { input, recordingCtx, PALETTE } from '../testKit';

const fresh = (seed = 1): StackDropState => stackDrop.init(seededRng(seed));
const fill = (s: StackDropState, row: number, except: number[] = []) => { for (let x = 0; x < COLS; x += 1) if (!except.includes(x)) s.grid[row][x] = 9; };

it('deals all seven shapes from each bag of seven (seeded, reproducible)', () => {
  const rng = seededRng(7);
  const s = stackDrop.init(rng);
  const seen = [s.cur.k, s.next];
  for (let i = 0; i < 5; i += 1) { hardDrop(s, rng); seen.push(s.next); }
  expect(new Set(seen).size).toBe(7);
  expect(fresh(3).cur.k).toBe(fresh(3).cur.k);
});

it('stops at the walls and the floor and on other blocks', () => {
  const s = fresh();
  s.cur.x = 0;
  expect(fits(s.grid, s.cur, -1, 0)).toBe(false);
  const d = dropDistance(s.grid, s.cur);
  expect(s.cur.cells.some(([, cy]) => s.cur.y + cy + d === ROWS - 1)).toBe(true);
  fill(s, ROWS - 1);
  expect(dropDistance(s.grid, s.cur)).toBe(d - 1);
});

it('rotates with a wall kick at the right wall', () => {
  const s = fresh();
  s.cur = { k: 0, cells: [[1, 0], [1, 1], [1, 2], [1, 3]], x: COLS - 2, y: 2 }; // a standing bar against the right wall
  expect(tryRotate(s.grid, s.cur)).toBe(true);
  expect(s.cur.cells.every(([cx]) => s.cur.x + cx < COLS)).toBe(true);
});

it('clears full rows, scores 100/300/500/800 x level, and levels up every 8 lines', () => {
  expect([1, 2, 3, 4].map((n) => clearScore(n, 1))).toEqual([100, 300, 500, 800]);
  expect(clearScore(4, 3)).toBe(2400);
  expect(clearScore(4, 25)).toBe(8000); // the scoring level stops at 10
  expect([levelFor(0), levelFor(7), levelFor(8), levelFor(16)]).toEqual([1, 1, 2, 3]);
  expect(gravityFor(2)).toBeLessThan(gravityFor(1));
  const rng = seededRng(2);
  const s = stackDrop.init(rng);
  fill(s, ROWS - 1, [4, 5, 6, 7]); fill(s, ROWS - 2, [4, 5, 6, 7]);
  s.cur = { k: 1, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], x: 4, y: ROWS - 2 };
  lock(s, rng);
  expect(s.lines).toBe(0); // only two of the four gaps filled
  s.cur = { k: 1, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], x: 6, y: ROWS - 2 };
  expect(lock(s, rng)).toBe(2);
  expect(s.score).toBe(300);
  expect(s.grid[ROWS - 1].every((c) => c === 0)).toBe(true);
});

it('a hard drop scores 2 a row and locks; a soft drop 1 a row', () => {
  const rng = seededRng(4);
  const s = stackDrop.init(rng);
  const d = dropDistance(s.grid, s.cur);
  stackDrop.update(s, 1 / 30, input({ action: true }), rng);
  expect(s.score).toBe(2 * d);
  const t = stackDrop.init(seededRng(4));
  stackDrop.update(t, 0.05, input({ down: true }), seededRng(9));
  expect(t.score).toBe(1);
});

it('ends when a new piece cannot enter the well; the HUD reports it', () => {
  const rng = seededRng(5);
  const s = stackDrop.init(rng);
  for (let y = 0; y < ROWS; y += 1) fill(s, y, [y % COLS]);
  hardDrop(s, rng);
  expect(s.over).toBe(true);
  expect(stackDrop.hud(s)).toMatchObject({ over: true });
});

it('draws the well, the ghost and NEXT through the palette only', () => {
  const ctx = recordingCtx();
  stackDrop.draw(ctx, fresh(), PALETTE);
  expect(ctx.calls.some((c) => c.op === 'fillText' && c.args[0] === 'NEXT')).toBe(true);
  expect(ctx.calls.every((c) => !/^#/.test(c.fill))).toBe(true);
});
