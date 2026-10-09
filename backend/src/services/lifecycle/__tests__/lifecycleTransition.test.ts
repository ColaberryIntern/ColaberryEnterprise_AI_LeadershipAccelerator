/**
 * The transition command must refuse for the RIGHT reason, because the three refusal classes
 * map to three different HTTP statuses and three different fixes.
 *
 * An illegal edge means the client's model of the world is wrong (409). Unmet prerequisites mean
 * the project is not ready, and the caller needs the list (422). A permission failure means the
 * actor is wrong (403). A single boolean would turn all three into "no", which is exactly the
 * unhelpful answer this module exists to avoid.
 */
import { LIFECYCLE_STAGES, ADVANCE, type LifecycleStage } from '../lifecycleStages';
import { type LifecycleEvidence, type EvidenceField } from '../lifecyclePrerequisites';
import {
  evaluateTransition,
  refusalStatus,
  STAGE_PERMISSION,
  type RefusalReason,
} from '../lifecycleTransition';

/**
 * `assessedFields` is DERIVED from the object’s own keys, never hand-listed: a hand-listed set
 * goes stale the moment a field is added to `LifecycleEvidence`, and it fails in the worst
 * direction — the new field reads as NOT ASSESSED, so a test meaning to exercise measured
 * behaviour starts passing for the wrong reason.
 */
function allAssessed<T extends object>(measured: T): Set<EvidenceField> {
  return new Set(Object.keys(measured).filter((k) => k !== 'tenantId')) as Set<EvidenceField>;
}

function clean(): LifecycleEvidence {
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
    selectedDesignRef: 'design-v3',
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
  return { ...measured, assessedFields: allAssessed(measured) };
}

/** An actor holding every permission, so permission is never the incidental cause of a refusal. */
const ALL_PERMS = Object.values(STAGE_PERMISSION);

function ask(from: unknown, to: unknown, over: Partial<Parameters<typeof evaluateTransition>[0]> = {}) {
  return evaluateTransition({
    from, to, actorPermissions: ALL_PERMS, evidence: clean(), ...over,
  } as Parameters<typeof evaluateTransition>[0]);
}

describe('the permission map uses real permissions', () => {
  it('assigns a permission to all thirteen stages', () => {
    expect(Object.keys(STAGE_PERMISSION).sort()).toEqual([...LIFECYCLE_STAGES].sort());
  });

  it('does not grant one blanket permission to everything', () => {
    // If every stage required the same grant, the map would be decorative and a design reviewer
    // would implicitly be able to approve a release.
    expect(new Set(Object.values(STAGE_PERMISSION)).size).toBeGreaterThanOrEqual(8);
  });

  it('requires approve-class authority for the blueprint, and only write to submit for it', () => {
    expect(STAGE_PERMISSION.blueprint_approved).toBe('contract.approve');
    expect(STAGE_PERMISSION.awaiting_blueprint_approval).toBe('project.write');
  });
});

describe('happy path', () => {
  it('allows every forward advance when prerequisites and permissions are met', () => {
    for (const from of LIFECYCLE_STAGES) {
      const to = ADVANCE[from];
      if (!to) continue;
      const d = ask(from, to);
      expect(d.allowed).toBe(true);
      expect(d.refusal).toBeUndefined();
      expect(d.blocking).toHaveLength(0);
      expect(d.message).toContain(to);
    }
  });

  it('clears the condition on an ordinary advance', () => {
    expect(ask('design_ready', 'awaiting_blueprint_approval').nextCondition).toBeNull();
  });
});

