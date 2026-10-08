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
 * Built from the same helpers as `designSelection.test.ts` (which proves this shape selects, at
 * its "the happy path records the variant AND the visual contract revision" test) rather than
 * hand-rolled, because a second definition of "a valid design" would drift from the first and
 * this one would stop being a test of anything.
 */
import { JOURNEY_KINDS, type JourneyDeclaration, type SelectionInput } from '../../designSelection';
import { generateDesignAlternatives } from '../../designAlternatives';
import type { TaskSurfaceBinding, WorkspaceRef } from '../../workspaceBindingTypes';
import { manualOnlyProject } from './manualOnly';

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
});

const ws = (taskId: string): TaskSurfaceBinding => ({ taskId, kind: 'workspace', ref: ref(taskId) });

const declared = (kind: (typeof JOURNEY_KINDS)[number], taskId = 't-review'): JourneyDeclaration =>
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
