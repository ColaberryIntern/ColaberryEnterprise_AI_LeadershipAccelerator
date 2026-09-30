/**
 * backfillProjectNames — the operator override, end to end through the sweep.
 *
 * Ali hand-decided two of the twenty names. The tests below hold the two
 * properties that make it safe to carry a hand decision into a bulk write:
 *
 *   1. **It lands.** The two overridden rows resolve to the names Ali chose.
 *   2. **It is contained.** Every other row is byte-identical to the run with
 *      no overrides at all. An override that quietly moved a third project
 *      would be undetectable in a 22-row table.
 *
 * And the property that makes it reviewable:
 *
 *   3. **It is visible BEFORE the write.** The dry run prints, per override,
 *      what the rule said, what the operator asked for, and what will actually
 *      be written. A human approves the diff, not the intent.
 *
 * The fixture is the real production sweep as reported on PR #1529: twenty
 * builds with a name available and two (Ikenna Nzeribe `c16a410c`, Taiwo
 * Oludimimu `c30f8234`) with neither an intake nor a plan.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), close: jest.fn() } }));

import {
  decideProjectName, decideProjectNames, parseOverrideArgs, formatOverrideReport,
  NameCandidateRow, NameDecision,
} from '../backfillProjectNames';
import { ProjectNameOverride } from '../../services/sbp/projectNaming';

/** Stable synthetic ids: `<8-hex>-0000-0000-0000-000000000000`. */
const id = (prefix: string) => `${prefix}-0000-0000-0000-000000000000`;

const REGINA = id('7ea11a5f');
const MILLION = id('91110ee2');
const IKENNA = id('c16a410c');
const TAIWO = id('c30f8234');

/** intake-sourced row: the student typed the name. */
const fromIntake = (pid: string, student: string, name: string): NameCandidateRow => ({
  project_id: pid, student, intake_name: name, plan_name: `${name} Platform`,
  idea: `${student}'s idea`, task_count: 20,
});
/** plan-sourced row: intake name blank, plan carries the title. */
const fromPlan = (pid: string, student: string, name: string): NameCandidateRow => ({
  project_id: pid, student, intake_name: null, plan_name: name,
  idea: `${student}'s idea`, task_count: 20,
});
/** neither: nothing to name it from. Stays NULL. */
const fromNothing = (pid: string, student: string): NameCandidateRow => ({
  project_id: pid, student, intake_name: null, plan_name: null, idea: null, task_count: 10,
});

/** The 22 rows the production dry run reported, in the order it reported them. */
const SWEEP: NameCandidateRow[] = [
  fromIntake(id('a0000001'), 'Abrahim Nur', 'GoalKick'),
  fromIntake(id('a0000002'), 'Ali Muwwakkil', 'Student Early Warning'),
  fromIntake(id('a0000003'), 'Britiana Akhile', 'Daily Priority Assistant'),
  fromIntake(id('a0000004'), 'Chukwuemeka Eneh', 'NEXUS AI — Healthcare Operations Intelligence Platform'),
  fromPlan(id('a0000005'), 'Emmanuel Sane', 'U.S.-based Full-Service Travel Agency Platform'),
  fromIntake(id('a0000006'), 'Farhat Beig', 'AI Support Workflow Assistant'),
  fromIntake(id('a0000007'), 'Firas', 'HomeHub'),
  fromIntake(id('a0000008'), 'Hellen Muhonja', 'MeshMedic'),
  fromIntake(id('a0000009'), 'Liza Ayele', 'Luxury Client Intelligence Agent'),
  fromIntake(id('a0000010'), 'Marcus Zeno', 'VendorIQ'),
  fromPlan(id('a0000011'), 'Marione Nkerbu', 'AI-Driven KPI Insight Generator'),
  fromIntake(id('a0000012'), 'MARIONE NKERBU TAPSOBA', 'AI Driven KPI'),
  fromPlan(id('a0000013'), 'Martin Mungai', 'Keysy – Home Buying App'),
  // The two hand decisions. Both have an intake name that is not a name.
  { project_id: MILLION, student: 'Million Meshesha', task_count: 26,
    intake_name: 'Automated meeting minutes and action tracking',
    plan_name: 'Meeting Assistant', idea: 'Automate my meeting minutes.' },
  fromPlan(id('a0000015'), 'pamela manyika', 'Small Business KPI Copilot'),
  fromIntake(id('a0000016'), 'Quincy Nkwain Ninying', 'CoreOps'),
  { project_id: REGINA, student: 'Regina Asafor', task_count: 21,
    intake_name: 'my AI email triage project',
    plan_name: 'AI Support Inbox Triage Agent',
    idea: 'An AI agent that triages my support inbox and drafts replies.' },
  fromIntake(id('a0000018'), 'Shabana Zeeshan', 'PowerBI Blueprint'),
  fromIntake(id('a0000019'), 'Shekia Phillips', 'Peace Of Mind'),
  fromPlan(id('a0000020'), 'Tanmayi Katamaraja', 'AI SAT Study Agent'),
  fromNothing(IKENNA, 'Ikenna Nzeribe'),
  fromNothing(TAIWO, 'Taiwo Oludimimu'),
];

