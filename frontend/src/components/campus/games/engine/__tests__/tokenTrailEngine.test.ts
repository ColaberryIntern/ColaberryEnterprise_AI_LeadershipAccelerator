/** C35 (v8 G3): Token Trail, deterministic: start, growth and score, levels and speed, walls, self-collision, no reversing. */
import { seededRng } from '../engineTypes';
import { tokenTrail, step, COLS, ROWS, levelFor, speedFor, tokenScore, type TokenTrailState } from '../tokenTrailEngine';
import { input, recordingCtx, PALETTE } from '../testKit';

const fresh = (): TokenTrailState => tokenTrail.init(seededRng(1));

it('starts in the middle heading up, three long', () => {
  const s = fresh();
  expect(s.body[0]).toEqual([COLS / 2, ROWS / 2]);
  expect(s.dir).toBe('up');
  expect(s.body).toHaveLength(3);
});

it('a token is +10 x level and grows the trail by one; levels every 6 tokens and gets faster', () => {
  const rng = seededRng(2);
  const s = tokenTrail.init(rng);
  s.token = [s.body[0][0], s.body[0][1] - 1];
  step(s, rng);
  expect(s.score).toBe(10);
  expect(s.tokens).toBe(1);
  step(s, rng);
  expect(s.body).toHaveLength(4);
  expect([levelFor(5), levelFor(6), levelFor(12)]).toEqual([1, 2, 3]);
  expect(tokenScore(2)).toBe(20);
  expect(tokenScore(40)).toBe(150); // the scoring level stops at 15
  expect(speedFor(2)).toBeGreaterThan(speedFor(1));
  expect(speedFor(99)).toBe(18);
});

it('hitting a wall ends the run', () => {
  const rng = seededRng(3);
  const s = tokenTrail.init(rng);
  s.token = [0, 0];
  for (let i = 0; i < ROWS && !s.over; i += 1) step(s, rng);
  expect(s.over).toBe(true);
});

it('running into your own trail ends the run; turning straight back is ignored', () => {
  const rng = seededRng(4);
  const s = tokenTrail.init(rng);
  s.queued = 'down'; // straight back: ignored
  step(s, rng);
  expect(s.over).toBe(false);
  expect(s.dir).toBe('up');
  s.body = [[5, 5], [5, 6], [6, 6], [6, 5], [6, 4]]; s.dir = 'right'; s.token = [0, 0];
  step(s, rng); // head (5,5) -> (6,5): the trail is there
  expect(s.over).toBe(true);
});

it('steps on its own clock and follows the arrows or a swipe', () => {
  const rng = seededRng(5);
  const s = tokenTrail.init(rng);
  s.token = [0, 0];
  const frames = (i: ReturnType<typeof input>) => { for (let f = 0; f < 4; f += 1) tokenTrail.update(s, 0.05, f === 0 ? i : input(), rng); }; // a frame is at most 0.05 s
  frames(input({ left: true }));
  expect(s.dir).toBe('left');
  frames(input({ swipe: 'up' }));
  expect(s.dir).toBe('up');
});

it('draws the token and the trail through the palette only', () => {
  const ctx = recordingCtx();
  tokenTrail.draw(ctx, fresh(), PALETTE);
  expect(ctx.calls.some((c) => c.op === 'fillText' && c.args[0] === 'T')).toBe(true);
  expect(ctx.calls.every((c) => !/^#/.test(c.fill))).toBe(true);
});
