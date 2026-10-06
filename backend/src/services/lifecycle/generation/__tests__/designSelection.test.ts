/**
 * P4-T4b — the selected design, its five journeys, and the one structure that is still an answer.
 *
 * ## Every refusal code is reached, per code
 *
 * Amendment 2: the positive control is per claimed position, never aggregate. `REFUSALS` below is
 * one row per member of `SELECTION_CODES`, and the last test in that block asserts the table
 * covers the list and NAMES whatever it misses. A suite that merely raised "some" codes would let
 * a code ship unreachable, which is the same defect class as a dead branch.
 *
 * ## The consumer is the real gate, not this module's own return value
 *
 * A selection record that nothing reads proves the function works, not that any claim is gated.
 * So the last block asserts through `prerequisiteGaps('design_ready', ...)` — the exported,
 * already-tested gate that blocks on `design_variant_not_selected` — that a refused selection
 * cannot clear the stage and an accepted one can.
 */

import {
  JOURNEY_KINDS,
  SELECTION_CODES,
  selectDesign,
  type JourneyDeclaration,
  type JourneyKind,
  type SelectionCode,
  type SelectionInput,
} from '../designSelection';
import { generateDesignAlternatives, type AlternativeSet } from '../designAlternatives';
import { MIN_VARIANTS } from '../../../delivery/deliveryDesignLoop';
import { prerequisiteGaps, type LifecycleEvidence } from '../../lifecyclePrerequisites';
import { manualOnlyProject } from './fixtures/manualOnly';
import type { TaskSurfaceBinding, WorkspaceRef } from '../workspaceMapping';

const ROLE = 'role-counsel';

const ref = (taskId: string): WorkspaceRef => ({
  workspaceId: `ws-${taskId}`,
  workspaceTitle: `Surface for ${taskId}`,
  action: 'record the decision',
  primaryJob: 'move one contract to its next state',
  intendedRoles: [ROLE],
  records: ['contract'],
  decisions: [],
  whyNotExisting: 'no existing workspace shows the contract next to the threshold rule',
  requirementIds: [],
  taskIds: [taskId],
  audience: 'internal',
  permissionViews: [{ roleId: ROLE, visibleActions: [] }],
  deepLink: `/contracts/:id/${taskId}`,
  preservesNavigationState: true,
});

const ws = (taskId: string): TaskSurfaceBinding => ({ taskId, kind: 'workspace', ref: ref(taskId) });
const headless = (taskId: string): TaskSurfaceBinding => ({ taskId, kind: 'headless', reason: 'scheduled_ingestion' });

/** Two structures: the ordinary case. */
const twoStructureSet = (): AlternativeSet =>
  generateDesignAlternatives(manualOnlyProject(), [ws('t-intake'), ws('t-review')]);

/** One structure: Fixture D once its intake is an ingestion step rather than a screen job. */
const oneStructureSet = (): AlternativeSet =>
  generateDesignAlternatives(manualOnlyProject(), [headless('t-intake'), ws('t-review')]);

const declared = (kind: JourneyKind, taskId = 't-review'): JourneyDeclaration =>
  ({ kind, status: 'declared', steps: [{ taskId, workspaceId: `ws-${taskId}`, action: 'record the decision' }] });

const waived = (kind: JourneyKind, over: Partial<Extract<JourneyDeclaration, { status: 'not_applicable' }>> = {}): JourneyDeclaration =>
  ({
    kind,
    status: 'not_applicable',
    why: 'this process has no software actor, so there is nothing to fail or to take over from',
    acceptedBy: 'counsel-lead@example.test',
    origin: 'owner_recorded',
    ...over,
  });

const allDeclared = (): JourneyDeclaration[] => JOURNEY_KINDS.map((k) => declared(k));

function input(over: Partial<SelectionInput> = {}): SelectionInput {
  return {
    set: twoStructureSet(),
    chosenAlternativeId: 'alt-queue_detail',
    visualContractRevision: 1,
    journeys: allDeclared(),
    ...over,
  };
}

const codes = (issues: ReadonlyArray<{ code: string }>) => issues.map((i) => i.code);