/** Exactly the two overrides Ali decided. */
const ALIS_DECISION = new Map<string, ProjectNameOverride>([
  [REGINA, { kind: 'plan' }],
  [MILLION, { kind: 'plan' }],
]);

const byId = (ds: NameDecision[], pid: string) => ds.find((d) => d.project_id === pid) as NameDecision;

describe('the two hand decisions land', () => {
  const decided = decideProjectNames(SWEEP, ALIS_DECISION);

  it('names Regina\'s build from her plan, not from the demo text she pasted', () => {
    const d = byId(decided, REGINA);
    expect(d.name).toBe('AI Support Inbox Triage Agent');
    expect(d.source).toBe('plan');
  });

  it("names Million's build 'Meeting Assistant', not the description of it", () => {
    const d = byId(decided, MILLION);
    expect(d.name).toBe('Meeting Assistant');
    expect(d.source).toBe('plan');
  });

  it('records, on the decision itself, what the rule would have written instead', () => {
    // This is what makes the dry run reviewable: the decision carries its own
    // counterfactual, so nobody has to re-derive it to see what changed.
    expect(byId(decided, REGINA).default_name).toBe('my AI email triage project');
    expect(byId(decided, REGINA).default_source).toBe('intake');
    expect(byId(decided, MILLION).default_name).toBe('Automated meeting minutes and action tracking');
    expect(byId(decided, MILLION).override).toBe('plan');
  });
});

describe('the override is contained', () => {
  const withOverrides = decideProjectNames(SWEEP, ALIS_DECISION);
  const without = decideProjectNames(SWEEP, new Map());

  it('changes exactly two of the twenty-two decisions', () => {
    const changed = withOverrides.filter((d, i) => d.name !== without[i].name);
    expect(changed.map((d) => d.project_id).sort()).toEqual([MILLION, REGINA].sort());
    expect(changed).toHaveLength(2);
  });

  it('leaves the other eighteen named builds byte-identical', () => {
    const untouched = (ds: NameDecision[]) =>
      ds.filter((d) => d.project_id !== REGINA && d.project_id !== MILLION && d.name !== null);
    expect(untouched(withOverrides)).toHaveLength(18);
    expect(untouched(withOverrides)).toEqual(untouched(without));
  });

  it('leaves Ikenna and Taiwo NULL, and never gives them a template name', () => {
    for (const pid of [IKENNA, TAIWO]) {
      expect(byId(withOverrides, pid).name).toBeNull();
      expect(byId(withOverrides, pid).source).toBe('none');
    }
  });

  it('marks only the two overridden rows as overridden', () => {
    expect(withOverrides.filter((d) => d.override !== null).map((d) => d.project_id).sort())
      .toEqual([MILLION, REGINA].sort());
  });

  it('is unchanged from the single-row decision when no override applies', () => {
    // decideProjectNames must not be a second implementation of the rule.
    const row = SWEEP[0];
    expect(decideProjectNames([row], ALIS_DECISION)[0]).toEqual(decideProjectName(row));
  });
});

describe('an override that cannot be honoured is refused, not guessed', () => {
  it('marks an override pointed at a project with no plan as unmet', () => {
    const d = decideProjectNames([SWEEP[0]], new Map([[SWEEP[0].project_id, { kind: 'intake' } as ProjectNameOverride]]));
    expect(d[0].source).toBe('intake');

    const noPlan: NameCandidateRow = { ...SWEEP[0], plan_name: null };
    const u = decideProjectNames([noPlan], new Map([[noPlan.project_id, { kind: 'plan' } as ProjectNameOverride]]));
    expect(u[0].name).toBeNull();
    expect(u[0].source).toBe('unmet');
  });

  it('marks an override aimed at Ikenna as unmet rather than inventing a name', () => {
    const d = decideProjectNames([SWEEP[20]], new Map([[IKENNA, { kind: 'plan' } as ProjectNameOverride]]));
    expect(d[0].source).toBe('unmet');
    expect(d[0].name).toBeNull();
  });

  it('honours an explicit skip as a deliberate NULL', () => {
    const d = decideProjectNames([SWEEP[0]], new Map([[SWEEP[0].project_id, { kind: 'skip' } as ProjectNameOverride]]));
    expect(d[0].name).toBeNull();
    expect(d[0].source).toBe('operator-skip');
  });
});

