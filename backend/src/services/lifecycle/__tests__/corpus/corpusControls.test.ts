import { runCorpusCase, type CorpusFixture } from './corpusRunner';
import {
  fixtureA, fixtureB, fixtureC,
} from '../../generation/__tests__/fixtures/referenceFixtures';
import { ws, wsState, acceptedDesign } from '../../generation/__tests__/fixtures/acceptedDesign';
import type { FactoryProject } from '../../../factory/contracts/factoryContract';

/**
 * P7-T1.2 — the mandatory positive controls from `reference-fixtures.md` §139.
 *
 * ## Why this file exists, in that document's own words
 *
 * "Every fixture ships a deliberately-violating twin that **must fail**. A suite that cannot fail
 * is not a suite." Each of the six checks below must be OBSERVED failing before the check it
 * exercises is trusted.
 *
 * ## THE THING THAT MADE THIS HARD, AND WHY THE BASELINE IS THE POINT
 *
 * Before this file, every corpus case refused at `workspaces` and `design`, because the runner
 * defaults `bindings: []` and `design: null`. `SURFACE_UNMAPPED` therefore fired on EVERY case —
 * so "observed failing" for the workspace-mapping control would have been indistinguishable from
 * the baseline. That is the same vacuity that made P7-T1.1's first coverage rule meaningless: a
 * control that fires everywhere proves nothing about the input that was supposed to trip it.
 *
 * So each control here asserts TWO things, and the second is the one that matters:
 *
 *   1. the violating twin produces the expected code, and
 *   2. **the clean baseline does NOT produce it.**
 *
 * Without (2), replacing any twin with its clean counterpart would leave the suite green.
 *
 * ## What a clean baseline actually required, measured
 *
 * Four things, found by probing rather than by reading:
 *
 * | Missing | Refusals it produced |
 * |---|---|
 * | `bindings` | `SURFACE_UNMAPPED` x2, `SURFACE_NO_HUMAN_PATH` |
 * | `design` | `DESIGN_NOT_SELECTED` |
 * | `workspaceStates` | `STATE_WORKSPACE_UNDECLARED` x2 |
 * | a ref role the PROJECT declares | `SURFACE_ROLE_UNKNOWN` x4 |
 *
 * The last one cost the most. `validateTaskSurfaces` takes NO `roleIds` argument — it derives
 * them from `project.roles` — so the composition input's own `roleIds` field cannot clear those
 * refusals, and an attempt to clear them that way failed. The `ws()` default role suits
 * `manualOnlyProject()`, which is what that fixture was written for; fixtures A, B and C declare
 * `r-1`, so the ref has to say `r-1`.
 */

/** Every binding, state and design a case needs to compose with ZERO refusals. */
const cleanComposition = () => ({
  bindings: [ws('t-draft', 'r-1'), ws('t-review', 'r-1')],
  workspaceStates: [wsState('t-draft'), wsState('t-review')],
  design: acceptedDesign(),
});

type Fixture = typeof fixtureA;

const fieldsOf = (fx: Fixture) => ({
  understanding: fx.understanding(),
  project: fx.project(),
  allocation: fx.allocation(),
  agents: fx.agents(),
  effort: fx.effort(),
  declaration: { declaration: fx.declaration(), origin: 'approved_blueprint' as const },
  targetAcceptance: fx.acceptance(),
});

/** A case that composes cleanly. The denominator for every control below. */
const clean = (id: string, fx: Fixture): CorpusFixture => ({
  id,
  proves: 'the baseline composes with zero refusals, so a twin means something',
  build: () => fieldsOf(fx),
  composition: cleanComposition(),
});

/** The codes a run refused with, as `stage:CODE`, so a control can name what it expects. */
const refusalCodes = (fx: CorpusFixture): string[] =>
  (runCorpusCase(fx).composed?.refusals ?? []).map((r) => r.code);

