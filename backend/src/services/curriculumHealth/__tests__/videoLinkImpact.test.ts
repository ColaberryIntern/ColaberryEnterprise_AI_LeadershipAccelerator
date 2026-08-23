import {
  assessCard, assessMissingUrlCard, isStudentReachable, sealedWeeks, severityFor,
  type ImpactCard,
} from '../videoLinkImpact';

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
  video_url: 'https://www.youtube.com/watch?v=6wkFb2_cUik',
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

/**
 * The card that prompted this: Week 3 "Building with the Claude API", published,
 * active, canonical program, learn bucket, and carrying no video URL since it was
 * authored on 2026-07-14. Every condition `assessCard` looks at for sealing is
 * true of it, and it has sealed nothing — 15 students completed it, and Week 3's
 * evaluation, survey and reflection each have 6 completions.
 */
describe('assessMissingUrlCard: a card with no URL blocks nobody', () => {
  const urlless = (over: Partial<ImpactCard> = {}) =>
    card({ video_url: null, video_id: null, ...over });

  it('never seals a week, even when every condition assessCard seals on is true', () => {
    const viaMissingUrl = assessMissingUrlCard(urlless(), CANONICAL);
    // The contrast IS the assertion: same card, same reachability, opposite verdict.
    const viaDeadVideo = assessCard(urlless(), CANONICAL, true);

    expect(viaDeadVideo.seals_week).toBe(true);
    expect(viaMissingUrl.seals_week).toBe(false);
    expect(viaMissingUrl.student_reachable).toBe(true);
  });

  it('contributes no sealed weeks, so no week is reported locked', () => {
    expect(sealedWeeks([assessMissingUrlCard(urlless({ week: 3 }), CANONICAL)])).toEqual([]);
  });

  it('explains that the absent content is the gap, not a lock', () => {
    expect(assessMissingUrlCard(urlless(), CANONICAL).blocks).toMatch(/arms no watch gate/);
  });

  it('reports an out-of-program card as unreachable, so it is not alerted on', () => {
    const other = assessMissingUrlCard(
      urlless({ program_id: '7557ec5e-a7c1-4699-955d-c5b8021bdc03' }),
      CANONICAL,
    );
    expect(other.student_reachable).toBe(false);
    expect(other.seals_week).toBe(false);
  });

  it('reports an archived card as unreachable', () => {
    expect(
      assessMissingUrlCard(urlless({ visibility: 'archived', status: 'inactive' }), CANONICAL)
        .student_reachable,
    ).toBe(false);
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
