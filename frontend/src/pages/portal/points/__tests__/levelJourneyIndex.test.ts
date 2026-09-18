import { journeyIndexFor, JourneyNode } from '../levelJourneyIndex';

// The journey as LevelJourney builds it: four free rungs by name, two build bands.
const JOURNEY: JourneyNode[] = [
  { name: 'AI Aware I', min: 0, kind: 'free' },
  { name: 'AI Aware II', min: 150, kind: 'free' },
  { name: 'AI Enabled I', min: 400, kind: 'free' },
  { name: 'AI Enabled II', min: 900, kind: 'free' },
  { name: 'AI Builder', min: null, kind: 'build' },
  { name: 'AI Architect', min: null, kind: 'build' },
];

describe('journeyIndexFor', () => {
  it('places a free rung by its exact server name', () => {
    expect(journeyIndexFor(JOURNEY, 948, 'AI Enabled II')).toBe(3);
    expect(journeyIndexFor(JOURNEY, 10, 'AI Aware I')).toBe(0);
  });

  // Before 2026-09-16 a promoted learner's rung ("AI Builder III") matched no
  // node and fell back to the points rung, so "You are here" sat on AI Enabled II
  // for someone who was an AI Builder.
  it('places every AI Builder rung on the AI Builder node regardless of points', () => {
    for (const rung of ['AI Builder I', 'AI Builder II', 'AI Builder III', 'AI Builder VI']) {
      expect(journeyIndexFor(JOURNEY, 0, rung)).toBe(4);
      expect(journeyIndexFor(JOURNEY, 5000, rung)).toBe(4);
    }
  });

  it('places AI Architect and Senior AI Architect on the AI Architect node', () => {
    expect(journeyIndexFor(JOURNEY, 0, 'AI Architect')).toBe(5);
    expect(journeyIndexFor(JOURNEY, 0, 'Senior AI Architect')).toBe(5);
  });

  it('falls back to the highest free rung the points reach when no name is given', () => {
    expect(journeyIndexFor(JOURNEY, 0, null)).toBe(0);
    expect(journeyIndexFor(JOURNEY, 149, undefined)).toBe(0);
    expect(journeyIndexFor(JOURNEY, 150, '')).toBe(1);
    expect(journeyIndexFor(JOURNEY, 400, null)).toBe(2);
    expect(journeyIndexFor(JOURNEY, 900, null)).toBe(3);
    expect(journeyIndexFor(JOURNEY, 99999, null)).toBe(3);
  });

  it('never lands on a build node from points alone (the anti-cheat line holds in the UI too)', () => {
    expect(journeyIndexFor(JOURNEY, 1e9, null)).toBe(3);
  });

  it('treats an unknown name as no name', () => {
    expect(journeyIndexFor(JOURNEY, 400, 'Principal')).toBe(2);
  });

  it('is safe on non-finite points', () => {
    expect(journeyIndexFor(JOURNEY, NaN, null)).toBe(0);
  });
});


// The milestone ladder renders one node per build rung, matched by exact name.
const MILESTONE_JOURNEY: JourneyNode[] = [
  ...JOURNEY.slice(0, 4),
  { name: 'AI Builder I', min: null, kind: 'build' },
  { name: 'AI Builder II', min: null, kind: 'build' },
  { name: 'AI Builder III', min: null, kind: 'build' },
  { name: 'AI Builder IV', min: null, kind: 'build' },
  { name: 'AI Architect', min: null, kind: 'build' },
];

describe('journeyIndexFor on the milestone ladder', () => {
  it('lands each rung on its own node', () => {
    expect(journeyIndexFor(MILESTONE_JOURNEY, 948, 'AI Builder I')).toBe(4);
    expect(journeyIndexFor(MILESTONE_JOURNEY, 948, 'AI Builder II')).toBe(5);
    expect(journeyIndexFor(MILESTONE_JOURNEY, 0, 'AI Builder IV')).toBe(7);
    expect(journeyIndexFor(MILESTONE_JOURNEY, 0, 'AI Architect')).toBe(8);
  });
  it('"AI Builder I" never matches the "AI Builder II" node by prefix', () => {
    expect(journeyIndexFor(MILESTONE_JOURNEY, 0, 'AI Builder II')).not.toBe(4);
  });
  it('Senior AI Architect sits on the AI Architect node', () => {
    expect(journeyIndexFor(MILESTONE_JOURNEY, 0, 'Senior AI Architect')).toBe(8);
  });
  it('a legacy rung the milestone journey lacks (AI Builder VI) falls back to points', () => {
    expect(journeyIndexFor(MILESTONE_JOURNEY, 948, 'AI Builder VI')).toBe(3);
  });
});
