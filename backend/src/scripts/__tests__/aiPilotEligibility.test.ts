// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildOptOutSet, isValidCanSpamAddress, shouldSend } = require('../lib/aiPilotEligibility');

describe('buildOptOutSet', () => {
  it('unions replied + suppression, lowercased and trimmed', () => {
    const s = buildOptOutSet(['  Alice@X.com '], ['BOB@y.com', 'alice@x.com']);
    expect(s.has('alice@x.com')).toBe(true);
    expect(s.has('bob@y.com')).toBe(true);
    expect(s.size).toBe(2); // alice de-duplicated across both lists
  });
  it('handles missing/empty lists', () => {
    expect(buildOptOutSet(null, undefined).size).toBe(0);
    expect(buildOptOutSet([], []).size).toBe(0);
  });
});

describe('isValidCanSpamAddress', () => {
  it('accepts a real postal address (has a number)', () => {
    expect(isValidCanSpamAddress('200 Chisholm Place, Plano TX')).toBe(true);
  });
  it('rejects empty or number-less addresses (the live-send gate)', () => {
    expect(isValidCanSpamAddress('')).toBe(false);
    expect(isValidCanSpamAddress(undefined)).toBe(false);
    expect(isValidCanSpamAddress('mailing address to be confirmed')).toBe(false);
  });
});

describe('shouldSend', () => {
  const opt = buildOptOutSet(['opted@x.com'], ['bounced@x.com']);

  it('sends touch 1 to a fresh, non-opted-out lead', () => {
    expect(shouldSend('new@x.com', '1', opt, {})).toEqual({ send: true, reason: 'eligible' });
  });
  it('never sends to an opted-out or bounced address (case-insensitive)', () => {
    expect(shouldSend('OPTED@x.com', '1', opt, {}).send).toBe(false);
    expect(shouldSend('bounced@x.com', '1', opt, {}).reason).toBe('opted-out');
  });
  it('is idempotent: never re-sends a touch already recorded', () => {
    const sent = { 'a@x.com': { '1': true } };
    expect(shouldSend('a@x.com', '1', opt, sent)).toEqual({ send: false, reason: 'already-sent-touch' });
  });
  it('never sends a follow-up (touch > 1) to someone who never got touch 1', () => {
    expect(shouldSend('a@x.com', '2', opt, {})).toEqual({ send: false, reason: 'no-touch-1' });
    const sent = { 'a@x.com': { '1': true } };
    expect(shouldSend('a@x.com', '2', opt, sent).send).toBe(true);
  });
  it('rejects a malformed email', () => {
    expect(shouldSend('not-an-email', '1', opt, {}).reason).toBe('invalid-email');
  });
});
