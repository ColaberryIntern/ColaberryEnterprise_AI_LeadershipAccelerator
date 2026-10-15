/**
 * A design selection that `selectDesign` ACCEPTS, with `issues: []` and a non-null `selected`.
 *
 * WHY THIS FILE EXISTS. `composeBlueprint` exposes `selectedDesign`, and three independent
 * mutations could force it to `null` with all 1028 tests green: the expression in
 * `surfaceChecks`, the assignment in `composeBlueprint`, and the field in the route response.
 * The reason none of them was caught is that every fixture passed a design `selectDesign`
 * REFUSES — and `designSelection.ts` returns `selected: null` whenever `issues.length > 0`, so
 * `selectedDesign` was null in the unmutated code too. An assertion written against that cannot
 * distinguish a working wiring from a hardcoded null.
 *
 * So the fixture has to be one the selector accepts, and the assertion has to be the concrete
 * `selectedDesignRef`. Anything weaker is a test that holds for every implementation.
 *
 * THE HELPERS LIVE HERE AND `designSelection.test.ts` IMPORTS THEM. An earlier version of this
 * header claimed they were "built from the same helpers … because a second definition would
 * drift" — while hand-copying them, and the copy had ALREADY dropped two required
 * `WorkspaceRef` fields in the commit making that claim. A mechanism asserted without being
 * measured is standing rule 14, and the measurement was a scoped `tsc` away.
 *
 * One definition now. `designSelection.test.ts` proves this shape selects, at its "the happy
 * path records the variant AND the visual contract revision" test.
 */
import { JOURNEY_KINDS, type JourneyDeclaration, type SelectionInput } from '../../designSelection';
import { generateDesignAlternatives } from '../../designAlternatives';
import type { TaskSurfaceBinding, WorkspaceRef } from '../../workspaceBindingTypes';
import {
  WORKSPACE_STATES, AA_LABEL_PAIRS, type WorkspaceStateDeclaration,
} from '../../workspaceStateChecks';
import { manualOnlyProject } from './manualOnly';

const ROLE = 'role-counsel';

/**
 * A workspace ref for one task.
 *
 * `roleId` is a parameter because the role must exist in the PROJECT being checked.
 * `validateTaskSurfaces` takes no `roleIds` argument — it derives them from `project.roles` —
 * so a ref naming a role the project does not declare produces `SURFACE_ROLE_UNKNOWN` once per
 * mention, twice per ref. This file's default suits `manualOnlyProject()`, which is what it was
 * written for; the reference fixtures A, B and C declare `r-1` instead.
 *
 * The composition input's own `roleIds` field does NOT affect this check. It reaches
 * `validateControlSpec` only. A first attempt at a corpus baseline passed `roleIds` expecting
 * the role refusals to clear, and they did not.
 */
export const ref = (taskId: string, roleId: string = ROLE): WorkspaceRef => ({
  workspaceId: `ws-${taskId}`,
  workspaceTitle: `Surface for ${taskId}`,
  action: 'record the decision',
  primaryJob: 'move one contract to its next state',
  intendedRoles: [roleId],
  records: ['contract'],
  decisions: [],
  whyNotExisting: 'no existing workspace shows the contract next to the threshold rule',
  requirementIds: [],
  taskIds: [taskId],
  audience: 'internal',
  permissionViews: [{ roleId, visibleActions: [] }],
  // BOTH REQUIRED on `WorkspaceRef`, and the hand-copied version of this helper dropped
  // them. The omission was a real TS2739 that NOTHING could see: `tsconfig.json` excludes
  // `**/__tests__/**` and ts-jest strips types, so a green suite proved nothing about it.
  // `workspaceBindingChecks` refuses both a blank `deepLink` and a falsy
  // `preservesNavigationState`, so the drifted shape was one that module would reject.
  deepLink: `/contracts/:id/${taskId}`,
  preservesNavigationState: true,
});

export const ws = (taskId: string, roleId: string = ROLE): TaskSurfaceBinding =>
  ({ taskId, kind: 'workspace', ref: ref(taskId, roleId) });


/**
 * A workspace-state declaration `validateWorkspaceStates` ACCEPTS, for a task bound by `ws()`.
 *
 * Here rather than in a test file for the reason this file's header already gives: the one
 * hand-copied helper in this programme had already drifted from its original by the time the
 * commit claiming otherwise was written. `workspaceStateChecks.test.ts` keeps its own local
 * `decl()` because it needs to perturb every field; this is the passing shape only.
 *
 * It declares EVERY member of `WORKSPACE_STATES`, because a partial declaration is what
 * `STATE_INCOMPLETE` exists to refuse, and uses the first measured AA-contrast token pair
 * rather than inventing colours.
 */
export const wsState = (taskId: string): WorkspaceStateDeclaration => ({
  workspaceId: `ws-${taskId}`,
  states: WORKSPACE_STATES.map((state) => ({
    state,
    label: `Surface for ${taskId} — ${state}`,
    tokens: AA_LABEL_PAIRS[0],
  })),
  // Exactly the action `ref()` declares. A superset trips ACTION_NOT_DECLARED and a subset
  // trips ACTION_NOT_KEYBOARD_REACHABLE, so this mirrors the ref rather than guessing.
  keyboardReachableActions: ['record the decision'],
});

export const declared = (kind: (typeof JOURNEY_KINDS)[number], taskId = 't-review'): JourneyDeclaration =>
  ({ kind, status: 'declared', steps: [{ taskId, workspaceId: `ws-${taskId}`, action: 'record the decision' }] });

/** The id the two-structure set yields for the chosen alternative. */
export const ACCEPTED_ALTERNATIVE_ID = 'alt-queue_detail';

/** `selectedDesignRef` is `<alternativeId>@vc<revision>` — both halves, because an approval binds to both. */
export const ACCEPTED_DESIGN_REF = `${ACCEPTED_ALTERNATIVE_ID}@vc1`;

/** A selection `selectDesign` accepts: two structures, every journey declared, revision pinned. */
export function acceptedDesign(): SelectionInput {
  return {
    set: generateDesignAlternatives(manualOnlyProject(), [ws('t-intake'), ws('t-review')]),
    chosenAlternativeId: ACCEPTED_ALTERNATIVE_ID,
    visualContractRevision: 1,
    journeys: JOURNEY_KINDS.map((k) => declared(k)),
  };
}
