import { assessCard, isStudentReachable, sealedWeeks, severityFor, type ImpactCard } from '../videoLinkImpact';

const CANONICAL = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

const card = (over: Partial<ImpactCard> = {}): ImpactCard => ({
  id: 'aebd4db9-9d28-40d7-99cb-ffb04d29733e',
  title: 'Tool use with the Claude 3 model family',
  week: 3,
  bucket: 'learn',
  type: 'video',
  visibility: 'published',
  status: 'active',
  cohort_id: null,
  program_id: CANONICAL,
  video_id: '6wkFb2_cUik',
  ...over,
});

describe('isStudentReachable mirrors globalCurriculumWhere', () => {
  it('accepts a published, active, canonical-program, cohort-less card', () => {
    expect(isStudentReachable(card(), CANONICAL)).toBe(true);
  });

  it('accepts a legacy NULL program_id', () => {
    expect(isStudentReachable(card({ program_id: null }), CANONICAL)).toBe(true);
  });

  it.each([
    ['archived', { visibility: 'archived' }],
    ['draft', { visibility: 'draft' }],
    ['inactive', { status: 'inactive' }],
    ['cohort-scoped', { cohort_id: 'ba5eba11-0000-0000-0000-000000000000' }],
    ['a different program', { program_id: '00000000-0000-0000-0000-000000000001' }],
  ])('rejects %s', (_label, over) => {
    expect(isStudentReachable(card(over as Partial<ImpactCard>), CANONICAL)).toBe(false);
  });
});

describe('assessCard', () => {
  it('a published learn card with a week seals that week s whole chain', () => {
    const impact = assessCard(card(), CANONICAL, true);
    expect(impact.seals_week).toBe(true);
    expect(impact.student_reachable).toBe(true);
    expect(impact.blocks).toContain('Week 3');
    expect(impact.blocks).toContain('evaluation -> survey -> reflection');
  });

  it('an ARCHIVED card seals nothing: archiving is the release valve, not the damage', () => {
    const impact = assessCard(card({ visibility: 'archived' }), CANONICAL, true);
    expect(impact.seals_week).toBe(false);
    expect(impact.blocks).toContain('no student can reach it');
  });

  it('a NULL-week card seals nothing because every gate predicate is scope:week', () => {
    // The real bda97aff case: embedding disabled, 67 students, gates nothing.
    const impact = assessCard(card({ week: null }), CANONICAL, true);
    expect(impact.seals_week).toBe(false);
    expect(impact.blocks).toContain('week is NULL');
  });

  it('a non-learn bucket seals nothing', () => {
    const impact = assessCard(card({ bucket: 'practice' }), CANONICAL, true);
    expect(impact.seals_week).toBe(false);
    expect(impact.blocks).toContain("'practice' bucket");
  });

  it('a non-completable type is excluded from the gate target set', () => {
    const impact = assessCard(card({ type: 'announcement' }), CANONICAL, false);
    expect(impact.seals_week).toBe(false);
    expect(impact.blocks).toContain('not completable');
  });

  it('treats week 0 as a real week, not as absent', () => {
    expect(assessCard(card({ week: 0 }), CANONICAL, true).seals_week).toBe(true);
  });
});

describe('sealedWeeks', () => {
  it('de-duplicates and sorts ascending', () => {
    const impacts = [
      assessCard(card({ id: 'a', week: 10 }), CANONICAL, true),
      assessCard(card({ id: 'b', week: 3 }), CANONICAL, true),
      assessCard(card({ id: 'c', week: 3 }), CANONICAL, true),
      assessCard(card({ id: 'd', week: 5, visibility: 'archived' }), CANONICAL, true),
    ];
    expect(sealedWeeks(impacts)).toEqual([3, 10]);
  });

  it('returns an empty list when nothing seals', () => {
    expect(sealedWeeks([assessCard(card({ visibility: 'archived' }), CANONICAL, true)])).toEqual([]);
  });
});

describe('severityFor scales with blast radius, not with failure mode', () => {
  it('a failure that seals a week for many students is top severity', () => {
    expect(severityFor(true, 169)).toBe(9);
  });

  it('a failure that seals a week for a few students is high', () => {
    expect(severityFor(true, 3)).toBe(7);
  });

  it('a sealing failure with nobody enrolled yet is mid', () => {
    expect(severityFor(true, 0)).toBe(5);
  });

  it('a broken video that gates nothing is low', () => {
    expect(severityFor(false, 67)).toBe(3);
  });
});
