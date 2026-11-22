import {
  dailyCapHoldUntil, findEarlierSend, lookBackFrom, nextSendAt, normalizeText, windowHoldUntil, PACE_MIN_MS, PACE_JITTER_MS, SKEW_MARGIN_S,
} from '../sendRules';

/** CH10.4 the WhatsApp sending rules: pacing never fixed, the 8 AM to 8 PM Central window, the daily cap, the W5 match. */
const at = (iso: string): Date => new Date(iso);

describe('pacing', () => {
  it('the next send is 40 to 80 seconds later, and the gap varies with the random draw', () => {
    const now = at('2026-12-01T18:00:00Z');
    const gaps = [0, 0.25, 0.5, 0.999999, 1, -1].map((r) => nextSendAt(now, () => r).getTime() - now.getTime());
    for (const g of gaps) { expect(g).toBeGreaterThanOrEqual(PACE_MIN_MS); expect(g).toBeLessThan(PACE_MIN_MS + PACE_JITTER_MS); }
    expect(new Set(gaps.slice(0, 4)).size).toBe(4);
  });
  it('with a seeded sequence the gaps are never one fixed interval', () => {
    let seed = 7;
    const rand = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const now = at('2026-12-01T18:00:00Z');
    const gaps = Array.from({ length: 20 }, () => nextSendAt(now, rand).getTime() - now.getTime());
    expect(new Set(gaps).size).toBeGreaterThan(15);
  });
});

describe('the 8 AM to 8 PM Central window', () => {
  it('7:59 PM Central sends; 8:00 PM holds until 8:00 AM the next day (CST)', () => {
    expect(windowHoldUntil(at('2026-12-02T01:59:00Z'))).toBeNull(); // 7:59 PM CST Dec 1
    expect(windowHoldUntil(at('2026-12-02T02:00:00Z'))).toEqual(at('2026-12-02T14:00:00Z')); // 8:00 PM CST -> 8:00 AM CST
  });
  it('before 8 AM holds until 8 AM the same day; 8:00 AM exactly sends', () => {
    expect(windowHoldUntil(at('2026-12-01T13:30:00Z'))).toEqual(at('2026-12-01T14:00:00Z'));
    expect(windowHoldUntil(at('2026-12-01T14:00:00Z'))).toBeNull();
  });
  it('across the DST change on 2027-03-14: 8 PM CST Saturday holds until 8 AM CDT Sunday', () => {
    expect(windowHoldUntil(at('2027-03-14T02:00:00Z'))).toEqual(at('2027-03-14T13:00:00Z')); // 8:00 AM CDT = 13:00Z
    expect(windowHoldUntil(at('2027-03-15T00:59:00Z'))).toBeNull(); // 7:59 PM CDT
    expect(windowHoldUntil(at('2027-03-15T01:00:00Z'))).toEqual(at('2027-03-15T13:00:00Z'));
  });
});

describe('the daily cap', () => {
  const now = at('2026-12-01T18:00:00Z'); // Dec 1 Central
  it('the 40th send of the day is allowed; the 41st waits until 8 AM Central tomorrow', () => {
    expect(dailyCapHoldUntil({ day: '2026-12-01', count: 39 }, 40, now)).toBeNull();
    expect(dailyCapHoldUntil({ day: '2026-12-01', count: 40 }, 40, now)).toEqual(at('2026-12-02T14:00:00Z'));
  });
  it('yesterday\'s count does not hold today; no count yet does not hold', () => {
    expect(dailyCapHoldUntil({ day: '2026-11-30', count: 40 }, 40, now)).toBeNull();
    expect(dailyCapHoldUntil({ day: null, count: 0 }, 40, now)).toBeNull();
  });
  it('the day is the Central day, not UTC (11 PM Central is still today)', () => {
    expect(dailyCapHoldUntil({ day: '2026-12-01', count: 40 }, 40, at('2026-12-02T05:00:00Z'))).not.toBeNull();
  });
});

describe('W5 the earlier-send match', () => {
  const sent = [{ id: 'a', text: 'Demo  Tuesday\n at 6 PM. ' }, { id: 'b', text: 'Something else' }, { id: 'c', text: null }];
  it('matches the exact text after normalizing spaces, line breaks and Unicode form', () => {
    expect(normalizeText('Café ')).toBe(normalizeText('Café'));
    expect(findEarlierSend(sent, 'Demo Tuesday at 6 PM.', new Set())).toEqual({ kind: 'one', id: 'a' });
    expect(findEarlierSend(sent, 'Demo Tuesday at 7 PM.', new Set())).toEqual({ kind: 'none' });
  });
  it('ignores a message another delivery already recorded as its own', () => {
    expect(findEarlierSend(sent, 'Demo Tuesday at 6 PM.', new Set(['a']))).toEqual({ kind: 'none' });
  });
  it('two unrecorded matches are ambiguous', () => {
    expect(findEarlierSend([...sent, { id: 'd', text: 'Demo Tuesday at 6 PM.' }], 'Demo Tuesday at 6 PM.', new Set())).toEqual({ kind: 'many', ids: ['a', 'd'] });
  });
  it('looks back from the first claim minus the 120 s margin, in whole Unix seconds', () => {
    const claimed = at('2026-12-01T18:00:00.900Z');
    expect(lookBackFrom(claimed)).toBe(Math.floor(claimed.getTime() / 1000) - SKEW_MARGIN_S);
    // A message WhatsApp stamped one second after the claim on a clock 90 s behind ours is still inside.
    const stamped = Math.floor(claimed.getTime() / 1000) + 1 - 90;
    expect(stamped).toBeGreaterThanOrEqual(lookBackFrom(claimed));
  });
});
