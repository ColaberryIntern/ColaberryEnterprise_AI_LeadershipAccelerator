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
  origin: 'owner_recorded',
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

  // ─── THE CONTAINER AND THE ELEMENTS, not just the fields. Attempt 2 refused every
  // malformed FIELD and still threw ten times: a null entry in the bindings array, and a
  // null inside permissionViews. A dropped object in a JSON list arrives exactly this way.

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 7],
    ['a string', 'nope'],
    ['an array', []],
  ])('a binding element that is %s is refused, not thrown', (_n, v) => {
    const issues = validateTaskSurfaces(project, [smuggle(v), ws('t-intake'), ws('t-review')]);
    expect(codes(issues)).toEqual(['SURFACE_BINDING_MALFORMED']);
  });

  it('a NULL element inside permissionViews is refused, not thrown', () => {
    // refIssues mapped p.roleId over an array proven to BE an array whose members were never
    // typed — the array-level form of attempt 1’s one-field mistake.
    const issues = validateTaskSurfaces(project, [
      ws('t-intake'), smuggle({ taskId: 't-review', kind: 'workspace',
        ref: { ...ref({ taskIds: ['t-review'] }), permissionViews: [null] } }),
    ]);
    expect(codes(issues)).toEqual(['SURFACE_BINDING_MALFORMED', 'SURFACE_UNMAPPED']);
  });

  it('a permissionViews entry missing roleId is refused', () => {
    const issues = validateTaskSurfaces(project, [
      ws('t-intake'), smuggle({ taskId: 't-review', kind: 'workspace',
        ref: { ...ref({ taskIds: ['t-review'] }), permissionViews: [{ visibleActions: [] }] } }),
    ]);
    expect(codes(issues)).toEqual(['SURFACE_BINDING_MALFORMED', 'SURFACE_UNMAPPED']);
  });

  it.each([
    'intendedRoles', 'records', 'decisions', 'requirementIds', 'taskIds',
  ] as const)('a non-string entry inside %s is refused', (field) => {
    const issues = validateTaskSurfaces(project, [
      ws('t-intake'), smuggle({ taskId: 't-review', kind: 'workspace',
        ref: { ...ref({ taskIds: ['t-review'] }), [field]: [42] } }),
    ]);
    expect(codes(issues)).toEqual(['SURFACE_BINDING_MALFORMED', 'SURFACE_UNMAPPED']);
  });

  it.each([
    ['consolidationAssessment', () => consolidationAssessment([smuggle(null), ws('t-a')])],
    ['unboundProposedSurfaces', () => unboundProposedSurfaces(['X'], [smuggle(null)])],
  ])('%s does not throw on a null element either', (_n, run) => {
    // Both were documented as skipping malformed entries, and both crashed on exactly this.
    expect(run).not.toThrow();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // A GENERATOR, NOT AN ENUMERATION.
  //
  // Four consecutive attempts published a claim quantified over all JSON input and backed it
  // with a hand-written list of the shapes the author thought of. Each list missed a different
  // layer: one field, then the container, then the array elements, then the stringification
  // inside the refusal message. A finite list cannot establish a claim over an infinite space.
  //
  // So the corpus is GENERATED from a seeded deterministic PRNG, combined with the literals
  // already known to be hostile, and spliced into every reachable position. Same seed, same
  // corpus, every run — reproducible evidence rather than an anecdote. The standing rule is
  // recorded in plan-phase4.md.
  // ─────────────────────────────────────────────────────────────────────────────

  /** Deterministic LCG. A seeded generator is reproducible; Math.random would not be. */
  function lcg(seed: number): () => number {
    let x = seed >>> 0;
    return () => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 0x100000000;
    };
  }

  /** Emit JSON TEXT, so every value is genuinely what JSON.parse produces. */
  function jsonText(rnd: () => number, depth: number): string {
    const r = rnd();
    if (depth <= 0 || r < 0.34) {
      const leaf = rnd();
      if (leaf < 0.2) return 'null';
      if (leaf < 0.35) return 'true';
      if (leaf < 0.5) return String(Math.floor(rnd() * 1000) - 500);
      if (leaf < 0.62) return '0';
      if (leaf < 0.75) return JSON.stringify(Math.floor(rnd() * 1e6) / 7);
      if (leaf < 0.88) return '""';
      return JSON.stringify(`s${Math.floor(rnd() * 9999)}`);
    }
    const n = Math.floor(rnd() * 4);
    if (r < 0.67) {
      const items: string[] = [];
      for (let i = 0; i < n; i += 1) items.push(jsonText(rnd, depth - 1));
      return `[${items.join(',')}]`;
    }
    // Object keys drawn from the names this module actually dereferences, so the generator
    // reaches the dangerous paths rather than wandering in an unrelated keyspace.
    const keys = ['toString', 'valueOf', 'taskId', 'kind', 'ref', 'audience', 'roleId',
      '__proto__', 'length', '0', 'constructor'];
    const parts: string[] = [];
    for (let i = 0; i < n + 1; i += 1) {
      const k = keys[Math.floor(rnd() * keys.length)];
      parts.push(`${JSON.stringify(k)}:${jsonText(rnd, depth - 1)}`);
    }
    return `{${parts.join(',')}}`;
  }

  /** Literals already proven dangerous, kept so a known regression cannot slip past the PRNG. */
  const KNOWN_HOSTILE_JSON: ReadonlyArray<string> = [
    '{"toString":null}',   // falsified attempt 3: String() throws on this
    '{"valueOf":null}',
    '{"toString":null,"valueOf":null}',
    '{"toString":{}}',
    '{"__proto__":{"polluted":true}}',
    '{"length":2}',
    '[]', '{}', 'null', 'true', '0', '""', '-1', '1e308',
  ];

  /** Every position this module dereferences, as a setter on a would-be binding. */
  const PATHS: ReadonlyArray<readonly [string, (v: unknown) => unknown]> = [
    ['<binding itself>', (v) => v],
    ['taskId', (v) => ({ ...base(), taskId: v })],
    ['kind', (v) => ({ ...base(), kind: v })],
    ['reason', (v) => ({ taskId: 't-intake', kind: 'headless', reason: v })],
    ['ref', (v) => ({ ...base(), ref: v })],
    ['ref.workspaceId', (v) => refAt('workspaceId', v)],
    ['ref.workspaceTitle', (v) => refAt('workspaceTitle', v)],
    ['ref.action', (v) => refAt('action', v)],
    ['ref.primaryJob', (v) => refAt('primaryJob', v)],
    ['ref.whyNotExisting', (v) => refAt('whyNotExisting', v)],
    ['ref.deepLink', (v) => refAt('deepLink', v)],
    ['ref.audience', (v) => refAt('audience', v)],
    ['ref.preservesNavigationState', (v) => refAt('preservesNavigationState', v)],
    ['ref.intendedRoles', (v) => refAt('intendedRoles', v)],
    ['ref.intendedRoles[0]', (v) => refAt('intendedRoles', [v])],
    ['ref.records', (v) => refAt('records', v)],
    ['ref.records[0]', (v) => refAt('records', [v])],
    ['ref.decisions[0]', (v) => refAt('decisions', [v])],
    ['ref.requirementIds', (v) => refAt('requirementIds', v)],
    ['ref.requirementIds[0]', (v) => refAt('requirementIds', [v])],
    ['ref.taskIds', (v) => refAt('taskIds', v)],
    ['ref.taskIds[0]', (v) => refAt('taskIds', [v])],
    ['ref.permissionViews', (v) => refAt('permissionViews', v)],
    ['ref.permissionViews[0]', (v) => refAt('permissionViews', [v])],
    ['ref.permissionViews[0].roleId', (v) => refAt('permissionViews', [{ roleId: v, visibleActions: [] }])],
    ['ref.permissionViews[0].visibleActions', (v) => refAt('permissionViews', [{ roleId: 'r', visibleActions: v }])],
    ['ref.permissionViews[0].visibleActions[0]', (v) => refAt('permissionViews', [{ roleId: 'r', visibleActions: [v] }])],
  ];

  const base = () => ({ taskId: 't-intake', kind: 'workspace', ref: ref({ taskIds: ['t-intake'] }) });
  const refAt = (k: string, v: unknown) => ({
    taskId: 't-intake', kind: 'workspace',
    ref: { ...ref({ taskIds: ['t-intake'] }), [k]: v },
  });

  function corpus(): unknown[] {
    const rnd = lcg(20261005);
    const out: unknown[] = KNOWN_HOSTILE_JSON.map((t) => JSON.parse(t));
    for (let i = 0; i < 400; i += 1) out.push(JSON.parse(jsonText(rnd, 3)));
    return out;
  }

  it('GENERATED CORPUS: no JSON.parse-producible value throws, in any position, in any export',
    () => {
      const values = corpus();
      const throws: string[] = [];
      let calls = 0;

      for (const v of values) {
        for (const [pathName, put] of PATHS) {
          const binding = smuggle(put(v));
          const attempts: ReadonlyArray<readonly [string, () => unknown]> = [
            ['validateTaskSurfaces', () => validateTaskSurfaces(project, [binding])],
            ['consolidationAssessment', () => consolidationAssessment([binding])],
            ['unboundProposedSurfaces', () => unboundProposedSurfaces(['X'], [binding])],
          ];
          for (const [fn, run] of attempts) {
            calls += 1;
            try {
              run();
            } catch (e) {
              throws.push(`${fn} @ ${pathName} :: ${(e as Error).message}`);
            }
          }
        }
      }

      // The corpus is big enough to be meaningful and the assertion names what failed, so a
      // regression reports the path rather than just a count.
      expect(calls).toBeGreaterThan(30000);
      expect(throws.slice(0, 5)).toEqual([]);
      expect(throws).toHaveLength(0);
    });

  it('THE ARGUMENTS THEMSELVES are generated over too, not just their contents', () => {
    // Attempt 3 typed every field and element and never checked that `bindings` was an array.
    const throws: string[] = [];
    for (const v of corpus()) {
      for (const [fn, run] of [
        ['validateTaskSurfaces/bindings', () => validateTaskSurfaces(project, v as never)],
        ['consolidationAssessment/bindings', () => consolidationAssessment(v as never)],
        ['unboundProposedSurfaces/bindings', () => unboundProposedSurfaces(['X'], v as never)],
        ['unboundProposedSurfaces/proposed', () => unboundProposedSurfaces(v as never, [])],
        ['validateTaskSurfaces/project', () => validateTaskSurfaces(v as never, [])],
        ['validateTaskSurfaces/acceptance', () => validateTaskSurfaces(project, [], v as never)],
        ['businessTasks/project', () => businessTasks(v as never)],
      ] as ReadonlyArray<readonly [string, () => unknown]>) {
        try { run(); } catch (e) { throws.push(`${fn} :: ${(e as Error).message}`); }
      }
    }
    expect(throws.slice(0, 5)).toEqual([]);
    expect(throws).toHaveLength(0);
  });

  it('A NON-ARRAY bindings argument is REFUSED, not silently treated as empty', () => {
    // Not throwing is necessary but not sufficient: returning [] would report a broken input as
    // a compliant mapping. This fails closed.
    for (const v of [null, undefined, 0, {}, true, 'x']) {
      expect(codes(validateTaskSurfaces(project, v as never)))
        .toEqual(['SURFACE_ARGUMENT_NOT_ARRAY']);
    }
  });

  it('AN UNUSABLE PROJECT is REFUSED, not reported as having nothing to check', () => {
    for (const v of [null, {}, { tasks: [] }, { tasks: [], roles: [] }]) {
      expect(codes(validateTaskSurfaces(v as never, []))).toEqual(['SURFACE_PROJECT_UNUSABLE']);
    }
  });

  it('PASSING COUNTERPART: a real project and a real array are not refused as malformed', () => {
    const out = codes(validateTaskSurfaces(project, [ws('t-intake'), ws('t-review')]));
    expect(out).not.toContain('SURFACE_ARGUMENT_NOT_ARRAY');
    expect(out).not.toContain('SURFACE_PROJECT_UNUSABLE');
    expect(out).toEqual([]);
  });

  it('the label helper cannot throw on the value that broke attempt 3', () => {
    // String(JSON.parse('{"toString":null}')) throws; label() must not.
    const hostile = JSON.parse('{"toString":null}');
    const issues = validateTaskSurfaces(project,
      [smuggle({ taskId: 't-intake', kind: hostile }), ws('t-review')]);
    expect(codes(issues)).toEqual(['SURFACE_BINDING_MALFORMED', 'SURFACE_UNMAPPED']);
    // And the message describes it safely rather than interpolating it.
    expect(issues[0].message).toContain('declares kind "object"');
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

  it('AN ACCEPTANCE FROM THE SAME MODEL TURN DOES NOT WAIVE IT', () => {
    // A disclosure a generator can self-issue is not a disclosure. Attempt 2 copied
    // checkTargetDisclosure, which needs no origin because it waives a TARGET sitting on an
    // independent measurement. Here the acceptance IS the whole gate, so it mirrors
    // blueprintGeneration.DECLARATION_SELF_SUPPLIED instead.
    const selfIssued: HeadlessAcceptance = { ...ACCEPTED, origin: 'model_turn' };
    const issues = validateTaskSurfaces(manualOnlyProject(), allHeadless, selfIssued);
    expect(codes(issues)).toEqual(['SURFACE_ACCEPTANCE_SELF_SUPPLIED']);
    expect(issues[0].message).toContain('declare whatever it invents');
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

  it('THE POSITIVE CONTROL THIS CODE WAS MISSING: a REAL cited requirement passes', () => {
    // Uniquely among the 15 codes, SURFACE_REQUIREMENT_UNKNOWN had no passing counterpart:
    // manualOnlyProject() declares no requirements and ref() cites none, so no test ever
    // cited one that EXISTS. An always-fire mutation of the check therefore survived at
    // 69/69, and the suite header’s promise that every refusal has a passing counterpart
    // was false for exactly this rule. The irony: this is the code attempt 2 split out
    // BECAUSE overloading had hidden a gap in it.
    const project: FactoryProject = {
      ...manualOnlyProject(),
      requirements: [{
        id: 'req-50k', statement: 'contracts over 50k need a solicitor', kind: 'functional',
        priority: 'must', tracks: [], source_document: 'doc', source_locator: '1.1',
        acceptance_criteria: [], evidence_state: 'stated',
      } as never],
    };
    const issues = validateTaskSurfaces(project, [
      ws('t-intake'), ws('t-review', { requirementIds: ['req-50k'] }),
    ]);
    expect(issues).toEqual([]);
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
      [smuggle(null), ws('t-intake'), ws('t-review')],
    ];
    const emitted = new Set<string>();
    for (const c of cases) for (const i of validateTaskSurfaces(project, c)) emitted.add(i.code);
    // Three codes need a call shape the loop above cannot express, so they are driven
    // separately rather than left undriven. This assertion catching their absence is exactly
    // what it is for: the two argument-guard codes were added in the follow-up commit and the
    // test failed until these lines existed.
    for (const i of validateTaskSurfaces(project,
      [headless('t-intake'), headless('t-review')],
      { ...ACCEPTED, origin: 'model_turn' })) emitted.add(i.code);
    for (const i of validateTaskSurfaces(project, null as never)) emitted.add(i.code);
    for (const i of validateTaskSurfaces(null as never, [])) emitted.add(i.code);

    // Both directions. Attempt 1 passed this while one guard site had zero coverage, because two
    // unrelated branches shared one code; splitting SURFACE_REQUIREMENT_UNKNOWN out is what makes
    // the assertion able to see that branch at all.
    expect([...emitted].sort()).toEqual([...SURFACE_CODES].sort());
  });
});
