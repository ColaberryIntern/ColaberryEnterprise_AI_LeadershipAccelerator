/**
 * P5-T1.4 — composition, and the one place a bug here would be SILENT.
 *
 * The four surface checks return `ValidationIssue`; the pipeline refuses with `Refusal`. A mapper
 * that drops an issue drops a validation ERROR, and the blueprint then composes cleanly while the
 * thing the check existed for goes unrecorded. So the central test here is not "a refusal
 * appears" — it is CONSERVATION: every issue the validators produce lands in exactly one of the
 * two output lists, counted against the validators called directly.
 *
 * ON THE ADVISORY BRANCH, stated rather than faked. All four validators currently emit
 * `severity: 'error'` and nothing else, measured across `workspaceMapping`,
 * `workspaceStateChecks`, `controlSpecification`, `designSelection` and `workspaceBindingChecks`.
 * So a test that fed the PIPELINE a warning and asserted it did not refuse would never execute
 * its own premise — a test whose body cannot run on the value it names. The branch is therefore
 * covered where it can actually be driven: `refusesComposition` is called directly with a
 * `warning`, and the conservation test guarantees that whichever list an issue lands in, it is
 * not discarded. If a validator ever starts emitting warnings, conservation still holds and the
 * advisory list is where they appear.
 */

import { composeBlueprint, refusesComposition, asRefusal, partitionIssues,
  type BlueprintCompositionInput } from '../blueprintComposition';
import { validateControlSpec, type ControlPolicy } from '../controlSpecification';
import * as controlSpec from '../controlSpecification';
import { selectDesign } from '../designSelection';
import { validateTaskSurfaces } from '../workspaceMapping';
import { validateWorkspaceStates, type WorkspaceStateDeclaration } from '../workspaceStateChecks';
import type { Severity, ValidationIssue } from '../../../factory/factoryValidate';
import {
  manualOnlyUnderstanding, manualOnlyProject, manualOnlyAllocation,
  manualOnlyAgents, manualOnlyDeclaration, manualOnlyEffort, manualOnlyAcceptance,
} from './fixtures/manualOnly';

function base(over: Partial<BlueprintCompositionInput> = {}): BlueprintCompositionInput {
  return {
    understanding: manualOnlyUnderstanding(),
    project: manualOnlyProject(),
    allocation: manualOnlyAllocation(),
    agents: manualOnlyAgents(),
    effort: manualOnlyEffort(),
    declaration: { declaration: manualOnlyDeclaration(), origin: 'approved_blueprint' },
    targetAcceptance: manualOnlyAcceptance(),
    bindings: [],
    // NOT EMPTY, and that is the entire reason these two carry anything. With `[]` here,
    // `validateControlSpec` and `validateWorkspaceStates` return no issues, so DELETING either
    // check from the sweep changed nothing — both deletions survived mutation, and the
    // conservation test below compared zero to zero and passed for no reason at all.
    //
    // A model emitting a malformed policy or a malformed state declaration is the real failure
    // mode these checks exist for, and each validator says in its own comments that it refuses a
    // malformed argument rather than reporting compliance. So the fixtures are those.
    workspaceStates: [{ workspaceId: 1 } as unknown as WorkspaceStateDeclaration],
    policies: [{} as ControlPolicy],
    design: null,
    ...over,
  };
}

describe('refusesComposition is total over Severity', () => {
  it('an error blocks and a warning does not', () => {
    expect(refusesComposition('error')).toBe(true);
    expect(refusesComposition('warning')).toBe(false);
  });

  it('a severity outside the union THROWS rather than being treated as advisory', () => {
    // The `default` branch is unreachable through the type system, which is exactly why it needs
    // a test: without one it is a decorative line, and the next person to widen `Severity`
    // upstream would get an issue silently filed as advisory instead of a compile error here.
    // The cast is the only way to reach it, and reaching it is the point.
    const widened = 'critical' as unknown as Severity;
    expect(() => refusesComposition(widened)).toThrow(/unhandled ValidationIssue severity/);
  });
});

