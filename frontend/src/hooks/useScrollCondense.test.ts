import { nextCondensed } from './useScrollCondense';

// Pure predicate coverage — no DOM/scroll simulation needed. Guards the
// hysteresis band against a regression that would let a scroll wobble at the
// boundary flicker the condense transition back and forth.
describe('nextCondensed', () => {
  const enterAt = 220;
  const exitAt = 140;

  it('condenses once scrollY reaches the enter threshold', () => {
    expect(nextCondensed(false, 220, enterAt, exitAt)).toBe(true);
    expect(nextCondensed(false, 500, enterAt, exitAt)).toBe(true);
  });

  it('expands once scrollY drops to the exit threshold', () => {
    expect(nextCondensed(true, 140, enterAt, exitAt)).toBe(false);
    expect(nextCondensed(true, 0, enterAt, exitAt)).toBe(false);
  });

  it('holds the previous state inside the hysteresis band', () => {
    expect(nextCondensed(true, 180, enterAt, exitAt)).toBe(true);
    expect(nextCondensed(false, 180, enterAt, exitAt)).toBe(false);
  });
});