describe('the happy path records the variant AND the visual contract revision', () => {
  it('selects, and the ref carries both, because §4.5 requires the approval to reference both', () => {
    const { selected, issues } = selectDesign(input({ visualContractRevision: 7 }));
    expect(issues).toEqual([]);
    expect(selected).toMatchObject({
      selectedDesignRef: 'alt-queue_detail@vc7',
      pattern: 'queue_detail',
      visualContractRevision: 7,
      soleStructureAcceptance: null,
    });
    expect(selected!.journeysDeclared.slice().sort()).toEqual([...JOURNEY_KINDS].sort());
    expect(selected!.journeysNotApplicable).toEqual([]);
  });

  it('the ref changes when the contract revision changes, so a contract cannot move underneath it', () => {
    const a = selectDesign(input({ visualContractRevision: 1 })).selected!.selectedDesignRef;
    const b = selectDesign(input({ visualContractRevision: 2 })).selected!.selectedDesignRef;
    expect(a).not.toBe(b);
  });

  it('the other alternative is selectable too, so the choice is real', () => {
    expect(selectDesign(input({ chosenAlternativeId: 'alt-case_workspace' })).selected)
      .toMatchObject({ pattern: 'case_workspace', selectedDesignRef: 'alt-case_workspace@vc1' });
  });

  it('there are five required journeys', () => {
    // Amendment 3: the module header says "the five §4.5 names".
    expect(JOURNEY_KINDS).toHaveLength(5);
  });
});

describe('PER-JOURNEY CONTROL: each of the five is individually required', () => {
  it.each(JOURNEY_KINDS.map((k) => [k] as const))('omitting %s refuses, naming that journey', (kind) => {
    const { selected, issues } = selectDesign(input({ journeys: allDeclared().filter((j) => j.kind !== kind) }));
    expect(selected).toBeNull();
    expect(issues).toEqual([expect.objectContaining({ code: 'JOURNEY_UNDECLARED', stepId: kind })]);
  });

  it.each(JOURNEY_KINDS.map((k) => [k] as const))('and %s may instead be waived by a named human', (kind) => {
    // The manual-only reading: a project with no software actor has no AI failure to show and
    // nothing to take over from. Demanding those journeys would punish the honest answer.
    const { selected, issues } = selectDesign(input({
      journeys: allDeclared().filter((j) => j.kind !== kind).concat(waived(kind)),
    }));
    expect(issues).toEqual([]);
    expect(selected!.journeysNotApplicable).toEqual([kind]);
    expect(selected!.journeysDeclared).not.toContain(kind);
  });
});

/**
 * One row per refusal code. The table IS the coverage claim, and the test after it checks the
 * claim against `SELECTION_CODES` rather than trusting this comment.
 */
const REFUSALS: ReadonlyArray<readonly [SelectionCode, () => SelectionInput]> = [
  ['ALTERNATIVES_NO_STRUCTURE', () => input({
    set: generateDesignAlternatives(manualOnlyProject(), [headless('t-intake'), headless('t-review')]),
  })],
  ['SELECTION_SOLE_STRUCTURE_UNACCEPTED', () => input({
    set: oneStructureSet(), chosenAlternativeId: 'alt-case_workspace', soleStructureAcceptance: null,
  })],
  ['SELECTION_ACCEPTANCE_SELF_SUPPLIED', () => input({
    set: oneStructureSet(),
    chosenAlternativeId: 'alt-case_workspace',
    soleStructureAcceptance: { rationale: 'the process admits one shape', acceptedBy: 'generator', origin: 'model_turn' },
  })],
  ['SELECTION_CHOICE_UNKNOWN', () => input({ chosenAlternativeId: 'alt-exception_first' })],
  ['SELECTION_VISUAL_CONTRACT_REVISION_MISSING', () => input({ visualContractRevision: null })],
  ['JOURNEY_UNDECLARED', () => input({ journeys: [] })],
  ['JOURNEY_KIND_UNKNOWN', () => input({
    journeys: allDeclared().concat({ kind: 'human_take_over', status: 'declared', steps: [] } as never),
  })],
  ['JOURNEY_DUPLICATED', () => input({ journeys: allDeclared().concat(declared('approval')) })],
  ['JOURNEY_STEPS_EMPTY', () => input({
    journeys: allDeclared().filter((j) => j.kind !== 'approval').concat({ kind: 'approval', status: 'declared', steps: [] }),
  })],
  ['JOURNEY_STEP_OFF_DESIGN', () => input({
    journeys: allDeclared().filter((j) => j.kind !== 'approval')
      .concat({ kind: 'approval', status: 'declared', steps: [{ taskId: 't-review', workspaceId: 'ws-somewhere-else', action: 'approve' }] }),
  })],
  ['JOURNEY_WAIVER_UNEXPLAINED', () => input({
    journeys: allDeclared().filter((j) => j.kind !== 'human_takeover').concat(waived('human_takeover', { acceptedBy: '   ' })),
  })],
  ['JOURNEY_WAIVER_SELF_SUPPLIED', () => input({
    journeys: allDeclared().filter((j) => j.kind !== 'human_takeover').concat(waived('human_takeover', { origin: 'model_turn' })),
  })],
];

