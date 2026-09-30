/**
 * projectNaming — the OPERATOR OVERRIDE, and the reason it has to exist.
 *
 * WHAT WENT WRONG
 *
 * The derivation rule prefers `build_intake.name` unconditionally. That is the
 * right default — it is the student's own word — but it is only right when the
 * student actually chose a name. Two of the twenty live builds show it failing:
 *
 *   - **Regina Asafor.** Intake name "my AI email triage project". Her stored
 *     *idea* is character-for-character the wizard's placeholder text
 *     (ProjectWizard.tsx:108) minus the "e.g. " prefix — she typed the example
 *     back in by hand. Her intake is demo text, not an answer, so the name that
 *     came with it is not a name she chose. Her plan calls the build
 *     "AI Support Inbox Triage Agent".
 *   - **Million Meshesha.** Intake name "Automated meeting minutes and action
 *     tracking" — a description of what the thing does, not what it is called.
 *     His plan calls it "Meeting Assistant".
 *
 * Ali decided both by hand. Shipping `--apply` without a way to carry a hand
 * decision would have written the wrong name to exactly the two rows a human
 * had already looked at, which is worse than the NULL it replaced.
 *
 * WHY AN OVERRIDE RATHER THAN TWO SPECIAL CASES
 *
 * A hardcoded pair of project ids fixes today and guarantees a code change,
 * review and deploy for the next hand decision. The operator supplies the
 * override on the command line instead, so the next one costs an argument.
 *
 * THE PROPERTIES THESE TESTS HOLD
 *
 *   1. An override changes the derived name for the project it names.
 *   2. It changes NOTHING for any project it does not name.
 *   3. Asking for a source a project does not have resolves to `unmet` — never
 *      to a silent fall back onto the source the operator just rejected.
 *   4. `skip` yields NULL, and never a template name.
 */
import {
  deriveProjectName, parseProjectNameOverride, ProjectNameOverride,
} from '../projectNaming';

describe('parseProjectNameOverride', () => {
  it('parses the three source directives', () => {
    expect(parseProjectNameOverride('plan')).toEqual({ kind: 'plan' });
    expect(parseProjectNameOverride('intake')).toEqual({ kind: 'intake' });
    expect(parseProjectNameOverride('skip')).toEqual({ kind: 'skip' });
  });

  it('is case and whitespace insensitive for directives', () => {
    expect(parseProjectNameOverride('  PLAN  ')).toEqual({ kind: 'plan' });
    expect(parseProjectNameOverride('Skip')).toEqual({ kind: 'skip' });
  });

  it('parses an explicit hand-typed name behind the name: prefix', () => {
    expect(parseProjectNameOverride('name:Meeting Assistant'))
      .toEqual({ kind: 'literal', name: 'Meeting Assistant' });
  });

  it('normalizes a literal the same way every other name is normalized', () => {
    expect(parseProjectNameOverride('name:   Meeting   Assistant  '))
      .toEqual({ kind: 'literal', name: 'Meeting Assistant' });
  });

  it('rejects an empty literal rather than storing a blank name', () => {
    expect(parseProjectNameOverride('name:')).toBeNull();
    expect(parseProjectNameOverride('name:   ')).toBeNull();
  });

  it('rejects anything that is not one of the four forms', () => {
    // A typo must be a loud parse error, never a literal name. If `plann` were
    // silently accepted as text, a slip of the finger would put the word
    // "plann" on a student's project card.
    expect(parseProjectNameOverride('plann')).toBeNull();
    expect(parseProjectNameOverride('Meeting Assistant')).toBeNull();
    expect(parseProjectNameOverride('')).toBeNull();
  });
});

describe('deriveProjectName with an override', () => {
  const REGINA = {
    intakeName: 'my AI email triage project',
    planName: 'AI Support Inbox Triage Agent',
  };
  const MILLION = {
    intakeName: 'Automated meeting minutes and action tracking',
    planName: 'Meeting Assistant',
  };

  it('is byte-identical to the plain rule when no override is passed', () => {
    expect(deriveProjectName(REGINA)).toEqual(deriveProjectName(REGINA, undefined));
    expect(deriveProjectName(REGINA)).toEqual({ name: 'my AI email triage project', source: 'intake' });
  });

  it("prefer-plan takes Regina's name off the demo text and onto her plan", () => {
    expect(deriveProjectName(REGINA, { kind: 'plan' }))
      .toEqual({ name: 'AI Support Inbox Triage Agent', source: 'plan' });
  });

  it("prefer-plan turns Million's description into his plan's name", () => {
    expect(deriveProjectName(MILLION, { kind: 'plan' }))
      .toEqual({ name: 'Meeting Assistant', source: 'plan' });
  });

  it('prefer-intake is the default made explicit, and still resolves to intake', () => {
    expect(deriveProjectName(REGINA, { kind: 'intake' }))
      .toEqual({ name: 'my AI email triage project', source: 'intake' });
  });

  it('accepts a hand-typed name neither source carries', () => {
    expect(deriveProjectName(REGINA, { kind: 'literal', name: 'Inbox Triage Agent' }))
      .toEqual({ name: 'Inbox Triage Agent', source: 'operator' });
  });

  it('forces NULL on skip, and never a template', () => {
    expect(deriveProjectName(REGINA, { kind: 'skip' }))
      .toEqual({ name: null, source: 'operator-skip' });
  });

  it('reports unmet rather than falling back to the source it was told to reject', () => {
    // The whole point of `plan` is "do not use the intake name". Silently
    // falling back to intake when the plan is empty would write exactly the
    // value the operator overrode, which is the original defect wearing a hat.
    expect(deriveProjectName({ intakeName: 'my AI email triage project', planName: null }, { kind: 'plan' }))
      .toEqual({ name: null, source: 'unmet' });
    expect(deriveProjectName({ intakeName: null, planName: 'Meeting Assistant' }, { kind: 'intake' }))
      .toEqual({ name: null, source: 'unmet' });
  });

  it('reports unmet for a project that has neither source, e.g. Ikenna and Taiwo', () => {
    // c16a410c and c30f8234 have no intake and no plan. An override pointed at
    // one of them cannot invent anything, and must say so out loud.
    expect(deriveProjectName({}, { kind: 'plan' })).toEqual({ name: null, source: 'unmet' });
    expect(deriveProjectName({}, { kind: 'intake' })).toEqual({ name: null, source: 'unmet' });
  });

  it('normalizes an override-selected name exactly like any other', () => {
    expect(deriveProjectName({ planName: '  Meeting   Assistant \n' }, { kind: 'plan' }))
      .toEqual({ name: 'Meeting Assistant', source: 'plan' });
  });

  it('treats a whitespace-only literal as unmet rather than writing a blank', () => {
    expect(deriveProjectName(REGINA, { kind: 'literal', name: '   ' } as ProjectNameOverride))
      .toEqual({ name: null, source: 'unmet' });
  });
});
