/**
 * P4-T1 tests.
 *
 * Every count- or pattern-based check carries a deliberately-violating case, and every refusal has
 * a PASSING counterpart so that a rule which refused everything would fail too. A check that
 * cannot fail is not a check.
 */

import {
  HEADLESS_REASONS,
  SURFACE_CODES,
  businessTasks,
  consolidationAssessment,
  unboundProposedSurfaces,
  validateTaskSurfaces,
  type TaskSurfaceBinding,
  type WorkspaceRef,
} from '../workspaceMapping';
import { manualOnlyProject } from './fixtures/manualOnly';
import type { FactoryProject } from '../../../factory/contracts/factoryContract';

/** A complete, valid workspace ref for Fixture D's one role. Each test changes one thing. */
function ref(over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    workspaceId: 'ws-review',
    workspaceTitle: 'Contract review',
    action: 'read the contract and record the decision',
    primaryJob: 'decide whether a contract needs a solicitor',
    intendedRoles: ['role-counsel'],
    records: ['contract', 'reason'],
    decisions: ['approve', 'reject'],
    whyNotExisting: 'no existing workspace shows the contract next to the threshold rule',
    requirementIds: [],
    taskIds: ['t-intake', 't-review'],
    audience: 'internal',
    permissionViews: [{ roleId: 'role-counsel', visibleActions: ['approve', 'reject'] }],
    deepLink: '/contracts/:id/review',
    preservesNavigationState: true,
    ...over,
  };
}

const ws = (taskId: string, over: Partial<WorkspaceRef> = {}): TaskSurfaceBinding =>
  ({ taskId, kind: 'workspace', ref: ref(over) });

const headless = (taskId: string, reason = 'scheduled_ingestion' as const): TaskSurfaceBinding =>
  ({ taskId, kind: 'headless', reason });

const codes = (issues: ReadonlyArray<{ code: string }>) => issues.map((i) => i.code);

describe('businessTasks excludes flow markers', () => {
  it('counts TASK and DECISION only, so START and END need no surface', () => {
    const ids = businessTasks(manualOnlyProject()).map((t) => t.id);
    // Fixture D is START -> intake -> DECISION -> two ENDs.
    expect(ids).toEqual(['t-intake', 't-review']);
  });
});

describe('a complete mapping passes', () => {
  it('Fixture D maps totally with no issues', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(), [ws('t-intake'), ws('t-review')]);
    expect(issues).toEqual([]);
  });

  it('a mixed mapping passes: one surfaced task, one declared headless', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-review'), headless('t-intake', 'scheduled_ingestion')]);
    expect(issues).toEqual([]);
  });
});

describe('every business task needs exactly one binding', () => {
  it('an unmapped task is refused', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(), [ws('t-review')]);
    expect(codes(issues)).toEqual(['SURFACE_UNMAPPED']);
    expect(issues[0].stepId).toBe('t-intake');
  });

  it('two bindings for one task are refused — there is no "mostly decided"', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), headless('t-intake'), ws('t-review')]);
    expect(codes(issues)).toEqual(['SURFACE_DUPLICATE_BINDING']);
  });

  it('THE MIRROR CHECK: a binding for a task the project does not declare is refused', () => {
    // Phase 3's T6 proved the unchecked direction is the one that inflates the headline: one
    // effort row for a nonexistent task took a manual-only blueprint from 0% to 97.9% automated.
    // A binding for a ghost task would likewise make coverage look complete.
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review'), ws('t-ghost')]);
    expect(codes(issues)).toEqual(['SURFACE_TASK_UNKNOWN']);
    expect(issues[0].stepId).toBe('t-ghost');
  });
});

describe('THE WALKING-SKELETON RULE: a project with no human path is refused', () => {
  it('an all-headless project FAILS, even though every reason is validly declared', () => {
    // The production failure in miniature: a student finished 20 of 20 stories and could not run
    // her own product. Every per-task rule here passes; the blueprint still describes a system
    // nobody can operate. If this case passed, the check would be inert.
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [headless('t-intake', 'scheduled_ingestion'), headless('t-review', 'derived_computation')]);
    expect(codes(issues)).toEqual(['SURFACE_NO_HUMAN_PATH']);
  });

  it('PASSING COUNTERPART: one single human surface is enough to clear it', () => {
    // Without this, a rule that refused every project would also pass the test above.
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-review'), headless('t-intake', 'scheduled_ingestion')]);
    expect(codes(issues)).not.toContain('SURFACE_NO_HUMAN_PATH');
  });

  it('does not fire on a project with no business tasks at all', () => {
    // An empty process is a different defect, and processValidation owns it. Reporting
    // "no human path" here as well would be a second complaint about one cause.
    const empty: FactoryProject = { ...manualOnlyProject(), tasks: [] };
    expect(codes(validateTaskSurfaces(empty, []))).toEqual([]);
  });
});

describe('headless reasons are a closed set', () => {
  it.each(HEADLESS_REASONS)('%s is accepted', (reason) => {
    const issues = validateTaskSurfaces(manualOnlyProject(), [ws('t-review'), headless('t-intake', reason)]);
    expect(issues).toEqual([]);
  });

  it('a reason outside the set is refused, even arriving as runtime JSON', () => {
    // The union stops this at compile time; a decomposition arrives as JSON, where it does not.
    const smuggled = { taskId: 't-intake', kind: 'headless', reason: 'because it is internal' };
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-review'), smuggled as unknown as TaskSurfaceBinding]);
    expect(codes(issues)).toEqual(['HEADLESS_REASON_UNDECLARED']);
  });
});