describe('every refusal code is reachable, and a refusal never yields a ref', () => {
  it.each(REFUSALS.map(([c, b]) => [c, b] as const))('%s fires', (code, build) => {
    const { selected, issues } = selectDesign(build());
    expect(codes(issues)).toContain(code);
    expect(selected).toBeNull();
  });

  it('the table covers SELECTION_CODES, and names anything it misses', () => {
    const covered = new Set(REFUSALS.map(([c]) => c));
    expect(SELECTION_CODES.filter((c) => !covered.has(c))).toEqual([]);
  });
});

describe('ONE structure is recorded; ZERO is the refusal', () => {
  it('the sole structure is selectable with a rationale and a named acceptor', () => {
    const acceptance = {
      rationale: 'One human job over one record admits a single honest shape; a second option '
        + 'would be the same screen renamed.',
      acceptedBy: 'counsel-lead@example.test',
      origin: 'owner_recorded' as const,
    };
    const { selected, issues } = selectDesign(input({
      set: oneStructureSet(),
      chosenAlternativeId: 'alt-case_workspace',
      soleStructureAcceptance: acceptance,
      journeys: allDeclared(),
    }));
    expect(issues).toEqual([]);
    expect(selected).toMatchObject({ selectedDesignRef: 'alt-case_workspace@vc1', soleStructureAcceptance: acceptance });
  });

  it('PASSING COUNTERPART: ALTERNATIVES_NO_STRUCTURE does NOT fire for one structure', () => {
    // The distinction the code exists for. A thin option set and an unusable process graph are
    // different findings, and a rule that conflated them would refuse the manual-only case.
    const { issues } = selectDesign(input({
      set: oneStructureSet(),
      chosenAlternativeId: 'alt-case_workspace',
      soleStructureAcceptance: { rationale: 'one honest shape', acceptedBy: 'counsel-lead@example.test', origin: 'owner_recorded' },
    }));
    expect(codes(issues)).not.toContain('ALTERNATIVES_NO_STRUCTURE');
  });

  it('a set at or above MIN_VARIANTS needs no acceptance, and carries none if offered', () => {
    expect(twoStructureSet().alternatives.length).toBeGreaterThanOrEqual(MIN_VARIANTS);
    const { selected } = selectDesign(input({
      soleStructureAcceptance: { rationale: 'not needed', acceptedBy: 'someone', origin: 'owner_recorded' },
    }));
    expect(selected!.soleStructureAcceptance).toBeNull();
  });

  it('zero structures refuses on the set alone, before any journey is considered', () => {
    const { issues } = selectDesign(input({
      set: generateDesignAlternatives(manualOnlyProject(), [headless('t-intake'), headless('t-review')]),
      journeys: allDeclared(),
    }));
    expect(codes(issues)).toEqual(['ALTERNATIVES_NO_STRUCTURE']);
  });
});

describe('malformed selection input is refused rather than thrown through', () => {
  it.each([
    ['set null', { set: null }],
    ['alternatives null', { set: { alternatives: null, excluded: [] } }],
    ['journeys null', { journeys: null }],
    ['journeys a string', { journeys: 'all five' }],
    ['a journey of an unknown kind', { journeys: [{ kind: 'teleport', status: 'declared', steps: [] }] }],
    ['a step that is not an object', {
      journeys: [{ kind: 'approval', status: 'declared', steps: [null] }],
    }],
  ] as const)('%s does not throw', (_n, over) => {
    expect(() => selectDesign(input(over as never))).not.toThrow();
    expect(selectDesign(input(over as never)).selected).toBeNull();
  });

  it('an entirely absent input does not throw', () => {
    expect(() => selectDesign(undefined as never)).not.toThrow();
    expect(codes(selectDesign(undefined as never).issues)).toEqual(['ALTERNATIVES_NO_STRUCTURE']);
  });
});

