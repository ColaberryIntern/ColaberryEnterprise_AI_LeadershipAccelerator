/**
 * The everything-measured evidence snapshot, shared by the two suites that split apart when
 * `lifecycleEvidence.assessment.test.ts` crossed CLAUDE.md's 500-line hard ceiling.
 *
 * `assessedFields` is DERIVED from the object’s own keys, never hand-listed. A hand-listed set
 * goes stale the moment a field is added to `LifecycleEvidence`, and it fails in the worst
 * direction: the new field reads as NOT ASSESSED, so every test meaning to exercise MEASURED
 * behaviour starts passing for the wrong reason.
 */
import { type LifecycleEvidence, type EvidenceField } from '../lifecyclePrerequisites';

export function completeEvidence(): LifecycleEvidence {
  const measured = {
    tenantId: 'tenant-1',
    requirementCount: 12,
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
    selectedDesignRef: 'design-v3@vc2',
    manifestContentHash: 'a'.repeat(64),
    unknownAllocationCount: 0,
    effortCoverageDisclosed: true,
    proposedBy: 'architect@example.test',
    approval: {
      approvedBy: 'owner@example.test',
      approvedByRole: 'DELIVERY_OWNER',
      revision: 4,
      contentSha256: 'a'.repeat(64),
      superseded: false,
    },
    currentManifestRevision: 4,
    actorStillAuthorized: true,
    mustHaveRequirementsWithoutStory: [],
    storiesWithoutTraceability: [],
  };
  const assessedFields = new Set(
    Object.keys(measured).filter((k) => k !== 'tenantId'),
  ) as Set<EvidenceField>;
  return { ...measured, assessedFields };
}
