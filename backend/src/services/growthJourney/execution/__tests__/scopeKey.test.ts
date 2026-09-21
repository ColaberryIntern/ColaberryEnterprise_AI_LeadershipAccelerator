import {
  ScopeKeyError,
  WILDCARD,
  describeScopeKey,
  pauseScopeKey,
  pauseScopeKeysFor,
  rolloutScopeKey,
} from '../scopeKey';

/**
 * T504 — the canonical scope key. Pure, and the one place a pause with no scope
 * is refused: that would be a second global kill switch beside the existing one.
 */

describe('rolloutScopeKey', () => {
  it('names all three dimensions, because a rollout RAISES a mode', () => {
    expect(rolloutScopeKey({ brandId: 'b-ent', programId: 'p-ent', channel: 'email' })).toBe('rollout|b-ent|p-ent|email');
  });

  it.each([
    ['brand', { brandId: '', programId: 'p', channel: 'email' }],
    ['programme', { brandId: 'b', programId: '', channel: 'email' }],
    ['channel', { brandId: 'b', programId: 'p', channel: '' }],
  ])('refuses a rollout with no %s', (_name, scope) => {
    expect(() => rolloutScopeKey(scope as never)).toThrow(ScopeKeyError);
  });
});

describe('pauseScopeKey', () => {
  it('wildcards whatever is not named', () => {
    expect(pauseScopeKey({ brandId: 'b-ent' })).toBe('pause|b-ent|*|*|*');
    expect(pauseScopeKey({ channel: 'email' })).toBe('pause|*|*|email|*');
    expect(pauseScopeKey({ subjectRef: 'lead:501' })).toBe('pause|*|*|*|lead:501');
    expect(pauseScopeKey({ brandId: 'b', programId: 'p', channel: 'in_app', subjectRef: 'lead:1' })).toBe('pause|b|p|in_app|lead:1');
  });

  it('REFUSES a pause with no scope at all - that would be a second global kill switch', () => {
    expect(() => pauseScopeKey({})).toThrow(ScopeKeyError);
    expect(() => pauseScopeKey({ brandId: null, programId: null, channel: null, subjectRef: null })).toThrow(/second global kill switch/);
    expect(() => pauseScopeKey({ brandId: '', channel: '' })).toThrow(ScopeKeyError);
  });

  it('refuses a part that would forge a second field', () => {
    expect(() => pauseScopeKey({ brandId: 'b|*|*|*' })).toThrow(ScopeKeyError);
  });
});

describe('pauseScopeKeysFor', () => {
  const target = { brandId: 'b-ent', programId: 'p-ent', channel: 'email', subjectRef: 'lead:501' };

  it('is every key that could cover the target, most specific first, and never the all-wildcard one', () => {
    const keys = pauseScopeKeysFor(target);
    expect(keys).toHaveLength(15); // 2^4 - the refused all-wildcard
    expect(keys[0]).toBe('pause|b-ent|p-ent|email|lead:501');
    expect(keys).toContain('pause|b-ent|*|*|*');
    expect(keys).toContain('pause|*|*|email|*');
    expect(keys).not.toContain(`pause|${WILDCARD}|${WILDCARD}|${WILDCARD}|${WILDCARD}`);
    const named = keys.map((k) => k.split('|').slice(1).filter((p) => p !== WILDCARD).length);
    expect(named).toEqual([...named].sort((a, b) => b - a)); // monotonically less specific
  });

  it('a target with no subject yields the eight keys that do not name one', () => {
    const keys = pauseScopeKeysFor({ brandId: 'b', programId: 'p', channel: 'email' });
    expect(keys).toHaveLength(7); // 2^3 - the all-wildcard
    expect(keys.every((k) => k.endsWith(`|${WILDCARD}`))).toBe(true);
  });
});

describe('describeScopeKey', () => {
  it('names the dimensions a pause actually narrowed, for the reason a human reads', () => {
    expect(describeScopeKey('pause|b-ent|*|*|*')).toBe('pause:brand');
    expect(describeScopeKey('pause|b-ent|*|email|*')).toBe('pause:brand+channel');
    expect(describeScopeKey('pause|*|*|*|lead:501')).toBe('pause:subject');
    expect(describeScopeKey('pause|b|p|email|lead:1')).toBe('pause:brand+programme+channel+subject');
  });
});