describe('THE CONSUMER: a refused selection cannot clear design_ready', () => {
  /** Evidence with design_ready satisfied except for the selected design. */
  const evidence = (selectedDesignRef: string | null): LifecycleEvidence => ({
    tenantId: 'tenant-1',
    requirementCount: 2,
    requirementsWithoutProvenance: [],
    uncitedRequirementSourceBlocks: [],
    unresolvedSourceBlocks: [],
    processesWithoutTasks: [],
    graphHasStart: true,
    graphHasEnd: true,
    unreachableTasks: [],
    unboundedReworkLoops: [],
    tasksWithoutExecutionClass: [],
    tasksWithoutAccountableHuman: [],
    agentTasksAccountableForThemselves: [],
    tasksUnmappedToSurface: [],
    screensWithoutRationale: [],
    selectedDesignRef,
    manifestContentHash: 'a'.repeat(64),
    unknownAllocationCount: 0,
    effortCoverageDisclosed: true,
    proposedBy: 'architect@example.test',
    approval: null,
    currentManifestRevision: 1,
    actorStillAuthorized: true,
    mustHaveRequirementsWithoutStory: [],
    storiesWithoutTraceability: [],
  });

  const rules = (ref_: string | null) => prerequisiteGaps('design_ready', evidence(ref_)).map((g) => g.rule);

  it('an accepted selection supplies a ref that clears the stage', () => {
    const { selected } = selectDesign(input());
    expect(selected).not.toBeNull();
    expect(rules(selected!.selectedDesignRef)).toEqual([]);
  });

  it('the one-structure case ALSO clears it, once the acceptance is recorded', () => {
    // Fixture D's whole stated purpose is that the honest answer reaches approval. An earlier
    // draft of this task refused the single-structure case, which would have stranded it here.
    const { selected } = selectDesign(input({
      set: oneStructureSet(),
      chosenAlternativeId: 'alt-case_workspace',
      soleStructureAcceptance: { rationale: 'one honest shape', acceptedBy: 'counsel-lead@example.test', origin: 'owner_recorded' },
    }));
    expect(rules(selected!.selectedDesignRef)).toEqual([]);
  });

  it('a refused selection yields null, and the stage stays blocked', () => {
    const { selected } = selectDesign(input({ set: oneStructureSet(), chosenAlternativeId: 'alt-case_workspace' }));
    expect(selected).toBeNull();
    expect(rules(selected?.selectedDesignRef ?? null)).toEqual(['design_variant_not_selected']);
  });
});

describe('AMENDMENT 4: every operand of a compound guard is isolated', () => {
  // Adopted after P4-T3 failed verification on exactly this: a guard whose two conjuncts
  // were only ever tested FAILING TOGETHER, so neither was individually load-bearing. Each
  // test below fails one operand while every other operand holds.

  it('a waiver with a reason but NO acceptor is refused', () => {
    const { issues } = selectDesign(input({
      journeys: allDeclared().filter((j) => j.kind !== 'human_takeover')
        .concat(waived('human_takeover', { acceptedBy: '   ' })),
    }));
    expect(codes(issues)).toEqual(['JOURNEY_WAIVER_UNEXPLAINED']);
  });

  it('a waiver with an acceptor but NO reason is refused', () => {
    const { issues } = selectDesign(input({
      journeys: allDeclared().filter((j) => j.kind !== 'human_takeover')
        .concat(waived('human_takeover', { why: '' })),
    }));
    expect(codes(issues)).toEqual(['JOURNEY_WAIVER_UNEXPLAINED']);
  });

  it('PASSING COUNTERPART: a waiver with both is accepted', () => {
    expect(selectDesign(input({
      journeys: allDeclared().filter((j) => j.kind !== 'human_takeover').concat(waived('human_takeover')),
    })).issues).toEqual([]);
  });

  const sole = (over: Record<string, unknown>) => selectDesign(input({
    set: oneStructureSet(),
    chosenAlternativeId: 'alt-case_workspace',
    soleStructureAcceptance: {
      rationale: 'one honest shape',
      acceptedBy: 'counsel-lead@example.test',
      origin: 'owner_recorded',
      ...over,
    } as never,
  }));

  it('a sole-structure acceptance with a rationale but NO acceptor is refused', () => {
    expect(codes(sole({ acceptedBy: '  ' }).issues)).toEqual(['SELECTION_SOLE_STRUCTURE_UNACCEPTED']);
  });

  it('a sole-structure acceptance with an acceptor but NO rationale is refused', () => {
    expect(codes(sole({ rationale: '' }).issues)).toEqual(['SELECTION_SOLE_STRUCTURE_UNACCEPTED']);
  });

  it('PASSING COUNTERPART: a sole-structure acceptance with both is accepted', () => {
    expect(sole({}).issues).toEqual([]);
  });

  const step = (s: unknown) => selectDesign(input({
    journeys: allDeclared().filter((j) => j.kind !== 'approval')
      .concat({ kind: 'approval', status: 'declared', steps: [s] } as never),
  }));

  it('a step with a valid task but a NON-STRING workspace is refused', () => {
    expect(codes(step({ taskId: 't-review', workspaceId: 42, action: 'approve' }).issues))
      .toEqual(['JOURNEY_STEP_OFF_DESIGN']);
  });

  it('a step with a NON-STRING task but a valid workspace is refused', () => {
    expect(codes(step({ taskId: null, workspaceId: 'ws-t-review', action: 'approve' }).issues))
      .toEqual(['JOURNEY_STEP_OFF_DESIGN']);
  });

  it('PASSING COUNTERPART: a step with both valid and served is accepted', () => {
    expect(step({ taskId: 't-review', workspaceId: 'ws-t-review', action: 'approve' }).issues)
      .toEqual([]);
  });
});

