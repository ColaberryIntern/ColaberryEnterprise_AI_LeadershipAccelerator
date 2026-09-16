import { bandRungForPoints, bandRungForLevel, bandHudNext, buildRungForSlug, showJoinToBuildCard, CEILING_NEXT_ENTITLED, CEILING_NEXT_FREE, Band } from './bandLadder';

// Pure-function coverage for the frontend 5-band mirror. Runs under CRA's jest in
// CI (react-scripts test). Deterministic — no network, no wall clock.

// A minimal capped (free) band; individual fields overridden per case.
const capped = (over: Partial<Band> = {}): Band => ({
  bandSlug: 'enabled',
  bandName: 'AI Enabled',
  rungName: 'AI Enabled I',
  bandIndex: 1,
  isBuildBand: false,
  cappedByPointsOnly: true,
  nextBand: 'AI Builder',
  nextRequirement: '',
  ...over,
});

describe('bandRungForPoints', () => {
  it('maps each threshold band to its rung', () => {
    expect(bandRungForPoints(0)).toBe('AI Aware I');
    expect(bandRungForPoints(149)).toBe('AI Aware I');
    expect(bandRungForPoints(150)).toBe('AI Aware II');
    expect(bandRungForPoints(399)).toBe('AI Aware II');
    expect(bandRungForPoints(400)).toBe('AI Enabled I');
    expect(bandRungForPoints(899)).toBe('AI Enabled I');
    expect(bandRungForPoints(900)).toBe('AI Enabled II');
    expect(bandRungForPoints(50000)).toBe('AI Enabled II');
  });
  it('is safe on non-finite input (treats as 0)', () => {
    expect(bandRungForPoints(Number.NaN)).toBe('AI Aware I');
  });
});

describe('bandRungForLevel', () => {
  it('maps numeric levels 1..4 to the free rungs', () => {
    expect(bandRungForLevel(1)).toBe('AI Aware I');
    expect(bandRungForLevel(2)).toBe('AI Aware II');
    expect(bandRungForLevel(3)).toBe('AI Enabled I');
    expect(bandRungForLevel(4)).toBe('AI Enabled II');
  });
  it('clamps out-of-range levels to the ends', () => {
    expect(bandRungForLevel(0)).toBe('AI Aware I');
    expect(bandRungForLevel(9)).toBe('AI Enabled II');
  });
});

describe('bandHudNext', () => {
  it('nudges a climbing free learner toward the next rung with a pts delta', () => {
    expect(bandHudNext(capped(), 400)).toBe('500 pts to AI Enabled II');
    expect(bandHudNext(capped({ rungName: 'AI Aware I' }), 0)).toBe('150 pts to AI Aware II');
  });
  // MEASURED 2026-09-16, ali@colaberry.com (Cohort July 2026, 948 pts, rank 0):
  // the HUD read "Build to unlock AI Builder" and the Points page invited him to
  // "Join" a program he is enrolled in. Entitlement was never an input here.
  it('at the AI Enabled ceiling, tells someone already in the program to ship, not to join', () => {
    expect(bandHudNext(capped({ rungName: 'AI Enabled II' }), 900, true)).toBe(CEILING_NEXT_ENTITLED);
    expect(bandHudNext(capped({ rungName: 'AI Enabled II' }), 1200, true)).toBe(CEILING_NEXT_ENTITLED);
    expect(CEILING_NEXT_ENTITLED).not.toMatch(/join/i);
  });
  it('at the AI Enabled ceiling, invites a confirmed free Explorer to join', () => {
    expect(bandHudNext(capped({ rungName: 'AI Enabled II' }), 900, false)).toBe(CEILING_NEXT_FREE);
    expect(CEILING_NEXT_FREE).toMatch(/join/i);
  });
  it('treats a missing entitlement as entitled (fail open: never tell a paying student to join)', () => {
    expect(bandHudNext(capped({ rungName: 'AI Enabled II' }), 948)).toBe(CEILING_NEXT_ENTITLED);
  });
  it('below the ceiling the pts nudge is the same whatever the entitlement', () => {
    expect(bandHudNext(capped(), 400, false)).toBe('500 pts to AI Enabled II');
    expect(bandHudNext(capped(), 400, true)).toBe('500 pts to AI Enabled II');
  });
  it('shows the next band for a promoted build-band learner', () => {
    const builder: Band = {
      bandSlug: 'builder', bandName: 'AI Builder', rungName: 'AI Builder III',
      bandIndex: 2, isBuildBand: true, cappedByPointsOnly: false,
      nextBand: 'AI Architect', nextRequirement: '',
    };
    expect(bandHudNext(builder, 0)).toBe('Next: AI Architect');
  });
  it('shows top-of-ladder when a build-band learner has no next band', () => {
    const architect: Band = {
      bandSlug: 'architect', bandName: 'AI Architect', rungName: 'Senior AI Architect',
      bandIndex: 3, isBuildBand: true, cappedByPointsOnly: false,
      nextBand: null, nextRequirement: '',
    };
    expect(bandHudNext(architect, 0)).toBe('Top of the ladder');
  });
});

describe('showJoinToBuildCard', () => {
  const ceiling = capped({ rungName: 'AI Enabled II' });
  it('shows only for a CONFIRMED free account at the ceiling with no promotion', () => {
    expect(showJoinToBuildCard(ceiling, 900, false)).toBe(true);
    expect(showJoinToBuildCard(ceiling, 5000, false)).toBe(true);
  });
  it('never shows for anyone entitled to build', () => {
    expect(showJoinToBuildCard(ceiling, 948, true)).toBe(false);
  });
  it('never shows while entitlement is unknown (undefined is not false)', () => {
    expect(showJoinToBuildCard(ceiling, 948, undefined)).toBe(false);
  });
  it('does not show below the ceiling even for a free account (AI Enabled I is not the wall)', () => {
    expect(showJoinToBuildCard(capped({ rungName: 'AI Enabled I' }), 400, false)).toBe(false);
    expect(showJoinToBuildCard(capped({ rungName: 'AI Enabled I' }), 899, false)).toBe(false);
  });
  it('does not show for a promoted build-band learner or with no band', () => {
    const builder: Band = { bandSlug: 'builder', bandName: 'AI Builder', rungName: 'AI Builder I', bandIndex: 2, isBuildBand: true, cappedByPointsOnly: false, nextBand: 'AI Architect', nextRequirement: '' };
    expect(showJoinToBuildCard(builder, 2000, false)).toBe(false);
    expect(showJoinToBuildCard(null, 2000, false)).toBe(false);
  });
});

describe('buildRungForSlug', () => {
  it('maps every competency rank slug to its public rung', () => {
    expect(buildRungForSlug('junior_builder')).toBe('AI Builder I');
    expect(buildRungForSlug('practitioner')).toBe('AI Builder II');
    expect(buildRungForSlug('architect_candidate')).toBe('AI Architect');
    expect(buildRungForSlug('architect')).toBe('Senior AI Architect');
  });
  it('never returns a raw slug: unknown slugs are humanised, empty is empty', () => {
    expect(buildRungForSlug('some_future_rank')).toBe('Some Future Rank');
    expect(buildRungForSlug(null)).toBe('');
    expect(buildRungForSlug('')).toBe('');
  });
});
