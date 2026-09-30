import {
  CANONICAL_COURSE,
  allWeeks,
  buildWeeklyLessons,
  anthropicUrl,
  ANTHROPIC_ACADEMY_BASE,
} from '../canonicalCourse';

describe('CANONICAL_COURSE structure', () => {
  it('is one course with a program and a cohort', () => {
    expect(CANONICAL_COURSE.program.name).toBe('AI Systems Architect Accelerator');
    expect(CANONICAL_COURSE.cohort.name).toBe('Cohort 1 — July 2026');
    expect(CANONICAL_COURSE.cohort.start_date).toBe('2026-07-13');
  });

  it('has exactly 4 intensives numbered 1..4, each with 3 weeks', () => {
    expect(CANONICAL_COURSE.intensives).toHaveLength(4);
    CANONICAL_COURSE.intensives.forEach((intensive, idx) => {
      expect(intensive.intensive_number).toBe(idx + 1);
      expect(intensive.weeks).toHaveLength(3);
      expect(intensive.build_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(intensive.standalone_value.length).toBeGreaterThan(0);
    });
  });

  it('flattens to 12 weeks numbered 1..12 in order', () => {
    const weeks = allWeeks();
    expect(weeks).toHaveLength(12);
    weeks.forEach((week, idx) => {
      expect(week.week_number).toBe(idx + 1);
      expect(week.intensive.intensive_number).toBe(Math.floor(idx / 3) + 1);
    });
  });

  it('maps each week to a valid skill_area enum value', () => {
    const valid = ['strategy_trust', 'governance', 'requirements', 'build_discipline', 'executive_authority'];
    for (const week of allWeeks()) {
      expect(valid).toContain(week.skill_area);
    }
  });

  it('builds confirmed Anthropic URLs as base + slug', () => {
    const wk1 = allWeeks()[0];
    expect(wk1.anthropic.status).toBe('confirmed');
    expect(wk1.anthropic.slug).toBe('claude-code-101');
    expect(wk1.anthropic.url).toBe(anthropicUrl('claude-code-101'));
    expect(wk1.anthropic.url).toBe(`${ANTHROPIC_ACADEMY_BASE}claude-code-101`);
  });

  it('keeps slug/url consistent with course status', () => {
    for (const week of allWeeks()) {
      const { slug, url, status } = week.anthropic;
      if (status === 'confirmed' || status === 'closest_fit' || status === 'loose_fit') {
        expect(slug).toBeTruthy();
        expect(url).toBe(anthropicUrl(slug as string));
      }
      if (status === 'colaberry_authored') {
        expect(slug).toBeNull();
        expect(url).toBeNull();
      }
      if (status === 'external_gate') {
        expect(slug).toBeNull();
        expect(url).toContain('claudecertifications.com');
      }
    }
  });

  it('schedules Thursday build day 3 days after Monday architecture day', () => {
    for (const week of allWeeks()) {
      expect(week.mon_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(week.thu_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const days = (Date.parse(week.thu_date) - Date.parse(week.mon_date)) / 86_400_000;
      expect(days).toBe(3);
    }
  });

  it('has strictly increasing week dates across the 12 weeks', () => {
    const weeks = allWeeks();
    for (let i = 1; i < weeks.length; i++) {
      expect(Date.parse(weeks[i].mon_date)).toBeGreaterThan(Date.parse(weeks[i - 1].mon_date));
    }
  });
});

describe('buildWeeklyLessons', () => {
  it('returns the 5-task checklist with expected types and numbering', () => {
    const lessons = buildWeeklyLessons(allWeeks()[0]);
    expect(lessons).toHaveLength(5);
    expect(lessons.map((l) => l.lesson_number)).toEqual([1, 2, 3, 4, 5]);
    expect(lessons.map((l) => l.lesson_type)).toEqual(['section', 'lab', 'assessment', 'reflection', 'reflection']);
  });

  it('labels task 1 as an Anthropic Academy section when a course is mapped', () => {
    const lessons = buildWeeklyLessons(allWeeks()[0]); // wk1, confirmed course
    expect(lessons[0].title).toContain('Anthropic Academy');
    expect(lessons[0].title).toContain('Claude Code 101');
  });

  it('labels task 1 as a Colaberry module when no Academy course is mapped', () => {
    const wk10 = allWeeks()[9]; // colaberry_authored
    const lessons = buildWeeklyLessons(wk10);
    expect(lessons[0].title.startsWith('Module:')).toBe(true);
    expect(lessons[0].title).not.toContain('Anthropic Academy');
  });

  it('produces 60 lessons across the whole course', () => {
    const total = allWeeks().reduce((sum, week) => sum + buildWeeklyLessons(week).length, 0);
    expect(total).toBe(60);
  });
});

describe('Colaberry-authored weeks (10-12)', () => {
  const weeks = allWeeks();

  it('attaches a colaberry_module only to weeks 10, 11, 12', () => {
    for (const week of weeks) {
      if (week.week_number >= 10) {
        expect(week.colaberry_module).toBeTruthy();
      } else {
        expect(week.colaberry_module == null).toBe(true);
      }
    }
  });

  it('gives each authored week complete objectives, key points, a lab spec, and an assessment blueprint', () => {
    for (const week of weeks.filter((w) => w.week_number >= 10)) {
      const m = week.colaberry_module!;
      expect(m.summary.length).toBeGreaterThan(0);
      expect(m.learning_objectives.length).toBeGreaterThanOrEqual(3);
      expect(m.key_points.length).toBeGreaterThanOrEqual(3);
      expect(m.frameworks.length).toBeGreaterThan(0);
      expect(m.lab_spec.steps.length).toBeGreaterThanOrEqual(3);
      expect(m.assessment_blueprint.covers.length).toBeGreaterThan(0);
    }
  });

  it('folds the outline into the section, lab, and assessment lessons', () => {
    const wk10 = weeks.find((w) => w.week_number === 10)!;
    const lessons = buildWeeklyLessons(wk10);
    const m = wk10.colaberry_module!;
    // section (1)
    expect(lessons[0].description).toBe(m.summary);
    expect((lessons[0].content_template_json as any).learning_objectives).toEqual(m.learning_objectives);
    expect((lessons[0].content_template_json as any).colaberry_module).toBe(m);
    // lab (2)
    expect((lessons[1].content_template_json as any).lab_spec).toBe(m.lab_spec);
    expect(lessons[1].description).toContain(m.lab_spec.deliverable);
    // assessment (3)
    expect((lessons[2].content_template_json as any).covers).toEqual(m.assessment_blueprint.covers);
    expect((lessons[2].completion_requirements as any).quiz_pass_score).toBe(m.assessment_blueprint.passing_score);
  });

  it('uses the CCA-F 12-question assessment for the capstone week', () => {
    const wk12 = weeks.find((w) => w.week_number === 12)!;
    expect(wk12.colaberry_module!.assessment_blueprint.question_count).toBe(12);
    const lessons = buildWeeklyLessons(wk12);
    expect((lessons[2].content_template_json as any).question_count).toBe(12);
  });

  it('leaves non-authored weeks on the generic 8-question assessment', () => {
    const wk1 = weeks.find((w) => w.week_number === 1)!;
    const lessons = buildWeeklyLessons(wk1);
    expect((lessons[2].content_template_json as any).question_count).toBe(8);
    expect((lessons[0].content_template_json as any).colaberry_module).toBeNull();
  });
});
