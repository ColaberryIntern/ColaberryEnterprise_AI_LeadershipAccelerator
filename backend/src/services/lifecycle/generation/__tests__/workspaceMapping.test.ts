/**
 * P4-T1 tests.
 *
 * Every count- or pattern-based check carries a deliberately-violating case, and every refusal has
 * a PASSING counterpart so a rule that refused everything would fail too. A check that cannot fail
 * is not a check.
 *
 * The malformed-input block exists because attempt 1 threw a raw `TypeError` on nine shapes that a
 * model can emit. Each of those nine now asserts a RETURNED refusal code — a throw would fail the
 * test, which is the point.
 */

import {
  HEADLESS_REASONS,
  SURFACE_CODES,
  businessTasks,
  consolidationAssessment,
  unboundProposedSurfaces,
  validateTaskSurfaces,
  type HeadlessAcceptance,
  type TaskSurfaceBinding,
  type WorkspaceRef,
} from '../workspaceMapping';
import { manualOnlyProject } from './fixtures/manualOnly';
import { fixtureA, fixtureB, fixtureC } from './fixtures/referenceFixtures';
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
  ({ taskId, kind: 'workspace', ref: ref({ taskIds: [taskId], ...over }) });

const headless = (taskId: string, reason = 'scheduled_ingestion' as const): TaskSurfaceBinding =>
  ({ taskId, kind: 'headless', reason });

const codes = (issues: ReadonlyArray<{ code: string }>) => issues.map((i) => i.code);

/** Anything a model could emit. Cast exactly as a real decomposition would arrive. */
const smuggle = (v: unknown): TaskSurfaceBinding => v as TaskSurfaceBinding;

const ACCEPTED: HeadlessAcceptance = {
  rationale: 'This is an ingestion pipeline with no operator surface by design; the client runs it '
    + 'from their own scheduler.',
  acceptedBy: 'owner@example.test',
};

describe('businessTasks excludes flow markers', () => {
  it('counts TASK and DECISION only, so START and END need no surface', () => {
    expect(businessTasks(manualOnlyProject()).map((t) => t.id)).toEqual(['t-intake', 't-review']);
  });
});

