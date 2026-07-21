import { bandRungForPoints, bandRungForLevel, bandHudNext, Band } from './bandLadder';

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
  it('shows the build gate once a free learner hits the AI Enabled ceiling', () => {
    expect(bandHudNext(capped({ rungName: 'AI Enabled II' }), 900)).toBe('Build to unlock AI Builder');
    expect(bandHudNext(capped({ rungName: 'AI Enabled II' }), 1200)).toBe('Build to unlock AI Builder');
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