describe('THE BASELINE: a clean case refuses nothing at all', () => {
  // If this ever fails, every control below becomes unreadable — a twin's code would no longer be
  // distinguishable from background noise. So it is asserted first and per fixture.

  it.each([
    ['A', fixtureA], ['B', fixtureB], ['C', fixtureC],
  ])('fixture %s composes with ZERO refusals', (id, fx) => {
    const run = runCorpusCase(clean(`${id}-clean`, fx as Fixture));
    expect(run.composed?.refusals ?? []).toEqual([]);
    // And it genuinely ran the whole composed half, rather than refusing early and reporting little.
    expect(run.generationStoppedAt).toBeNull();
    expect(run.stagesDriven).toContain('complete');
  });

  it('records the workspace count per fixture, as reference-fixtures.md requires', () => {
    // Two bound surfaces in the clean baseline. Asserted here rather than left implied, because
    // the document asks for the count PER FIXTURE and a field nobody reads is decoration.
    expect(runCorpusCase(clean('A-clean', fixtureA)).workspaceCount).toBe(2);
  });
});

describe('CONTROL 1 — a requirement with no citation fails SOURCE_COVERAGE', () => {
  const twin: CorpusFixture = {
    id: 'A-uncited-requirement-block',
    proves: 'a requirement block cited by no task is refused',
    build: () => {
      const fields = fieldsOf(fixtureA);
      const project = fields.project as FactoryProject;
      project.source_blocks = [
        ...project.source_blocks,
        { id: 'blk-uncited', locator: '9.0', text: 'stated', kind: 'requirement' },
      ];
      return fields;
    },
    composition: cleanComposition(),
  };

  it('the twin is REFUSED, and the clean baseline is not', () => {
    expect(refusalCodes(twin)).toContain('SOURCE_COVERAGE');
    expect(refusalCodes(clean('A-clean', fixtureA))).not.toContain('SOURCE_COVERAGE');
  });

  it('and it stops generation at `process`, so it is enforced and not merely reported', () => {
    expect(runCorpusCase(twin).generationStoppedAt).toBe('process');
  });

  it('the uncited block is NAMED in the traceability report', () => {
    expect(runCorpusCase(twin).traceability.uncovered).toEqual(['blk-uncited']);
  });
});

describe('CONTROL 2 — an agent holding its own accountability fails OVERSIGHT', () => {
  const twin: CorpusFixture = {
    id: 'B-agent-is-its-own-accountable',
    proves: 'an agent executor may never be ACCOUNTABLE for its own work',
    build: () => {
      const fields = fieldsOf(fixtureB);
      const project = fields.project as FactoryProject;
      // `a-2` is the human APPROVER over the agent performer on `t-draft`. Handing it to the
      // agent removes the only human oversight on that task, which is the whole point.
      project.assignments = project.assignments.map((a) => (
        a.id === 'a-2'
          ? { ...a, responsibility: 'ACCOUNTABLE' as const, executor: { type: 'agent' as const, id: 'ag-sum' } }
          : a
      ));
      return fields;
    },
    composition: cleanComposition(),
  };

  it('the twin is REFUSED, and the clean baseline is not', () => {
    expect(refusalCodes(twin)).toContain('OVERSIGHT');
    expect(refusalCodes(clean('B-clean', fixtureB))).not.toContain('OVERSIGHT');
  });
});

describe('CONTROL 3 — an effort number with basis UNKNOWN fails EFFORT_EVIDENCE', () => {
  const twin: CorpusFixture = {
    id: 'B-effort-without-a-basis',
    proves: 'minutes without a basis is a number nobody can defend',
    build: () => {
      const fields = fieldsOf(fixtureB);
      const project = fields.project as FactoryProject;
      project.tasks = project.tasks.map((t) => (
        t.id === 't-draft' ? { ...t, effort_minutes: 5, effort_basis: 'UNKNOWN' as const } : t
      ));
      return fields;
    },
    composition: cleanComposition(),
  };

  it('the twin is REFUSED, and the clean baseline is not', () => {
    expect(refusalCodes(twin)).toContain('EFFORT_EVIDENCE');
    expect(refusalCodes(clean('B-clean', fixtureB))).not.toContain('EFFORT_EVIDENCE');
  });
});

