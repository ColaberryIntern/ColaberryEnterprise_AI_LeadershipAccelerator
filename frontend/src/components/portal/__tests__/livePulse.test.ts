import { LIVE_PULSES } from '../livePulse';

/**
 * DOC 04's Builder-pulse set.
 *
 * WHY THIS TINY FILE EXISTS. Two live surfaces now iterate `LIVE_PULSES` to render their
 * status grids, and their own tests iterate it to check what they rendered. That is circular:
 * drop a state from this module and every one of those tests still passes, having quietly
 * checked one fewer thing. So the set itself is pinned HERE, literally, and the surface tests
 * are free to iterate.
 *
 * It is also the requirement's own wording. DOC 04 names the four states; `CompanionDeck`
 * matched them and the class check-in page did not, which is what moved the list into a module
 * in the first place.
 */

describe('the Builder pulse set', () => {
  it('is exactly DOC 04 four states, in the order a class moves through them', () => {
    expect(LIVE_PULSES.map((p) => p.state)).toEqual(['here', 'building', 'stuck', 'finished']);
  });

  it('uses DOC 04 exact labels', () => {
    // "Following", not "I'm here": the check-in page said the latter, the companion the
    // former, and an aggregate cannot mean one thing while two surfaces word it differently.
    expect(LIVE_PULSES.map((p) => p.label)).toEqual(['Following', 'Building', 'Stuck', 'Finished']);
  });

  it('keeps `here` as the wire value behind "Following"', () => {
    // The label is presentation; `here` is in the database CHECK constraint and in every row
    // already recorded. Renaming the value would orphan all of them.
    const following = LIVE_PULSES.find((p) => p.label === 'Following');
    expect(following?.state).toBe('here');
  });

  it('gives every state an emoji, so a grid never renders a blank cell', () => {
    LIVE_PULSES.forEach((p) => { expect(p.emoji.length).toBeGreaterThan(0); });
  });
});