describe('a complete mapping passes', () => {
  it('Fixture D maps totally with no issues', () => {
    expect(validateTaskSurfaces(manualOnlyProject(), [ws('t-intake'), ws('t-review')])).toEqual([]);
  });

  it('a mixed mapping passes: one surfaced task, one declared headless', () => {
    expect(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-review'), headless('t-intake')])).toEqual([]);
  });

  it.each([['A', fixtureA], ['B', fixtureB], ['C', fixtureC]] as const)(
    'Fixture %s maps totally — the acceptance item named all four fixtures, not just D',
    (_name, fx) => {
      const project = fx.project();
      const ids = businessTasks(project).map((t) => t.id);
      expect(ids).toEqual(['t-draft', 't-review']);
      const bindings = ids.map((id) => ws(id, { intendedRoles: ['r-1'], permissionViews: [] }));
      expect(validateTaskSurfaces(project, bindings)).toEqual([]);
    });
});

describe('MALFORMED INPUT IS REFUSED, NEVER THROWN', () => {
  // Attempt 1 threw a raw TypeError on every one of these. A generic error escaping a validator
  // tells the caller nothing, and CLAUDE.md forbids `Error` as a production error class.
  const project = manualOnlyProject();
  const partial = (drop: keyof WorkspaceRef): TaskSurfaceBinding => {
    const r = { ...ref({ taskIds: ['t-intake'] }) } as Record<string, unknown>;
    delete r[drop];
    return smuggle({ taskId: 't-intake', kind: 'workspace', ref: r });
  };

  it.each([
    'whyNotExisting', 'deepLink', 'intendedRoles', 'permissionViews', 'requirementIds',
    'workspaceId', 'workspaceTitle', 'action', 'primaryJob', 'records', 'decisions', 'taskIds',
    'audience', 'preservesNavigationState',
  ] as const)('a ref missing %s is refused, not thrown', (field) => {
    const issues = validateTaskSurfaces(project, [partial(field), ws('t-review')]);
    // BOTH codes, and both are right: the binding is malformed AND the task it names is left
    // unbound as a result. Asserting only the first would hide the second.
    expect(codes(issues)).toEqual(['SURFACE_BINDING_MALFORMED', 'SURFACE_UNMAPPED']);
  });

  it('a ref that is entirely absent is refused', () => {
    const issues = validateTaskSurfaces(project,
      [smuggle({ taskId: 't-intake', kind: 'workspace' }), ws('t-review')]);
    expect(codes(issues)).toEqual(['SURFACE_BINDING_MALFORMED', 'SURFACE_UNMAPPED']);
  });

  it('A THIRD `kind` IS REFUSED — the docs say two states, so three must not throw', () => {
    // workspace-and-control-design.md says "Two states, no third, and no default". Attempt 1 made
    // that false at runtime: a third kind was an unhandled TypeError, not a refusal.
    //
    // The ref is VALID on purpose. An earlier version of this test passed a kind-only object, and
    // the mutation run proved that test passed for the wrong reason: with the kind guard deleted,
    // the absent-ref guard still returned SURFACE_BINDING_MALFORMED, so the kind guard itself was
    // UNCOVERED. With a well-formed ref, deleting the guard makes the binding silently pass as a
    // workspace — which is the dangerous outcome, and now a failing test.
    const issues = validateTaskSurfaces(project, [
      smuggle({ taskId: 't-intake', kind: 'manual', ref: ref({ taskIds: ['t-intake'] }) }),
      ws('t-review'),
    ]);
    expect(codes(issues)).toEqual(['SURFACE_BINDING_MALFORMED', 'SURFACE_UNMAPPED']);
    // The CAUSE, not just the code: asserting the code alone is what hid the gap.
    expect(issues[0].message).toContain('There is no third');
  });

  it('a non-string taskId is refused', () => {
    expect(codes(validateTaskSurfaces(project, [smuggle({ kind: 'headless', reason: 'x' })])))
      .toContain('SURFACE_BINDING_MALFORMED');
  });

  it('a headless binding with no reason string is refused', () => {
    const issues = validateTaskSurfaces(project,
      [smuggle({ taskId: 't-intake', kind: 'headless' }), ws('t-review')]);
    expect(codes(issues)).toEqual(['SURFACE_BINDING_MALFORMED', 'SURFACE_UNMAPPED']);
  });

  it('an out-of-union audience is refused', () => {
    const issues = validateTaskSurfaces(project,
      [ws('t-intake', { audience: 'partner' as never }), ws('t-review')]);
    expect(codes(issues)).toEqual(['SURFACE_BINDING_MALFORMED', 'SURFACE_UNMAPPED']);
  });

  it('consolidationAssessment SKIPS a malformed binding instead of crashing', () => {
    const a = consolidationAssessment([
      smuggle({ taskId: 't-intake', kind: 'workspace' }), ws('t-review'), headless('t-x'),
    ]);
    expect(a.workspaceCount).toBe(1);
    expect(a.headlessCount).toBe(1);
  });

  it('unboundProposedSurfaces SKIPS a malformed binding instead of crashing', () => {
    const out = unboundProposedSurfaces(['Contract review'],
      [smuggle({ taskId: 't-x', kind: 'workspace', ref: { workspaceTitle: 42 } })]);
    expect(out).toEqual(['Contract review']);
  });

  it('PASSING COUNTERPART: a well-formed binding is not reported malformed', () => {
    expect(codes(validateTaskSurfaces(project, [ws('t-intake'), ws('t-review')])))
      .not.toContain('SURFACE_BINDING_MALFORMED');
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
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review'), ws('t-ghost')]);
    expect(codes(issues)).toEqual(['SURFACE_TASK_UNKNOWN']);
    expect(issues[0].stepId).toBe('t-ghost');
  });

  it('a binding on a FLOW MARKER is refused rather than silently skipped', () => {
    // Attempt 1 skipped these, so a ref on START bypassed every rule below while still being
    // counted by consolidationAssessment — a surface that existed for the count and nothing else.
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review'), ws('t-start')]);
    expect(codes(issues)).toEqual(['SURFACE_BINDING_ON_FLOW_MARKER']);
    expect(issues[0].stepId).toBe('t-start');
  });
});

describe('THE NO-HUMAN-PATH RULE is a disclosure requirement, not a threshold', () => {
  const allHeadless: TaskSurfaceBinding[] = [
    headless('t-intake', 'scheduled_ingestion'), headless('t-review', 'derived_computation'),
  ];

  it('an UNDISCLOSED all-headless project is refused', () => {
    // The production failure in miniature: a student finished 20 of 20 stories and could not run
    // her own product. Every per-task rule passes; the blueprint still describes a system nobody
    // can operate.
    expect(codes(validateTaskSurfaces(manualOnlyProject(), allHeadless)))
      .toEqual(['SURFACE_NO_HUMAN_PATH']);
  });

  it('a DECLARED one passes — rationale plus a named acceptor, the checkTargetDisclosure shape', () => {
    // Refusing outright would force a legitimately headless pipeline to declare a workspace nobody
    // would use, which is the "invent a screen to clear the gate" incentive this phase refuses.
    expect(validateTaskSurfaces(manualOnlyProject(), allHeadless, ACCEPTED)).toEqual([]);
  });

  it.each([
    ['an empty rationale', { rationale: '   ', acceptedBy: 'owner@example.test' }],
    ['no named acceptor', { rationale: 'by design', acceptedBy: '' }],
  ])('acceptance with %s does NOT clear it, so the declaration is load-bearing', (_n, acc) => {
    expect(codes(validateTaskSurfaces(manualOnlyProject(), allHeadless, acc as HeadlessAcceptance)))
      .toEqual(['SURFACE_NO_HUMAN_PATH']);
  });

  it('PASSING COUNTERPART: one human surface clears it with no acceptance at all', () => {
    expect(codes(validateTaskSurfaces(manualOnlyProject(), [ws('t-review'), headless('t-intake')])))
      .not.toContain('SURFACE_NO_HUMAN_PATH');
  });

  it('a workspace on START does not buy a human path', () => {
    // Otherwise the flow-marker exclusion would itself be the evasion route.
    const issues = validateTaskSurfaces(manualOnlyProject(), [...allHeadless, ws('t-start')]);
    expect(codes(issues)).toContain('SURFACE_NO_HUMAN_PATH');
  });

  it('does not fire on a project with no business tasks at all', () => {
    const empty: FactoryProject = { ...manualOnlyProject(), tasks: [] };
    expect(codes(validateTaskSurfaces(empty, []))).toEqual([]);
  });
});

describe('headless reasons are a closed set', () => {
  it.each(HEADLESS_REASONS)('%s is accepted', (reason) => {
    expect(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-review'), headless('t-intake', reason)])).toEqual([]);
  });

  it('a reason outside the set is refused, even arriving as runtime JSON', () => {
    const issues = validateTaskSurfaces(manualOnlyProject(),
      [ws('t-review'), smuggle({ taskId: 't-intake', kind: 'headless', reason: 'it is internal' })]);
    expect(codes(issues)).toEqual(['HEADLESS_REASON_UNDECLARED']);
  });
});

describe('a proposed screen must justify itself and be addressable', () => {
  it('an empty whyNotExisting is refused — that is the renamed dashboard', () => {
    expect(codes(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review', { whyNotExisting: '   ' })])))
      .toEqual(['NEW_SCREEN_UNJUSTIFIED']);
  });

  it('a missing deep link is refused', () => {
    expect(codes(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review', { deepLink: '' })])))
      .toEqual(['SURFACE_DEEP_LINK_MISSING']);
  });

  it('preservesNavigationState FALSE is refused — the field is enforced, not decorative', () => {
    // Attempt 1 declared this field and never read it: `false` passed clean. A declared field with
    // no enforcement is the dummy switch this phase exists to refuse.
    expect(codes(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review', { preservesNavigationState: false })])))
      .toEqual(['SURFACE_NAVIGATION_STATE_NOT_PRESERVED']);
  });

  it.each([
    ['workspaceId', { workspaceId: '' }],
    ['workspaceTitle', { workspaceTitle: '  ' }],
    ['action', { action: '' }],
    ['primaryJob', { primaryJob: '   ' }],
    ['intendedRoles', { intendedRoles: [], permissionViews: [] }],
    ['records', { records: [] }],
  ])('an empty %s is refused — 4.5 requires it of every proposed screen', (_n, over) => {
    expect(codes(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review', over)]))).toEqual(['SURFACE_FIELD_EMPTY']);
  });

  it('an empty decisions list is LEGAL, because a read-only view supports none', () => {
    // The documented exception. Without this control, the field rule above would forbid every
    // read-only surface.
    expect(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review', { decisions: [] })])).toEqual([]);
  });

  it('taskIds that disagree with the binding own taskId are refused', () => {
    expect(codes(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), { taskId: 't-review', kind: 'workspace', ref: ref({ taskIds: ['t-other'] }) }])))
      .toEqual(['SURFACE_TASKIDS_INCONSISTENT']);
  });
});

describe('roles and requirements must exist', () => {
  it('an intended role absent from project.roles is refused', () => {
    expect(codes(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review', { intendedRoles: ['role-nobody'] })])))
      .toEqual(['SURFACE_ROLE_UNKNOWN']);
  });

  it('a permission view for a nonexistent role is refused', () => {
    expect(codes(validateTaskSurfaces(manualOnlyProject(), [ws('t-intake'), ws('t-review', {
      permissionViews: [{ roleId: 'role-ghost', visibleActions: ['approve'] }],
    })]))).toEqual(['SURFACE_ROLE_UNKNOWN']);
  });

  it('A CITED REQUIREMENT THAT DOES NOT EXIST has its OWN code', () => {
    // Attempt 1 overloaded this onto SURFACE_TASK_UNKNOWN, and the overload is exactly what hid
    // the branch from the reachability test: deleting the check left the suite green at 28/28.
    expect(codes(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake'), ws('t-review', { requirementIds: ['req-ghost'] })])))
      .toEqual(['SURFACE_REQUIREMENT_UNKNOWN']);
  });

  it('PASSING COUNTERPART: real roles and no cited requirements pass', () => {
    expect(validateTaskSurfaces(manualOnlyProject(), [ws('t-intake'), ws('t-review', {
      intendedRoles: ['role-counsel'],
      permissionViews: [{ roleId: 'role-counsel', visibleActions: [] }],
    })])).toEqual([]);
  });
});

describe('a workspace cannot hold two trust boundaries', () => {
  it('the same workspace declared internal and customer is refused', () => {
    expect(codes(validateTaskSurfaces(manualOnlyProject(),
      [ws('t-intake', { audience: 'internal' }), ws('t-review', { audience: 'customer' })])))
      .toEqual(['SURFACE_AUDIENCE_CONFLATED']);
  });

  it('PASSING COUNTERPART: two DIFFERENT workspaces may have different audiences', () => {
    // The rule is about collapsing a boundary inside one surface, not about a project serving both
    // kinds of user. Without this control it would forbid every product with an admin view.
    expect(validateTaskSurfaces(manualOnlyProject(), [
      ws('t-intake', { workspaceId: 'ws-portal', audience: 'customer' }),
      ws('t-review', { workspaceId: 'ws-review', audience: 'internal' }),
    ])).toEqual([]);
  });
});

describe('consolidation is RECORDED, not targeted', () => {
  it('counts distinct workspaces and groups their tasks', () => {
    const a = consolidationAssessment([
      ws('t-intake', { workspaceId: 'ws-a', workspaceTitle: 'A' }),
      ws('t-review', { workspaceId: 'ws-a', workspaceTitle: 'A' }),
    ]);
    expect(a.workspaceCount).toBe(1);
    expect(a.workspaces[0].taskIds).toEqual(['t-intake', 't-review']);
  });

  it('counts headless bindings separately and never caps the workspace count', () => {
    const many = consolidationAssessment([
      ws('t1', { workspaceId: 'w1' }), ws('t2', { workspaceId: 'w2' }),
      ws('t3', { workspaceId: 'w3' }), ws('t4', { workspaceId: 'w4' }),
      ws('t5', { workspaceId: 'w5' }), ws('t6', { workspaceId: 'w6' }), headless('t7'),
    ]);
    // Reported, not refused: count is recorded, and a cap would silently drop a surface.
    expect(many.workspaceCount).toBe(6);
    expect(many.headlessCount).toBe(1);
  });
});

describe('proposed surfaces are reported, never auto-bound', () => {
  it('names an upstream surface that no workspace covers', () => {
    expect(unboundProposedSurfaces(['Contract review', 'Solicitor queue'], [ws('t-review')]))
      .toEqual(['Solicitor queue']);
  });

  it('matches case- and whitespace-insensitively', () => {
    expect(unboundProposedSurfaces(['  contract REVIEW '], [ws('t-review')])).toEqual([]);
  });

  it('ignores a blank proposal rather than reporting it as unbound', () => {
    expect(unboundProposedSurfaces(['', '   ', 'Queue'], [ws('t-review')])).toEqual(['Queue']);
  });

  it('is not a validation error — an unbound proposal never appears in the issue list', () => {
    // A surface named in an interview and absent from the design is a question for a reviewer.
    // Treating it as an error would push a generator to invent a screen to clear the gate.
    expect(validateTaskSurfaces(manualOnlyProject(), [ws('t-intake'), ws('t-review')])).toEqual([]);
  });
});

describe('the code list is the contract', () => {
  it('every declared code is reachable, and nothing outside the list is emitted', () => {
    const project = manualOnlyProject();
    const cases: TaskSurfaceBinding[][] = [
      [smuggle({ taskId: 't-intake', kind: 'manual' }), ws('t-review')],
      [ws('t-review')],
      [ws('t-intake'), ws('t-review'), ws('t-ghost')],
      [ws('t-intake'), ws('t-review', { requirementIds: ['req-ghost'] })],
      [ws('t-intake'), headless('t-intake'), ws('t-review')],
      [ws('t-intake'), ws('t-review'), ws('t-start')],
      [ws('t-intake'), ws('t-review', { whyNotExisting: '' })],
      [ws('t-intake'), ws('t-review', { action: '' })],
      [ws('t-review'), smuggle({ taskId: 't-intake', kind: 'headless', reason: 'x' })],
      [ws('t-intake'), ws('t-review', { intendedRoles: ['nope'] })],
      [ws('t-intake', { audience: 'internal' }), ws('t-review', { audience: 'customer' })],
      [ws('t-intake'), ws('t-review', { deepLink: '' })],
      [ws('t-intake'), ws('t-review', { preservesNavigationState: false })],
      [ws('t-intake'), { taskId: 't-review', kind: 'workspace', ref: ref({ taskIds: ['x'] }) }],
      [headless('t-intake'), headless('t-review')],
    ];
    const emitted = new Set<string>();
    for (const c of cases) for (const i of validateTaskSurfaces(project, c)) emitted.add(i.code);

    // Both directions. Attempt 1 passed this while one guard site had zero coverage, because two
    // unrelated branches shared one code; splitting SURFACE_REQUIREMENT_UNKNOWN out is what makes
    // the assertion able to see that branch at all.
    expect([...emitted].sort()).toEqual([...SURFACE_CODES].sort());
  });
});