describe('CONTROL 4 — an unmapped business task fails the workspace-mapping check', () => {
  const twin: CorpusFixture = {
    ...clean('A-one-binding-dropped', fixtureA),
    id: 'A-one-binding-dropped',
    proves: 'a business task with no surface and no headless marker is refused',
    // Exactly one binding removed. The rest of the baseline stays clean, so the refusal is
    // attributable to the omission rather than to the sparse input every earlier case had.
    composition: { ...cleanComposition(), bindings: [ws('t-draft', 'r-1')] },
  };

  it('the twin is REFUSED, and the clean baseline is not', () => {
    expect(refusalCodes(twin)).toContain('SURFACE_UNMAPPED');
    expect(refusalCodes(clean('A-clean', fixtureA))).not.toContain('SURFACE_UNMAPPED');
  });
});

describe('CONTROL 5 — a below-target share with no accepted reason fails the disclosure check', () => {
  // Fixture B is the human-heavy case: its AI share is legitimately low. It passes BECAUSE it
  // carries an acceptance with a rationale and a named owner. Strip that and the shortfall becomes
  // undisclosed, which is what `BELOW_TARGET_UNEXPLAINED` exists to catch.
  const twin: CorpusFixture = {
    id: 'B-below-target-undisclosed',
    proves: 'below target is a disclosure requirement, and an undisclosed shortfall is refused',
    build: () => ({ ...fieldsOf(fixtureB), targetAcceptance: null }),
    composition: cleanComposition(),
  };

  it('the twin is REFUSED, and the clean baseline is not', () => {
    expect(refusalCodes(twin)).toContain('BELOW_TARGET_UNEXPLAINED');
    expect(refusalCodes(clean('B-clean', fixtureB))).not.toContain('BELOW_TARGET_UNEXPLAINED');
  });

  it('the refusal carries the share WITH its denominator, never a bare percentage', () => {
    // This phase's standing argument: a percentage without a denominator is the dangerous kind.
    // `renderShare` is the only sanctioned way to turn a share into text, and the message must
    // show its scale.
    const refusal = (runCorpusCase(twin).composed?.refusals ?? [])
      .find((r) => r.code === 'BELOW_TARGET_UNEXPLAINED');
    expect(refusal).toBeDefined();
    expect(refusal?.message).toContain('assessed minutes/month');
    expect(refusal?.message).toContain('tasks');
  });
});

describe('CONTROL 6 — a self-approval fails with SelfApprovalError', () => {
  // DEFERRED WITH ITS REASON, not silently skipped. Unlike the five above, this one cannot be
  // driven from the generation half at all: `SelfApprovalError` is thrown inside
  // `approveBlueprint` (`blueprintApproval.ts:187` and `:192`) after reading `manifest.proposed_by`
  // from the database INSIDE a transaction. There is no pure path to it.
  //
  // It is covered by the approval suite against a real Postgres rather than here. This block
  // exists so the §139 list is accounted for in ONE place, rather than five controls appearing
  // complete while the sixth is absent without comment.
  it('the runner REPORTS the approval stage as unreachable, naming what needs a database', () => {
    // Asserted rather than merely commented, and asserted against something true: the corpus
    // runner already accounts for this stage as NOT REACHED with a reason. So the sixth control
    // is not missing from the suite, it is accounted for with its blocker named — which is the
    // difference between a deferral and an absence.
    const notReached = runCorpusCase(clean('A-clean', fixtureA)).stagesNotReached;
    const approval = notReached.find((s) => s.stage === 'awaiting_blueprint_approval');

    expect(approval).toBeDefined();
    expect(approval?.reason).toContain('approveBlueprint');
    // And the stage really is one of the five the runner defers, not a name that matches nothing.
    expect(notReached.map((s) => s.stage)).toContain('blueprint_approved');
  });
});