describe('parseOverrideArgs', () => {
  const argv = (...a: string[]) => ['node', 'script', ...a];

  it('reads repeated --override id=directive pairs', () => {
    const { overrides, errors } = parseOverrideArgs(argv(
      '--override', `${REGINA}=plan`, '--override', `${MILLION}=plan`,
    ));
    expect(errors).toEqual([]);
    expect(overrides.get(REGINA)).toEqual({ kind: 'plan' });
    expect(overrides.get(MILLION)).toEqual({ kind: 'plan' });
    expect(overrides.size).toBe(2);
  });

  it('reads a hand-typed name containing an equals sign', () => {
    // Split on the FIRST '=' only, or a name like "A=B Tracker" is corrupted.
    const { overrides } = parseOverrideArgs(argv('--override', `${REGINA}=name:A=B Tracker`));
    expect(overrides.get(REGINA)).toEqual({ kind: 'literal', name: 'A=B Tracker' });
  });

  it('returns no overrides and no errors when the flag is absent', () => {
    const { overrides, errors } = parseOverrideArgs(argv('--apply'));
    expect(overrides.size).toBe(0);
    expect(errors).toEqual([]);
  });

  it('reports a malformed pair instead of ignoring it', () => {
    // A silently dropped override is the worst outcome available here: the
    // operator believes a hand decision is in effect and the default writes.
    const { overrides, errors } = parseOverrideArgs(argv('--override', 'not-a-pair'));
    expect(overrides.size).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not-a-pair');
  });

  it('reports an unknown directive instead of treating it as a name', () => {
    const { errors } = parseOverrideArgs(argv('--override', `${REGINA}=plann`));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('plann');
  });

  it('reports a missing value after the flag', () => {
    expect(parseOverrideArgs(argv('--override')).errors).toHaveLength(1);
    expect(parseOverrideArgs(argv('--override', '--apply')).errors).toHaveLength(1);
  });

  it('reports the same project id being overridden twice', () => {
    // Last-one-wins on a duplicate is how two operators disagree in silence.
    const { errors } = parseOverrideArgs(argv(
      '--override', `${REGINA}=plan`, '--override', `${REGINA}=skip`,
    ));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(REGINA);
  });
});

describe('the override is visible in the dry run BEFORE anything is written', () => {
  const decided = decideProjectNames(SWEEP, ALIS_DECISION);
  const report = formatOverrideReport(decided, ALIS_DECISION).join('\n');

  it('shows what the rule said and what will be written instead, per override', () => {
    expect(report).toContain('Regina Asafor');
    expect(report).toContain('my AI email triage project');       // what the rule said
    expect(report).toContain('AI Support Inbox Triage Agent');    // what will be written
    expect(report).toContain('Million Meshesha');
    expect(report).toContain('Automated meeting minutes and action tracking');
    expect(report).toContain('Meeting Assistant');
  });

  it('prints the project id, so the next override can be copied out of it', () => {
    expect(report).toContain(REGINA);
    expect(report).toContain(MILLION);
  });

  it('names no project that was not overridden', () => {
    expect(report).not.toContain('GoalKick');
    expect(report).not.toContain('Ikenna Nzeribe');
  });

  it('flags an override that matched no row in the sweep', () => {
    // A typo'd uuid is a no-op override. Without this the operator sees a clean
    // dry run and the default name gets written to the row they meant to fix.
    const stray = new Map<string, ProjectNameOverride>([[id('deadbeef'), { kind: 'plan' }]]);
    const lines = formatOverrideReport(decideProjectNames(SWEEP, stray), stray).join('\n');
    expect(lines).toMatch(/MATCHED NO PROJECT/i);
    expect(lines).toContain(id('deadbeef'));
  });

  it('flags an override that could not be honoured', () => {
    const unmet = new Map<string, ProjectNameOverride>([[IKENNA, { kind: 'plan' }]]);
    const lines = formatOverrideReport(decideProjectNames(SWEEP, unmet), unmet).join('\n');
    expect(lines).toMatch(/UNMET/i);
    expect(lines).toContain('Ikenna Nzeribe');
  });

  it('says plainly when there are none', () => {
    expect(formatOverrideReport(decideProjectNames(SWEEP, new Map()), new Map()).join('\n'))
      .toMatch(/no operator overrides/i);
  });
});

describe('--apply refuses to run on an override that did not take', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'backfillProjectNames.ts'), 'utf8');

  it('blocks the write when any override is unmatched or unmet', () => {
    // Half-applied is the one outcome worse than not applying: the reviewed
    // rows keep their wrong names and the rest are written, so the run cannot
    // simply be repeated once the override is fixed.
    expect(src).toContain('overrideProblems');
    expect(src).toMatch(/if \(APPLY && overrideProblems\.length > 0\)/);
    expect(src).toContain('process.exit(1)');
  });

  it('still writes only through the guarded setProjectNameIfEmpty', () => {
    expect(src).toContain('await setProjectNameIfEmpty(d.project_id, d.name)');
    expect(src).not.toMatch(/UPDATE\s+projects/i);
    expect(src).not.toMatch(/INSERT\s+INTO/i);
    expect(src).not.toMatch(/DELETE\s+FROM/i);
  });
});
