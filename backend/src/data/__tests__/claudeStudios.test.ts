/**
 * Claude Studio content contract.
 *
 * These tests are the gate that stops a half-authored week shipping as if it
 * were finished. They run with no database (pure data + pure render), so they
 * are inside the CI suite rather than on the ignore-list.
 */
import { CLAUDE_STUDIOS, studioForWeek, studioByKey, adaptations, CERTIFICATION_START_WEEK } from '../claudeStudios';
import { RUBRIC_DIMENSIONS, STAGE_ORDER } from '../claudeStudios/types';
import { WEEK_BLUEPRINTS } from '../weekBlueprints';
import { validateStudio, validateAllStudios } from '../../seeds/seedClaudeStudioCards';
import { COMPETENCY_TO_SKILL } from '../../constants/competencySkillCrosswalk';

describe('Claude Studio — coverage', () => {
  it('covers every week 0-12 exactly once', () => {
    const weeks = CLAUDE_STUDIOS.map((s) => s.week).sort((a, b) => a - b);
    expect(weeks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('has a unique stable key per studio', () => {
    const keys = CLAUDE_STUDIOS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('names a distinct career asset for every week', () => {
    const assets = CLAUDE_STUDIOS.map((s) => s.career_asset.toLowerCase().trim());
    expect(new Set(assets).size).toBe(assets.length);
    assets.forEach((a) => expect(a.length).toBeGreaterThan(10));
  });

  it('looks up by week and by key', () => {
    expect(studioForWeek(1)?.key).toBe('problem-framing');
    expect(studioByKey('capstone-defense')?.week).toBe(12);
    expect(studioForWeek(99)).toBeUndefined();
  });
});

describe('Claude Studio — passes its own seed validation', () => {
  it('validates the whole set without throwing', () => {
    expect(() => validateAllStudios()).not.toThrow();
  });

  CLAUDE_STUDIOS.forEach((s) => {
    it(`week ${s.week} (${s.key}) has no content-contract problems`, () => {
      expect(validateStudio(s)).toEqual([]);
    });
  });
});

describe('Claude Studio — the four-stage loop', () => {
  CLAUDE_STUDIOS.forEach((s) => {
    it(`week ${s.week} runs explore → organize → create → prove in order`, () => {
      expect(s.stages.map((st) => st.key)).toEqual(STAGE_ORDER);
    });

    it(`week ${s.week} stage minutes roughly account for the estimate`, () => {
      const sum = s.stages.reduce((n, st) => n + st.minutes, 0);
      // The stage budget should be the studio estimate, give or take rounding —
      // a studio claiming 85 minutes whose stages add to 30 is misleading.
      expect(Math.abs(sum - s.estimated_minutes)).toBeLessThanOrEqual(10);
    });
  });
});

describe('Claude Studio — prompts', () => {
  CLAUDE_STUDIOS.forEach((s) => {
    it(`week ${s.week} ships a starter plus at least two follow-ups`, () => {
      expect(s.prompts.filter((p) => p.kind === 'starter').length).toBeGreaterThanOrEqual(1);
      expect(s.prompts.filter((p) => p.kind !== 'starter').length).toBeGreaterThanOrEqual(2);
    });

    it(`week ${s.week} prompts are substantial and explain themselves`, () => {
      s.prompts.forEach((p) => {
        expect(p.text.trim().length).toBeGreaterThanOrEqual(120);
        expect(p.why.trim().length).toBeGreaterThan(20);
        expect(p.label.trim().length).toBeGreaterThan(3);
      });
    });
  });
});

describe('Claude Studio — assessment and trust', () => {
  CLAUDE_STUDIOS.forEach((s) => {
    it(`week ${s.week} rubric covers all five dimensions exactly once`, () => {
      const dims = s.rubric.map((r) => r.dimension).sort();
      expect(dims).toEqual([...RUBRIC_DIMENSIONS].sort());
    });

    it(`week ${s.week} has three trust checkpoints and named prohibited shortcuts`, () => {
      expect(s.trust_checkpoints).toHaveLength(3);
      s.trust_checkpoints.forEach((t) => expect(t.trim().length).toBeGreaterThan(40));
      expect(s.prohibited_shortcuts.length).toBeGreaterThanOrEqual(3);
    });

    it(`week ${s.week} reflection has objective checks and a substantive free response`, () => {
      expect(s.reflection.checks.length).toBeGreaterThanOrEqual(3);
      expect(s.reflection.free_response.trim().length).toBeGreaterThan(60);
    });

    it(`week ${s.week} has instructor notes and expected misconceptions`, () => {
      expect(s.instructor_notes.trim().length).toBeGreaterThan(80);
      expect(s.misconceptions.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('Claude Studio — competencies use the controlled vocabulary', () => {
  // `competencies` is not free text. CAPE's type→skill seed
  // (services/cape/capeTypeSkillMapSeeds.ts) crosswalks every competency id
  // through COMPETENCY_TO_SKILL, and an id outside that map produces a skill map
  // with nothing in it — evidence that looks recorded but credits no skill.
  //
  // This suite exists because the first draft of these studios used descriptive
  // ids ("problem_framing", "executive_communication", "responsible_ai") that
  // read well and mapped to nothing. CI caught the registry half of that; this
  // catches the per-week half, which nothing else was checking.
  const known = Object.keys(COMPETENCY_TO_SKILL);

  CLAUDE_STUDIOS.forEach((s) => {
    it(`week ${s.week} uses only crosswalk-known competency ids`, () => {
      const unknown = s.competencies.filter((c) => !known.includes(c));
      expect(unknown).toEqual([]);
    });
  });

  it('collectively exercises a spread of skills rather than one axis', () => {
    const skills = new Set(CLAUDE_STUDIOS.flatMap((s) => s.competencies.map((c) => COMPETENCY_TO_SKILL[c])));
    expect(skills.size).toBeGreaterThanOrEqual(3);
  });
});

describe('Claude Studio — certification timing (Part 3F)', () => {
  it('is inactive for every week before week 7', () => {
    CLAUDE_STUDIOS.filter((s) => s.week < CERTIFICATION_START_WEEK)
      .forEach((s) => expect(s.certification_active).toBe(false));
  });

  it('is active from week 7 onward', () => {
    CLAUDE_STUDIOS.filter((s) => s.week >= CERTIFICATION_START_WEEK)
      .forEach((s) => expect(s.certification_active).toBe(true));
  });

  it('makes week 7 the FIRST certification-prep studio', () => {
    const first = CLAUDE_STUDIOS.filter((s) => s.certification_active).sort((a, b) => a.week - b.week)[0];
    expect(first.week).toBe(CERTIFICATION_START_WEEK);
    expect(first.key).toBe('certification-prep');
  });

  it('never presents certification prep as an activity before week 7', () => {
    // The words may appear as a forward reference; what must not appear before
    // week 7 is cert prep framed as something the student does now.
    const active = /(exam (guide|blueprint|readiness)|certification (readiness|preparation|prep)|cca-f|study plan)/i;
    CLAUDE_STUDIOS.filter((s) => s.week < CERTIFICATION_START_WEEK).forEach((s) => {
      const surface = [
        s.title, s.intro, s.career_asset, s.scenario,
        ...s.objectives, ...s.deliverables,
        ...s.stages.flatMap((st) => [st.title, st.instruction, ...st.steps]),
      ].join(' ');
      expect(surface).not.toMatch(active);
    });
  });
});

describe('Claude Studio — adaptation to the existing curriculum', () => {
  it('pins every studio to the real week theme from weekBlueprints', () => {
    CLAUDE_STUDIOS.forEach((s) => {
      const bp = WEEK_BLUEPRINTS.find((w) => w.week === s.week);
      expect(bp).toBeDefined();
      // Catches silent drift: renaming a week blueprint fails here rather than
      // leaving a studio quietly describing a week that no longer exists.
      expect(s.week_theme).toBe(bp!.title);
    });
  });

  it('documents every deviation from the source curriculum brief', () => {
    const notes = adaptations();
    // Weeks 1, 2, 3, 4, 5, 6, 7, 9, 10, 11 and 12 were adapted; week 0 maps 1:1.
    expect(notes.length).toBeGreaterThanOrEqual(10);
    notes.forEach((n) => expect(n.adaptation.trim().length).toBeGreaterThan(80));
  });

  it('records the week 9/10 swap in both directions', () => {
    expect(studioForWeek(9)!.adaptation).toMatch(/swapped with week 10/i);
    expect(studioForWeek(10)!.adaptation).toMatch(/swapped with week 9/i);
  });

  it('retains every career asset named in the source brief', () => {
    // Each of the twelve intended assets must survive the re-ordering.
    const assets = CLAUDE_STUDIOS.map((s) => s.career_asset.toLowerCase()).join(' | ');
    [
      'working agreement', 'business problem brief', 'research brief',
      'requirements explorer', 'executive insight brief', 'scenario and recommendation model',
      'charter', 'certification readiness coach', 'communication kit',
      'evaluation lab', 'trust and risk review', 'project story', 'capstone defense room',
    ].forEach((asset) => expect(assets).toContain(asset));
  });
});

describe('Claude Studio — no placeholders anywhere', () => {
  it('contains no TBD, lorem ipsum, or stub text', () => {
    const blob = JSON.stringify(CLAUDE_STUDIOS).toLowerCase();
    // Specific stub markers, not single words — see validateStudio for why the
    // bare word "placeholder" is not on this list.
    ['tbd', 'lorem ipsum', 'add prompt here', 'placeholder text', 'placeholder here',
      'coming soon', 'todo:', 'fixme', 'to be written', 'fill this in']
      .forEach((bad) => expect(blob).not.toContain(bad));
  });

  it('has a Project with instructions and at least two sources per week', () => {
    CLAUDE_STUDIOS.forEach((s) => {
      expect(s.project.name.trim().length).toBeGreaterThan(5);
      expect(s.project.instructions.trim().length).toBeGreaterThan(80);
      expect(s.project.sources.length).toBeGreaterThanOrEqual(2);
    });
  });
});
