import {
  WEEK_BLUEPRINTS,
  weekBlueprint,
  CANONICAL_PROGRAM_ID,
  WeekBlueprintContent,
} from '../weekBlueprints';

/** Weeks that map to a real Anthropic Skilljar course (must carry the link). */
const SKILLJAR_WEEKS = [1, 2, 3, 5, 6, 7, 8];
/** Weeks with no Skilljar course — elaborated on topic. */
const COLABERRY_WEEKS = [0, 4, 9, 10, 11];
/** External certification gate. */
const EXTERNAL_CERT_WEEKS = [12];

describe('WEEK_BLUEPRINTS structure', () => {
  it('covers weeks 0..12 exactly once, in order', () => {
    expect(WEEK_BLUEPRINTS).toHaveLength(13);
    WEEK_BLUEPRINTS.forEach((w, idx) => expect(w.week).toBe(idx));
    const weeks = WEEK_BLUEPRINTS.map((w) => w.week);
    expect(new Set(weeks).size).toBe(13);
  });

  it('pins the canonical program id', () => {
    expect(CANONICAL_PROGRAM_ID).toBe('92b98a72-8681-4f04-8ba1-16a18334cd0b');
  });

  it('resolves a week by number', () => {
    expect(weekBlueprint(1)?.title).toBe('Claude Code Foundations + Workspace');
    expect(weekBlueprint(99)).toBeUndefined();
  });
});

describe('WEEK_BLUEPRINTS depth (the "detailed enough" contract)', () => {
  // Week 0 is the free preview — lighter by design, so it gets relaxed floors.
  const isPreview = (w: WeekBlueprintContent) => w.week === 0;

  it.each(WEEK_BLUEPRINTS.map((w) => [w.week, w] as const))(
    'week %i is richly specified',
    (_week, w) => {
      expect(w.title.length).toBeGreaterThan(0);
      expect(w.purpose.trim().length).toBeGreaterThanOrEqual(isPreview(w) ? 200 : 300);

      expect(w.learning_objectives.length).toBeGreaterThanOrEqual(isPreview(w) ? 4 : 5);
      expect(w.competencies.length).toBeGreaterThanOrEqual(5);
      expect(w.architect_domains.length).toBeGreaterThanOrEqual(2);
      expect(w.student_outcomes.length).toBeGreaterThanOrEqual(3);
      expect(w.success_criteria.length).toBeGreaterThanOrEqual(3);
      expect(w.bloom.length).toBeGreaterThanOrEqual(2);
      expect(w.risk_areas.length).toBeGreaterThanOrEqual(2);

      expect(w.estimated_hours).toBeGreaterThan(0);
      expect(['intro', 'core', 'stretch']).toContain(w.difficulty);
      expect(w.instructor_notes.trim().length).toBeGreaterThan(0);

      // No empty strings inside the string arrays.
      for (const arr of [w.learning_objectives, w.competencies, w.architect_domains, w.student_outcomes, w.success_criteria]) {
        for (const item of arr) expect(item.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it('has no duplicate learning objectives within a week', () => {
    for (const w of WEEK_BLUEPRINTS) {
      expect(new Set(w.learning_objectives).size).toBe(w.learning_objectives.length);
    }
  });
});

describe('WEEK_BLUEPRINTS ↔ Anthropic Skilljar mapping', () => {
  it('Skilljar weeks carry a skilljar course link', () => {
    for (const week of SKILLJAR_WEEKS) {
      const w = weekBlueprint(week)!;
      expect(w.anthropic.kind).toBe('skilljar');
      expect(w.anthropic.url).toMatch(/^https:\/\/anthropic\.skilljar\.com\//);
      expect(w.anthropic.title && w.anthropic.title.length).toBeTruthy();
    }
  });

  it('Colaberry-original weeks have no course link', () => {
    for (const week of COLABERRY_WEEKS) {
      const w = weekBlueprint(week)!;
      expect(w.anthropic.kind).toBe('colaberry_original');
      expect(w.anthropic.url).toBeNull();
    }
  });

  it('week 12 is the external CCA-F certification gate', () => {
    const w = weekBlueprint(12)!;
    expect(w.anthropic.kind).toBe('external_cert');
    expect(w.anthropic.url).toContain('claudecertifications.com');
  });

  it('every week is accounted for by exactly one mapping bucket', () => {
    const all = [...SKILLJAR_WEEKS, ...COLABERRY_WEEKS, ...EXTERNAL_CERT_WEEKS].sort((a, b) => a - b);
    expect(all).toEqual(WEEK_BLUEPRINTS.map((w) => w.week));
  });
});
