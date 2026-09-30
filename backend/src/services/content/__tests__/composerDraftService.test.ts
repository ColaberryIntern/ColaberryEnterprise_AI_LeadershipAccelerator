/**
 * composerDraftService — the "write a first draft" convenience, and the guard that keeps it from
 * inventing facts.
 *
 * `findInventedSpecifics` is the part worth testing hardest. The prompt tells the model not to
 * make up dates, prices or seat counts, but a prompt is not a control: this is the second reader
 * that checks whether it did, and its output goes in front of the person whose name ends up on
 * the post.
 */

import { findInventedSpecifics } from '../composerDraftService';

const BRIEF = 'Brand: Colaberry Training\nCampaign: Explorer Accelerator Interest\nTopic: our free AI class for working analysts';

describe('findInventedSpecifics', () => {
  it('catches a price nobody supplied', () => {
    expect(findInventedSpecifics('Seats are $49 each.', BRIEF)).toContain('price $49');
  });

  it('catches a date, a time and a seat count nobody supplied', () => {
    const text = 'Join us Oct 14 at 6:30pm. Only 20 seats.';
    const found = findInventedSpecifics(text, BRIEF);
    expect(found.join(' ')).toMatch(/date oct 14/i);
    expect(found.join(' ')).toMatch(/time 6:30pm/i);
    expect(found.join(' ')).toMatch(/capacity 20 seats/i);
  });

  it('catches a statistic, which is the most quotable kind of invention', () => {
    expect(findInventedSpecifics('92% of analysts say so.', BRIEF).join(' ')).toMatch(/figure 92 ?%/);
  });

  it('does NOT flag a specific the brief actually contained', () => {
    // The whole point: the check is "unsupported", not "numeric". Flagging supplied facts would
    // train the operator to ignore the warning, which is worse than not having one.
    const brief = `${BRIEF}\nThe link sends people to: https://x/y?price=49`;
    expect(findInventedSpecifics('It costs $49.', brief)).toEqual([]);
  });

  it('does NOT flag a bracketed placeholder, which is the sanctioned form', () => {
    expect(findInventedSpecifics('Join us on [date] at [time]. Seats: [number].', BRIEF)).toEqual([]);
  });

  it('leaves ordinary prose alone', () => {
    expect(findInventedSpecifics('Join our free class for working analysts. Details at the link below.', BRIEF)).toEqual([]);
  });

  it('reports each distinct claim once, however often it repeats', () => {
    expect(findInventedSpecifics('$49 now, $49 later, $49 always.', BRIEF)).toEqual(['price $49']);
  });
});