describe('asRefusal carries the issue intact', () => {
  const issue: ValidationIssue = {
    code: 'X_BROKE', message: 'something specific', stepId: 'task-7', severity: 'error',
  };

  it('keeps the code and message, and stamps the stage', () => {
    expect(asRefusal('controls', issue)).toEqual({
      stage: 'controls', code: 'X_BROKE', message: 'something specific', subject: 'task-7',
    });
  });

  it('maps stepId to subject, because a code with no referent is not actionable', () => {
    expect(asRefusal('design', issue).subject).toBe('task-7');
  });

  it('OMITS subject entirely when there is no stepId, rather than inventing an empty one', () => {
    const { stepId, ...noStep } = issue;
    expect(stepId).toBe('task-7');            // the fixture really had one to remove
    const out = asRefusal('design', noStep);
    expect('subject' in out).toBe(false);
  });
});

describe('composeBlueprint runs the four checks generation never reached', () => {
  it('refuses at the design stage when nothing has been selected', () => {
    // Not an empty issue list: every approval binds to a design, so LC-10 cannot be satisfied
    // without one. "No design yet" is a refusal, not a silence.
    const out = composeBlueprint(base({ design: null }));
    const design = out.refusals.filter((r) => r.stage === 'design');
    expect(design).toHaveLength(1);
    expect(design[0].code).toBe('DESIGN_NOT_SELECTED');
  });

  it('reports refusals from the surface stages, not only from generation', () => {
    // The generation fixture reaches `complete` with zero refusals, so anything in the output
    // came from the four new checks. That is what makes this test about THIS module.
    const out = composeBlueprint(base());
    const stages = new Set(out.refusals.map((r) => r.stage));
    expect(stages.has('design')).toBe(true);
    // and the draft is withheld, because a refused composition has nothing approvable in it
    expect(out.refusals.length).toBeGreaterThan(0);
  });

  it('the CONTROLS check is in the sweep: a malformed policy refuses', () => {
    // Dies if the controls check is dropped from `surfaceChecks`. Until the fixture carried a
    // policy, that deletion survived with the whole suite green.
    const controls = composeBlueprint(base()).refusals.filter((r) => r.stage === 'controls');
    expect(controls.length).toBeGreaterThan(0);
  });

  it('the WORKSPACE-STATES check is in the sweep: a malformed declaration refuses', () => {
    // Same: this deletion survived until the fixture carried a declaration.
    const states = composeBlueprint(base()).refusals
      .filter((r) => r.stage === 'workspace_states');
    expect(states.map((r) => r.code)).toContain('STATE_DECLARATION_MALFORMED');
  });

  it('a WARNING is carried as an advisory, never discarded', () => {
    // THE SURVIVOR THIS CLOSES. Deleting the advisory push left the whole suite green, because
    // no validator emits a warning today — so nothing driven through the pipeline could reach
    // the branch. Driving the partition DIRECTLY can, which is why it is a separate exported
    // function rather than a loop buried in `composeBlueprint`.
    const warn: ValidationIssue = { code: 'W_SOFT', message: 'm', severity: 'warning' };
    const hard: ValidationIssue = { code: 'E_HARD', message: 'm', severity: 'error' };
    const out = partitionIssues([{ stage: 'controls', issues: [warn, hard] }]);

    expect(out.refusals.map((r) => r.code)).toEqual(['E_HARD']);
    expect(out.advisories.map((r) => r.code)).toEqual(['W_SOFT']);
    // And neither list swallowed the other: two issues in, two out.
    expect(out.refusals.length + out.advisories.length).toBe(2);
  });

  it('CONSERVATION: every issue the validators produce lands in exactly one output list', () => {
    // THE TEST THIS FILE EXISTS FOR. Counted against the validators called directly, so a mapper
    // that filtered, deduplicated or short-circuited would show up as a shortfall here rather
    // than as a blueprint that composed suspiciously cleanly.
    const input = base();
    const direct =
      validateTaskSurfaces(input.project, input.bindings, input.headlessAcceptance ?? null).length
      + validateWorkspaceStates(input.bindings, input.workspaceStates).length
      + validateControlSpec(input.policies, input.roleIds ?? new Set()).length
      + (input.design === null ? 1 : selectDesign(input.design).issues.length);

    const out = composeBlueprint(input);
    const fromSurfaces = [...out.refusals, ...out.advisories]
      .filter((r) => r.stage !== 'handoff' && r.stage !== 'process'
        && r.stage !== 'allocation' && r.stage !== 'agents' && r.stage !== 'effort');

    expect(fromSurfaces).toHaveLength(direct);
    // Non-vacuity: if the validators produced nothing, the equality above would hold at zero and
    // prove nothing at all.
    expect(direct).toBeGreaterThan(0);
  });

  it('does not run the surface checks TWICE into the output', () => {
    // A composition that pushed each issue once per stage loop AND once per retry attempt would
    // double-count. Codes within a stage are distinct here, so duplicates mean re-entry.
    const out = composeBlueprint(base());
    const keys = out.refusals.map((r) => `${r.stage}:${r.code}:${r.subject ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('withholds the draft when anything refused, and names the stages that did', () => {
    const out = composeBlueprint(base({ allocation: [] }));
    expect(out.draft).toBeNull();
    expect(out.refusals.length).toBeGreaterThan(0);
    // The stages are the actionable part: a reviewer needs to know WHERE to look, and an
    // unstaged pile of codes does not say.
    for (const r of out.refusals) {
      expect(typeof r.stage).toBe('string');
      expect(r.stage.length).toBeGreaterThan(0);
    }
  });
});

describe('composeBlueprint OWNS these properties, not partitionIssues', () => {
  // THE THREE SURVIVORS THIS CLOSES, and the lesson in them is sharper than the bugs.
  //
  // A verifier mutated `const advisories = split.advisories` to `[]` and all 1021 tests passed —
  // the SAME mutation the session log records as closed. Exporting `partitionIssues` made the
  // HELPER drivable, and I tested the helper. The composition's own use of its advisory half
  // stayed undriven, so the property stated on this module ("every issue lands in exactly one of
  // the two lists") was unprotected at the `composeBlueprint` boundary.
  //
  // Testing an extraction is not testing the thing that uses it.

  it('carries a WARNING into advisories, through composeBlueprint itself', () => {
    // No validator emits `warning` today, so the branch is only reachable by making one do it.
    // A spy on the real module is how: `composeBlueprint` reads these as module properties, so
    // this drives the production path rather than a re-implementation of it.
    const spy = jest.spyOn(controlSpec, 'validateControlSpec').mockReturnValue([
      { code: 'W_SOFT', message: 'advisory only', severity: 'warning' },
      { code: 'E_HARD', message: 'blocking', severity: 'error' },
    ]);
    try {
      const out = composeBlueprint(base());
      expect(out.advisories.map((r) => r.code)).toContain('W_SOFT');
      expect(out.refusals.map((r) => r.code)).toContain('E_HARD');
      // and the warning did NOT also block, which is the distinction the severity carries
      expect(out.refusals.map((r) => r.code)).not.toContain('W_SOFT');
    } finally {
      spy.mockRestore();
    }
  });

  it('MERGES generation refusals with the surface ones, so a refused draft cannot report composed', () => {
    // The nastier survivor: dropping `...draft.refusals` left 1021 tests green, and the route
    // computes `composed = out.refusals.length === 0` — so a blueprint whose GENERATION was
    // refused would have answered `200 {composed: true}`.
    const out = composeBlueprint(base({ allocation: [] }));
    const stages = out.refusals.map((r) => r.stage);
    expect(stages).toContain('allocation');          // from generation, not from the four checks
    expect(out.refusals.some((r) => r.code === 'ALLOCATION_MISSING')).toBe(true);
    expect(out.draft).toBeNull();
  });

  it('reports the SELECTED design when one is chosen, rather than always null', () => {
    // `selectedDesign` could be hardcoded to null and nothing noticed, because every fixture
    // passed `design: null`. Amendment 4 allows tested or removed; it was neither.
    const design = {
      set: {
        alternatives: [
          // `surfaces` is required: `journeyIssues` iterates it and threw on a fixture without
          // one. An empty list is the honest minimum — no surfaces declared, nothing to journey.
          { alternativeId: 'alt-1', structure: 'a', surfaces: [] },
          { alternativeId: 'alt-2', structure: 'b', surfaces: [] },
        ],
      },
      chosenAlternativeId: 'alt-1',
      visualContractRevision: 1,
      journeys: [],
    } as unknown as NonNullable<BlueprintCompositionInput['design']>;

    const out = composeBlueprint(base({ design }));
    // Either a design comes back, or the selector refused it and SAID so at the design stage.
    // What must not happen is a silent null with no refusal explaining it.
    const designRefusals = out.refusals.filter((r) => r.stage === 'design');
    expect(out.selectedDesign !== null || designRefusals.length > 0).toBe(true);
    // And this input is NOT the "nothing selected" case, so that specific refusal is gone.
    expect(designRefusals.map((r) => r.code)).not.toContain('DESIGN_NOT_SELECTED');
  });
});
