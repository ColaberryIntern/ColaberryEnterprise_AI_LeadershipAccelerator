/** C10 score acceptance: whole numbers within ceiling x (seconds + 30) + burst, never above the absolute cap. */
import { acceptScore, maxScoreFor, GAME_RULES, GAMES, isGame } from '../gameRoomRules';

describe('maxScoreFor', () => {
  it.each(GAMES)('%s: ceiling x (seconds + 30) + burst, capped', (g) => {
    const r = GAME_RULES[g];
    expect(maxScoreFor(g, 0)).toBe(r.ceilingPerSecond * 30 + r.burst);
    expect(maxScoreFor(g, 60)).toBe(r.ceilingPerSecond * 90 + r.burst);
    expect(maxScoreFor(g, 10_000_000)).toBe(r.absoluteCap);
    expect(maxScoreFor(g, -5)).toBe(r.ceilingPerSecond * 30 + r.burst);
  });
});

describe('acceptScore', () => {
  it('accepts at the boundary and refuses one over', () => {
    const max = maxScoreFor('bug-breaker', 120);
    expect(acceptScore('bug-breaker', max, 120)).toBe(true);
    expect(acceptScore('bug-breaker', max + 1, 120)).toBe(false);
  });
  it.each([[-1], [1.5], [NaN], ['100'], [null], [Infinity]])('refuses %p', (s) => {
    expect(acceptScore('byte-chase', s, 600)).toBe(false);
  });
  it('accepts zero', () => { expect(acceptScore('launch-lab', 0, 0)).toBe(true); });
});

it('isGame knows exactly the five games (C35 added Stack Drop and Token Trail)', () => {
  expect(GAMES).toEqual(['byte-chase', 'launch-lab', 'bug-breaker', 'stack-drop', 'token-trail']);
  expect(isGame('stack-drop')).toBe(true);
  expect(isGame('byte-chase')).toBe(true);
  expect(isGame('pac')).toBe(false);
  expect(isGame(3)).toBe(false);
});
