/* eslint-disable */
// Unit tests for the authored research-story acceptance criteria.
//
// These 60 stories are graded against this table, so the tests guard three things: that the
// table is COMPLETE (six families, three criteria each), that the resolver REFUSES any story
// it does not own rather than handing out a default set, and that the criteria stay
// well-formed. The refusal case is the important one: a domain added later must not silently
// inherit another domain's standard.

const {
  RESEARCH_ACCEPTANCE, RESEARCH_FAMILIES, familyOf, acceptanceFor,
} = require('../researchStoryAcceptance');

/** The ten real domain keys, read from `agent_domain_projects` in production on 2026-10-20. */
const DOMAINS = [
  'admissions', 'curriculum', 'executive', 'internship', 'learner_success',
  'marketing', 'platform', 'product_experience', 'sales', 'website',
];

describe('the table is complete and well-formed', () => {
  it('has exactly six families', () => {
    expect(RESEARCH_FAMILIES).toHaveLength(6);
  });

  it('covers the five r0 research families and the r1 migration plan', () => {
    expect(RESEARCH_FAMILIES).toEqual(expect.arrayContaining([
      'RESEARCH-1-SYSTEM-CLASSES',
      'RESEARCH-2-AGENT-ANATOMY',
      'RESEARCH-3-ROLE-AND-DA-TRANSITION',
      'RESEARCH-4-MANAGER-INTERVIEW',
      'RESEARCH-5-THREE-PROPOSED-TASKS',
      'LEGACY-MIGRATION-PLAN',
    ]));
  });

  it('gives every family exactly three criteria', () => {
    for (const fam of RESEARCH_FAMILIES) {
      expect(RESEARCH_ACCEPTANCE[fam]).toHaveLength(3);
    }
  });

  it('has no empty, whitespace-only or stub criterion', () => {
    for (const fam of RESEARCH_FAMILIES) {
      for (const c of RESEARCH_ACCEPTANCE[fam]) {
        expect(typeof c).toBe('string');
        expect(c.trim().length).toBeGreaterThan(30);
        expect(c).not.toMatch(/\b(TBD|TODO|FIXME|n\/a)\b/i);
      }
    }
  });

  it('has 18 distinct criteria with no copy-paste duplication across families', () => {
    const all = RESEARCH_FAMILIES.flatMap((f) => RESEARCH_ACCEPTANCE[f]);
    expect(all).toHaveLength(18);
    expect(new Set(all).size).toBe(18);
  });

  it('ends every criterion as a sentence', () => {
    for (const fam of RESEARCH_FAMILIES) {
      for (const c of RESEARCH_ACCEPTANCE[fam]) expect(c.endsWith('.')).toBe(true);
    }
  });
});

describe('the criteria carry the platform rules they are meant to carry', () => {
  // Both of these echo rules the platform holds itself to. If an edit drops them, the
  // interns are being graded more loosely than the platform grades itself.
  it('RESEARCH-5 refuses "marked done" as its own evidence', () => {
    expect(RESEARCH_ACCEPTANCE['RESEARCH-5-THREE-PROPOSED-TASKS'].join(' '))
      .toMatch(/other than the task being marked done/i);
  });

  it('LEGACY-MIGRATION-PLAN requires replayability', () => {
    expect(RESEARCH_ACCEPTANCE['LEGACY-MIGRATION-PLAN'].join(' '))
      .toMatch(/replayable|twice/i);
  });
});

describe('familyOf / acceptanceFor resolve real story ids', () => {
  it('resolves every family for every domain - 60 stories', () => {
    let resolved = 0;
    for (const d of DOMAINS) {
      for (const fam of RESEARCH_FAMILIES) {
        const id = `${d}.${fam}`;
        expect(familyOf(id)).toBe(fam);
        expect(acceptanceFor(id)).toHaveLength(3);
        resolved += 1;
      }
    }
    expect(resolved).toBe(60);
  });

  it('handles a domain key containing an underscore', () => {
    expect(familyOf('product_experience.RESEARCH-2-AGENT-ANATOMY'))
      .toBe('RESEARCH-2-AGENT-ANATOMY');
  });
});

describe('it must refuse any story it does not own', () => {
  it('returns null for a release-2 capability story', () => {
    // These carry criteria MIGRATED from the capability record. This module answering for
    // one would overwrite an authored criterion with a generic research checklist.
    expect(familyOf('marketing.CAP.platform_app_review_and_representation')).toBeNull();
    expect(acceptanceFor('marketing.CAP.platform_app_review_and_representation')).toBeNull();
  });

  it('returns null for STORY-000 and legacy numbered ids', () => {
    expect(acceptanceFor('STORY-000')).toBeNull();
    expect(acceptanceFor('STORY-018')).toBeNull();
  });

  it('returns null for an unknown family on a known domain', () => {
    expect(acceptanceFor('admissions.RESEARCH-9-DOES-NOT-EXIST')).toBeNull();
  });

  it('returns null for malformed or non-string input', () => {
    expect(acceptanceFor('')).toBeNull();
    expect(acceptanceFor('no-dot-at-all')).toBeNull();
    expect(acceptanceFor(null as any)).toBeNull();
    expect(acceptanceFor(undefined as any)).toBeNull();
    expect(acceptanceFor(42 as any)).toBeNull();
  });

  it('is not fooled by an inherited Object.prototype key', () => {
    // `hasOwnProperty` rather than a bare lookup, so these resolve to null instead of to a
    // function.
    expect(acceptanceFor('admissions.constructor')).toBeNull();
    expect(acceptanceFor('admissions.toString')).toBeNull();
    expect(acceptanceFor('admissions.__proto__')).toBeNull();
  });
});

describe('callers cannot corrupt the shared table', () => {
  it('hands back a copy, so mutating the result does not change the source', () => {
    const got = acceptanceFor('admissions.RESEARCH-1-SYSTEM-CLASSES') as string[];
    got.push('an injected criterion');
    expect(acceptanceFor('admissions.RESEARCH-1-SYSTEM-CLASSES')).toHaveLength(3);
  });

  it('freezes the source arrays', () => {
    expect(Object.isFrozen(RESEARCH_ACCEPTANCE)).toBe(true);
    for (const fam of RESEARCH_FAMILIES) {
      expect(Object.isFrozen(RESEARCH_ACCEPTANCE[fam])).toBe(true);
    }
  });
});
