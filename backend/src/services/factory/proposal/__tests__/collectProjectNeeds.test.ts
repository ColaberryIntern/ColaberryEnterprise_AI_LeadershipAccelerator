import { extractNeeds, isHumanNeed } from '../collectProjectNeeds';
import type { HumanNeed } from '../proposalReviewTypes';

const need = (over: Partial<HumanNeed> & Pick<HumanNeed, 'key' | 'kind'>): HumanNeed => ({
  ask: 'a', why: 'w', format: 'f', blocking: 'score', usedIn: [], ...over,
});

describe('isHumanNeed', () => {
  it('accepts a well-formed need and rejects junk', () => {
    expect(isHumanNeed(need({ key: 'fact:x', kind: 'fact' }))).toBe(true);
    expect(isHumanNeed(null)).toBe(false);
    expect(isHumanNeed({ key: 'x' })).toBe(false); // no kind / usedIn
    expect(isHumanNeed({ kind: 'fact', key: 'x', usedIn: 'nope' })).toBe(false);
  });
});

describe('extractNeeds', () => {
  it('pulls needs from gap rows', () => {
    const out = extractNeeds([{ need: need({ key: 'fact:duns', kind: 'fact' }) }, { need: null }], []);
    expect(out.map((n) => n.key)).toEqual(['fact:duns']);
  });

  it('pulls human-resolver finding needs and ignores agent findings', () => {
    const findings = [
      { check: 'format', severity: 'fatal', resolver: 'human', need: need({ key: 'signature:w9', kind: 'signature' }) },
      { check: 'coverage', severity: 'major', resolver: 'agent', fixHint: 'add section' },
      { check: 'fact', severity: 'fatal', resolver: 'human' }, // human but no need → skipped
    ];
    const out = extractNeeds([], [findings]);
    expect(out.map((n) => n.key)).toEqual(['signature:w9']);
  });

  it('combines both sources and skips non-array finding sets', () => {
    const out = extractNeeds(
      [{ need: need({ key: 'fact:years', kind: 'fact' }) }],
      [null, 'not-an-array', [{ resolver: 'human', need: need({ key: 'file:hub', kind: 'file' }) }]],
    );
    expect(out.map((n) => n.key).sort()).toEqual(['fact:years', 'file:hub']);
  });
});
