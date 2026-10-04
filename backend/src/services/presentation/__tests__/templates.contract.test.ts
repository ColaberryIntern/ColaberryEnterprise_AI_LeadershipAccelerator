import {
  PRESENTATION_TEMPLATES,
  PRESENTATION_TEMPLATE_IDS,
  DEFAULT_REQUIRED_TEMPLATE_ID,
  templateById,
  validateTemplate,
  validateTemplates,
  type PresentationTemplate,
} from '..';

/**
 * The lesson contract, enforced.
 *
 * The build spec requires "actual authored content, not placeholder text or 'AI will
 * generate this later'". That is unenforceable as a review note across seven templates
 * and every future edit, so it is enforced here instead: `validateTemplates` reads the
 * real strings and this suite fails the build on an empty field, a stub, an outline
 * that overruns its own speaking budget, or a rubric whose weights do not total 100.
 *
 * The suite deliberately includes MUTATION tests — it builds deliberately broken
 * templates and asserts the validator rejects them. A validator nobody has watched
 * fail is just a function that returns an empty array.
 */

const first = PRESENTATION_TEMPLATES[0];
const clone = (over: Partial<PresentationTemplate> = {}): PresentationTemplate =>
  JSON.parse(JSON.stringify({ ...first, ...over }));

describe('presentation templates — the shipped set', () => {
  it('ships exactly seven templates, with the four prominent ones first', () => {
    expect(PRESENTATION_TEMPLATES).toHaveLength(7);
    expect(PRESENTATION_TEMPLATES.filter((t) => t.prominent)).toHaveLength(4);
    expect(PRESENTATION_TEMPLATES.slice(0, 4).every((t) => t.prominent)).toBe(true);
    expect(PRESENTATION_TEMPLATES.slice(4).every((t) => !t.prominent)).toBe(true);
  });

  it('covers the seven template ids the programme specifies', () => {
    expect([...PRESENTATION_TEMPLATE_IDS].sort()).toEqual([
      'ai_visual_presentation',
      'architecture_review',
      'client_handoff',
      'final_showcase',
      'project_introduction',
      'stakeholder_update',
      'working_system_demo',
    ]);
  });

  // THE LOAD-BEARING TEST. Every shipped template satisfies the full lesson contract.
  it('every shipped template satisfies the lesson contract with zero violations', () => {
    const violations = validateTemplates(PRESENTATION_TEMPLATES);
    expect(violations).toEqual([]);
  });

  it.each(PRESENTATION_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s: carries both a strong and a weak annotated example',
    (_id, t) => {
      // Both are required: a strong example alone teaches imitation; the weak one plus
      // its annotation is what teaches judgement.
      expect(t.strongExample.text.length).toBeGreaterThan(40);
      expect(t.strongExample.why.length).toBeGreaterThan(40);
      expect(t.weakExample.text.length).toBeGreaterThan(40);
      expect(t.weakExample.why.length).toBeGreaterThan(40);
    },
  );

  it.each(PRESENTATION_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s: the timed outline fits inside the speaking limit, with Q&A held separately',
    (_id, t) => {
      const total = t.timedOutline.reduce((n, b) => n + b.seconds, 0);
      expect(total).toBeLessThanOrEqual(t.defaultSeconds);
      // Q&A is never folded into the speaking budget — spending the question time is
      // the most common way a timed presentation overruns.
      expect(t.qaSeconds).toBeGreaterThanOrEqual(0);
    },
  );

  it.each(PRESENTATION_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s: rubric weights total exactly 100',
    (_id, t) => {
      expect(t.rubric.reduce((n, r) => n + r.weight, 0)).toBe(100);
    },
  );

  it('every example is labelled as an example, so none can read as a real student claim', () => {
    for (const t of PRESENTATION_TEMPLATES) {
      expect(t.strongExample.text).toMatch(/example/i);
      expect(t.weakExample.text).toMatch(/example/i);
    }
  });

  it('templateById resolves every shipped id and nothing else', () => {
    for (const id of PRESENTATION_TEMPLATE_IDS) expect(templateById(id)?.id).toBe(id);
    expect(templateById('no_such_template')).toBeUndefined();
    expect(templateById('')).toBeUndefined();
  });

  it('the default required template is one that actually ships', () => {
    expect(templateById(DEFAULT_REQUIRED_TEMPLATE_ID)).toBeDefined();
  });
});

describe('the lesson-contract validator actually rejects bad content', () => {
  // Positive control: the clone helper must produce something that PASSES, or every
  // mutation below would "fail" for the wrong reason and prove nothing.
  it('positive control: an unmutated clone passes', () => {
    expect(validateTemplate(clone())).toEqual([]);
  });

  it('rejects an empty prose field', () => {
    expect(validateTemplate(clone({ objective: '' }))).toContainEqual(expect.stringContaining('objective is empty'));
  });

  it.each(['TODO: write this', 'TBD', 'placeholder text for later', 'AI will generate this later', 'coming soon'])(
    'rejects placeholder content: %s',
    (text) => {
      const v = validateTemplate(clone({ objective: text }));
      expect(v.join(' ')).toMatch(/objective/);
      expect(v.length).toBeGreaterThan(0);
    },
  );

  it('rejects an outline that overruns its own speaking limit', () => {
    const bad = clone();
    bad.timedOutline = [{ beat: 'x', seconds: bad.defaultSeconds + 60, say: 'A beat that eats the whole budget and more.' }];
    expect(validateTemplate(bad).join(' ')).toMatch(/over the .* speaking limit/);
  });

  it('rejects a rubric whose weights do not total 100', () => {
    const bad = clone();
    bad.rubric = [{ dimension: 'Only one', weight: 60, lookFor: 'Something specific enough to pass the prose check.' }];
    expect(validateTemplate(bad).join(' ')).toMatch(/weights total 60/);
  });

  it('rejects a missing weak example — judgement is taught by the counter-case', () => {
    const bad = clone();
    (bad as any).weakExample = { text: '', why: '' };
    const v = validateTemplate(bad).join(' ');
    expect(v).toMatch(/weakExample.text is empty/);
    expect(v).toMatch(/weakExample.why is empty/);
  });

  it('rejects too few checklist items', () => {
    expect(validateTemplate(clone({ checklist: ['only one'] })).join(' ')).toMatch(/checklist needs at least 4/);
  });

  it('rejects a duplicate template id across a set', () => {
    expect(validateTemplates([first, first]).join(' ')).toMatch(/duplicate template id/);
  });

  it('reports EVERY violation rather than dying on the first', () => {
    const bad = clone({ objective: '', outcome: '', expectedOutput: '' });
    expect(validateTemplate(bad).length).toBeGreaterThanOrEqual(3);
  });
});