describe('refusal classes are distinguished', () => {
  it('an illegal edge is refused as illegal_edge, not as unmet prerequisites', () => {
    const d = ask('discovery', 'building');
    expect(d.allowed).toBe(false);
    expect(d.refusal).toBe<RefusalReason>('illegal_edge');
    expect(d.gaps).toHaveLength(0); // prerequisites were never consulted
    expect(d.message).toMatch(/cannot move to building/);
  });

  it('an unknown stage is refused as unknown_stage without throwing', () => {
    expect(ask('nonsense', 'planning').refusal).toBe<RefusalReason>('unknown_stage');
    expect(ask('planning', 'nonsense').refusal).toBe<RefusalReason>('unknown_stage');
    expect(ask(undefined, null).refusal).toBe<RefusalReason>('unknown_stage');
    // A condition is not a stage, and must not be accepted as one.
    expect(ask('failed', 'planning').refusal).toBe<RefusalReason>('unknown_stage');
  });

  it('a missing permission is refused as forbidden, and names the permission', () => {
    const d = ask('launch_ready', 'operating', { actorPermissions: ['project.read'] });
    expect(d.refusal).toBe<RefusalReason>('forbidden');
    expect(d.message).toContain(STAGE_PERMISSION.operating);
  });

  it('unmet prerequisites are refused as prerequisites_unmet, WITH the gap list', () => {
    const e = clean();
    e.tasksWithoutAccountableHuman = ['T-4', 'T-9'];
    const d = evaluateTransition({
      from: 'process_ready', to: 'allocation_ready', actorPermissions: ALL_PERMS, evidence: e,
    });
    expect(d.refusal).toBe<RefusalReason>('prerequisites_unmet');
    expect(d.blocking).toHaveLength(2);
    expect(d.blocking.map((g) => g.subject)).toEqual(['T-4', 'T-9']);
    expect(d.message).toContain('2 thing(s)');
  });

  it('checks the edge BEFORE prerequisites, so a nonsense jump is not reported as "not ready"', () => {
    const e = clean();
    e.approval = null; // would fail blueprint_approved prerequisites too
    const d = evaluateTransition({ from: 'discovery', to: 'operating', actorPermissions: ALL_PERMS, evidence: e });
    expect(d.refusal).toBe<RefusalReason>('illegal_edge');
  });

  it('checks permission BEFORE prerequisites, so an unauthorized actor is not told what is missing', () => {
    // Leaking the gap list to someone who may not act on it is an information disclosure, small
    // but free to avoid.
    const e = clean();
    e.tasksWithoutAccountableHuman = ['T-4'];
    const d = evaluateTransition({
      from: 'process_ready', to: 'allocation_ready', actorPermissions: ['project.read'], evidence: e,
    });
    expect(d.refusal).toBe<RefusalReason>('forbidden');
    expect(d.gaps).toHaveLength(0);
  });
});

describe('a draft or preview can never authorize work', () => {
  const authorizing: LifecycleStage[] = [
    'blueprint_approved', 'planning', 'plan_ready', 'building', 'release_review', 'launch_ready', 'operating',
  ];

  it.each(authorizing)('refuses a draft entering %s', (stage) => {
    // Reached by its own legal predecessor, so the only thing refusing it is the draft flag.
    const from = LIFECYCLE_STAGES.find((s) => ADVANCE[s] === stage)!;
    const d = ask(from, stage, { isDraftScenario: true });
    expect(d.refusal).toBe<RefusalReason>('draft_cannot_authorize');
  });

  it('still lets a draft move through the pre-approval stages', () => {
    expect(ask('discovery', 'requirements_ready', { isDraftScenario: true }).allowed).toBe(true);
    expect(ask('allocation_ready', 'design_ready', { isDraftScenario: true }).allowed).toBe(true);
    expect(ask('design_ready', 'awaiting_blueprint_approval', { isDraftScenario: true }).allowed).toBe(true);
  });
});

describe('returns that leave the approved band force reapproval', () => {
  it('sets needs_reapproval leaving the post-approval band', () => {
    const d = ask('planning', 'awaiting_blueprint_approval');
    expect(d.allowed).toBe(true);
    expect(d.nextCondition).toBe('needs_reapproval');
    expect(d.message).toMatch(/no longer covers this revision/);
  });

  it('does NOT set it for rework inside the band', () => {
    const d = ask('building', 'plan_ready');
    expect(d.allowed).toBe(true);
    expect(d.nextCondition).toBeNull();
  });

  it('does not set it for a pre-approval return', () => {
    expect(ask('design_ready', 'allocation_ready').nextCondition).toBeNull();
  });
});

describe('refusalStatus maps each class to its own status', () => {
  it('maps all five classes', () => {
    expect(refusalStatus('unknown_stage')).toBe(400);
    expect(refusalStatus('forbidden')).toBe(403);
    expect(refusalStatus('prerequisites_unmet')).toBe(422);
    expect(refusalStatus('illegal_edge')).toBe(409);
    expect(refusalStatus('draft_cannot_authorize')).toBe(409);
  });

  it('gives every refusal a status, so no refusal can become a silent 500', () => {
    const reasons: RefusalReason[] = [
      'illegal_edge', 'unknown_stage', 'prerequisites_unmet', 'forbidden', 'draft_cannot_authorize',
    ];
    for (const r of reasons) {
      const s = refusalStatus(r);
      expect(s).toBeGreaterThanOrEqual(400);
      expect(s).toBeLessThan(500);
    }
  });
});
