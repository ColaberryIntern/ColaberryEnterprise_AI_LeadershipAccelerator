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

describe('WEEK_BLUEPRINTS ↔ Anthropic course mapping', () => {
  it('Anthropic-course weeks carry a Claude Academy course link', () => {
    for (const week of SKILLJAR_WEEKS) {
      const w = weekBlueprint(week)!;
      // `kind` deliberately stays the string 'skilljar'. It is a CourseKind
      // discriminator that other modules switch on, so renaming it is a change of
      // its own with a migration attached - not part of moving the host. The URL is
      // what a student actually follows, and that had to move: Skilljar retires in
      // early December 2026.
      expect(w.anthropic.kind).toBe('skilljar');
      expect(w.anthropic.url).toMatch(/^https:\/\/academy\.claude\.com\/courses\//);
      expect(w.anthropic.url).not.toContain('skilljar.com');
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

// ─── course lengths, measured rather than estimated ──────────────────────────

/**
 * These numbers drive card minutes (services/composer/blueprintRollup.ts), so a
 * stale one tells a student a nine-hour course takes eight.
 *
 * Measured by a read-only GET of all seven public Claude Academy course pages on
 * 2026-11-25, replacing figures taken from Skilljar on 2026-07-18. Three were
 * wrong: week 2 was a lesson-count estimate (Skilljar published no hours;
 * Academy does), week 3's course was restructured from 75 lessons to 67 and grew
 * to 9 hr, and week 6 was 66 against a published 1.5 hr - where the week 6 CARD
 * already said 90, so the card was right and this file was wrong.
 */
describe('WEEK_BLUEPRINTS course lengths match what Claude Academy publishes', () => {
  it('carries the published duration for every course that has one', () => {
    const published: ReadonlyArray<[number, number]> = [
      [1, 90],   // 12 lessons, 1.5 hr
      [2, 60],   // 6 lessons, 1 hr
      [3, 540],  // 67 lessons, 9 hr
      [5, 60],   // 10 lessons, 1 hr
      [6, 90],   // 11 lessons, 1.5 hr
      [8, 60],   // 9 lessons, 1 hr
    ];
    const wrong = published
      .map(([week, minutes]) => {
        const got = weekBlueprint(week)?.anthropic_course_minutes;
        return got === minutes ? null : `week ${week}: ${got} should be ${minutes}`;
      })
      .filter(Boolean);
    expect(wrong).toEqual([]);
  });

  it('leaves week 7 an explicit estimate, because Academy publishes no duration for it', () => {
    // The one of the seven with nothing to measure against. Pinned so that a
    // future pass does not quietly "correct" an honest estimate into a guess
    // dressed up as a measurement.
    expect(weekBlueprint(7)?.anthropic_course_minutes).toBe(35);
  });

  it('keeps the week 3 and 4 split summing to the whole course', () => {
    // The invariant that breaks silently. The split is one course across two
    // weeks, so if someone updates the total and not the parts, the two cards
    // together promise less time than the course actually takes - and nothing
    // before this test would have said so. 227 + 259 summed to the old 486;
    // 252 + 288 sums to the measured 540.
    const total = weekBlueprint(3)?.anthropic_course_minutes;
    const part1 = weekBlueprint(3)?.anthropic_course_card?.minutes;
    const part2 = weekBlueprint(4)?.anthropic_course_card?.minutes;
    expect(total).toBe(540);
    expect((part1 ?? 0) + (part2 ?? 0)).toBe(total);
  });
});