describe('a proposed screen must justify itself', () => {
  it('an empty whyNotExisting is refused — that is the renamed dashboard', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review', { whyNotExisting: '   ' })]);
    expect(codes(issues)).toEqual(['NEW_SCREEN_UNJUSTIFIED']);
  });

  it('a missing deep link is refused', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review', { deepLink: '' })]);
    expect(codes(issues)).toEqual(['SURFACE_DEEP_LINK_MISSING']);
  });
});

describe('roles and requirements must exist', () => {
  it('an intended role absent from project.roles is refused', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review', { intendedRoles: ['role-nobody'] })]);
    expect(codes(issues)).toEqual(['SURFACE_ROLE_UNKNOWN']);
  });

  it('a permission view for a nonexistent role is refused', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(), [ws('t-intake'), ws('t-review', {
      permissionViews: [{ roleId: 'role-ghost', visibleActions: ['approve'] }],
    })]);
    expect(codes(issues)).toEqual(['SURFACE_ROLE_UNKNOWN']);
  });

  it('PASSING COUNTERPART: the real role passes both checks', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(), [ws('t-intake'), ws('t-review', {
      intendedRoles: ['role-counsel'],
      permissionViews: [{ roleId: 'role-counsel', visibleActions: [] }],
    })]);
    expect(issues).toEqual([]);
  });
});

describe('a workspace cannot hold two trust boundaries', () => {
  it('the same workspace declared internal and customer is refused', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake', { audience: 'internal' }), ws('t-review', { audience: 'customer' })]);
    expect(codes(issues)).toEqual(['SURFACE_AUDIENCE_CONFLATED']);
  });

  it('PASSING COUNTERPART: two DIFFERENT workspaces may have different audiences', () => {
    // The rule is about collapsing a boundary inside one surface, not about a project serving
    // both kinds of user. Without this control the rule would forbid every customer-facing
    // product that also has an admin view.
    const issues = validateTaskSurfaces(manualOnlyProject(), [
      ws('t-intake', { workspaceId: 'ws-portal', audience: 'customer' }),
      ws('t-review', { workspaceId: 'ws-review', audience: 'internal' }),
    ]);
    expect(issues).toEqual([]);
  });
});

describe('consolidation is RECORDED, not targeted', () => {
  it('counts distinct workspaces and groups their tasks', () => {
    const a = consolidationAssessment([
      ws('t-intake', { workspaceId: 'ws-a', workspaceTitle: 'A' }),
      ws('t-review', { workspaceId: 'ws-a', workspaceTitle: 'A' }),
    ]);
    expect(a.workspaceCount).toBe(1);
    expect(a.headlessCount).toBe(0);
    expect(a.workspaces[0].taskIds).toEqual(['t-intake', 't-review']);
  });

  it('counts headless bindings separately and never caps the workspace count', () => {
    const many = consolidationAssessment([
      ws('t1', { workspaceId: 'w1' }), ws('t2', { workspaceId: 'w2' }),
      ws('t3', { workspaceId: 'w3' }), ws('t4', { workspaceId: 'w4' }),
      ws('t5', { workspaceId: 'w5' }), ws('t6', { workspaceId: 'w6' }),
      headless('t7'),
    ]);
    // Six surfaces is reported, not refused: workspace count is recorded, not targeted, and a cap
    // would silently drop a surface.
    expect(many.workspaceCount).toBe(6);
    expect(many.headlessCount).toBe(1);
  });
});

describe('proposed surfaces are reported, never auto-bound', () => {
  it('names an upstream surface that no workspace covers', () => {
    const out = unboundProposedSurfaces(['Contract review', 'Solicitor queue'], [ws('t-review')]);
    expect(out).toEqual(['Solicitor queue']);
  });

  it('matches case- and whitespace-insensitively, and reports nothing when covered', () => {
    expect(unboundProposedSurfaces(['  contract REVIEW '], [ws('t-review')])).toEqual([]);
  });

  it('is not a validation error — an unbound proposal never appears in the issue list', () => {
    // A surface named in an interview and absent from the design is a question for a reviewer.
    // Treating it as an error would push a generator to invent a screen to clear the gate.
    const issues = validateTaskSurfaces(manualOnlyProject(), [ws('t-intake'), ws('t-review')]);
    expect(issues).toEqual([]);
  });
});

describe('the code list is the contract', () => {
  it('every code this module can emit is declared in SURFACE_CODES', () => {
    const emitted = new Set<string>();
    const project = manualOnlyProject();
    const cases: TaskSurfaceBinding[][] = [
      [ws('t-review')],
      [ws('t-intake'), headless('t-intake'), ws('t-review')],
      [ws('t-intake'), ws('t-review'), ws('t-ghost')],
      [headless('t-intake'), headless('t-review')],
      [ws('t-intake'), ws('t-review', { whyNotExisting: '' })],
      [ws('t-intake'), ws('t-review', { deepLink: '' })],
      [ws('t-intake'), ws('t-review', { intendedRoles: ['nope'] })],
      [ws('t-intake', { audience: 'internal' }), ws('t-review', { audience: 'customer' })],
      [ws('t-review'), { taskId: 't-intake', kind: 'headless', reason: 'x' } as unknown as TaskSurfaceBinding],
    ];
    for (const c of cases) for (const i of validateTaskSurfaces(project, c)) emitted.add(i.code);

    for (const c of emitted) expect(SURFACE_CODES).toContain(c as never);
    // And the reverse: every declared code is reachable, so the list has no decorative members.
    expect([...emitted].sort()).toEqual([...SURFACE_CODES].sort());
  });
});
