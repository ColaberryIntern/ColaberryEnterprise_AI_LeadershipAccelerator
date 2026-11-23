import { isAffirmative } from '../affirmative';

/**
 * The single gate deciding what counts as a tick, for every consent in the product.
 *
 * Worth its own file because it is the one place where "the person agreed" is decided, and
 * because it is now imported by two unrelated callers - the consent-record writer and the
 * Open House controller's naming grant. If it drifted, one of them would start recording a
 * grant the other reads as a refusal.
 */
describe('isAffirmative', () => {
  it.each([true, 'true', 'on'])('treats %p as a tick, which is how forms actually send one', (v) => {
    expect(isAffirmative(v as boolean | string)).toBe(true);
  });

  // THE SIDE THAT MATTERS. Everything unrecognised has to be silence, because the cost of a
  // false positive here is a consent record for permission nobody gave.
  it.each([false, 'false', 'off', '0', '', 'TRUE', 'On', 'yes', '1', undefined, null])(
    'treats %p as NO grant', (v) => {
      expect(isAffirmative(v as never)).toBe(false);
    },
  );

  it('is not merely returning false for everything', () => {
    // The control: without this, the block above would pass if the function were `() => false`.
    expect(isAffirmative(true)).toBe(true);
  });
});