describe('AMENDMENT 4 CORRECTION: both isStr operands are load-bearing at RUNTIME', () => {
  // These two shipped as "expected survivors" with an argument that was FALSE, and an
  // independent verifier falsified it by building the input below. The argument was that
  // `servedBy` being typed `Map<string, Set<string>>` made a non-string key miss it either
  // way. A type annotation does not constrain runtime keys: the map is populated verbatim
  // from caller-supplied `chosen.surfaces`, so a surface whose id is a NUMBER puts a number
  // key in the map, the lookup hits, and dropping the operand flips the answer from refused
  // to ACCEPTED WITH A REF.
  //
  // The bar I had written for declaring a survivor expected was "a concrete argument that no
  // input can make the operand decide an answer". Reasoning from the declared type is not
  // that argument, and this is the only place in the run where that hatch was used.

  /** An alternative whose surface carries a bent id, mirrored into the journey step. */
  const bent = (over: { taskId?: unknown; workspaceId?: unknown }) => {
    const surface = { taskId: 't-review', workspaceId: 'ws-t-review', workspaceTitle: 'Review',
      action: 'record the decision', records: [], ...over };
    const set = {
      alternatives: [{
        alternativeId: 'alt-bent',
        pattern: 'case_workspace',
        structure: { pattern: 'case_workspace', navigation: [],
          slots: [{ slotId: 'case', depth: 0, taskIds: ['t-review'], workspaceIds: ['ws-t-review'] }] },
        surfaces: [surface],
      }],
      excluded: [],
    };
    const step = { taskId: surface.taskId, workspaceId: surface.workspaceId,
      action: 'record the decision' };
    return selectDesign(input({
      set: set as never,
      chosenAlternativeId: 'alt-bent',
      // One hand-built alternative is below MIN_VARIANTS, so without this the sole-structure
      // rule fires and masks the operand under test. The step ids must be the only variable.
      soleStructureAcceptance: { rationale: 'one hand-built shape for this control',
        acceptedBy: 'counsel-lead@example.test', origin: 'owner_recorded' },
      journeys: JOURNEY_KINDS.map((kind) => ({ kind, status: 'declared', steps: [step] })) as never,
    }));
  };

  it('a surface whose taskId is a NUMBER is refused, isolating the first operand', () => {
    const { selected, issues } = bent({ taskId: 7 });
    expect(selected).toBeNull();
    expect([...new Set(codes(issues))]).toEqual(['JOURNEY_STEP_OFF_DESIGN']);
  });

  it('a surface whose workspaceId is a NUMBER is refused, isolating the second operand', () => {
    const { selected, issues } = bent({ workspaceId: 42 });
    expect(selected).toBeNull();
    expect([...new Set(codes(issues))]).toEqual(['JOURNEY_STEP_OFF_DESIGN']);
  });

  it('PASSING COUNTERPART: the same shape with both ids as strings is accepted', () => {
    // Without this the two tests above would also pass against a function that refused every
    // hand-built alternative, which would prove nothing about either operand.
    const { selected, issues } = bent({});
    expect(issues).toEqual([]);
    expect(selected?.selectedDesignRef).toBe('alt-bent@vc1');
  });
});
