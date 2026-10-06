/**
 * P4-T2 tests.
 *
 * Built with P4-T1's lessons applied from the start rather than discovered over eight gradings:
 *
 * - Every refusal has a PASSING counterpart, so a rule that refused everything would fail too.
 * - The malformed-input bound is proven by a GENERATOR whose keyspace and leaf values are DERIVED
 *   from the module source, not by a hand-written list of shapes someone thought of.
 * - Reach is "the body ran", never "a particular code is absent" — the predicate that let a
 *   never-entered body report full reach in P4-T1.
 * - The reach control is PER POSITION and names what it cannot reach; an aggregate hides zero rows.
 * - Positions whose guard requires a valid structure carry a seeded exemplar, because no hostile
 *   corpus will ever reach them.
 * - No count of this apparatus appears in prose (Amendment 3); two checks enforce that.
 */

import { readFileSync } from 'fs';
import { buildDesignBrief } from '../../../delivery/designBrief';
import type { BuildBlueprint } from '../../../delivery/buildBlueprint';
import type { ProjectUnderstanding } from '../../../delivery/projectUnderstanding';
import { join } from 'path';
import {
  CONTROL_CODES,
  controlSurfaceExists,
  renderControlAvailability,
  validateControlSpec,
  type ApproverRequirement,
  type ControlPolicy,
} from '../controlSpecification';

const ROLES = new Set(['role-owner', 'role-admin']);

const noApproval: ApproverRequirement = {
  required: false, approverRoleId: null, separationEnforcedInCode: false,
};

/** A complete, valid policy. Each test changes one thing. */
function policy(over: Partial<ControlPolicy> = {}): ControlPolicy {
  return {
    policyKey: 'agent.max_runs_per_hour',
    valueType: 'integer',
    value: 60,
    allowedRange: { min: 1, max: 500 },
    requiredPermission: 'admin:agents:write',
    approverRequirement: noApproval,
    version: 1,
    effectiveAt: '2026-10-05T00:00:00.000Z',
    previewDiff: true,
    enforcement: {
      status: 'enforced',
      enforcedBy: 'persisted_column_checked',
      callSite: 'workforceAgentRuntime.ts:69',
    },
    ...over,
  };
}

const unavailable = (over: Partial<ControlPolicy> = {}): ControlPolicy => policy({
  enforcement: { status: 'unavailable', why: 'no_enforcement_site' },
  ...over,
});

const codes = (issues: ReadonlyArray<{ code: string }>) => issues.map((i) => i.code);
const smuggle = (v: unknown): ControlPolicy => v as ControlPolicy;

/**
 * Did the body run, or did we get the single early-return refusal?
 *
 * P4-T1 defined reach as "no CONTROL_SPEC_MALFORMED present", and a verifier proved that vacuous:
 * a blanket early return carrying a different code satisfied it while the body never ran. The
 * early return here is structurally distinctive — exactly one issue with no `stepId`.
 */
const bodyRan = (issues: ReadonlyArray<{ code: string; stepId?: string }>): boolean => !(
  issues.length === 1
  && issues[0].stepId === undefined
  && issues[0].code === 'CONTROL_SPEC_MALFORMED'
);

describe('a complete specification validates', () => {
  it('a spec covering permissions, limits, approval, pause/resume and recovery passes', () => {
    // The five concerns §4.5 names, each with a real enforcement site from this repo.
    const spec: ControlPolicy[] = [
      policy({ policyKey: 'agent.enabled', valueType: 'boolean', value: true, allowedRange: null,
        enforcement: { status: 'enforced', enforcedBy: 'persisted_column_checked',
          callSite: 'workforceAgentRuntime.ts:69' } }),
      policy({ policyKey: 'system.kill_switch', valueType: 'boolean', value: false,
        allowedRange: null,
        enforcement: { status: 'enforced', enforcedBy: 'system_setting_checked',
          callSite: 'agentAuthorizationService.ts:173' } }),
      policy({ policyKey: 'agent.storm_rate_limit', valueType: 'integer', value: 5,
        allowedRange: { min: 1, max: 50 },
        enforcement: { status: 'enforced', enforcedBy: 'in_memory_only',
          callSite: 'launchSafety.ts:68' } }),
      policy({ policyKey: 'journey.execution_mode', valueType: 'enum', value: 'hold',
        allowedRange: { oneOf: ['live', 'hold', 'dry_run'] },
        approverRequirement: { required: true, approverRoleId: 'role-owner',
          separationEnforcedInCode: false },
        enforcement: { status: 'enforced', enforcedBy: 'persisted_column_checked',
          callSite: 'resolveExecutionMode.ts:134' } }),
      policy({ policyKey: 'control.routes', valueType: 'enum', value: 'admin',
        allowedRange: { oneOf: ['admin', 'owner'] },
        enforcement: { status: 'enforced', enforcedBy: 'route_permission',
          callSite: 'authMiddleware.ts:58' } }),
    ];
    expect(validateControlSpec(spec, ROLES)).toEqual([]);
  });

  it('an unavailable control is LEGAL and validates — that is the honest state', () => {
    expect(validateControlSpec([unavailable()], ROLES)).toEqual([]);
  });
});

describe('THE INTEGRITY RULE: enforcement needs a named call site', () => {
  it('a policy claiming `enforced` with a blank callSite is refused', () => {
    const issues = validateControlSpec([policy({
      enforcement: { status: 'enforced', enforcedBy: 'persisted_column_checked', callSite: '   ' },
    })], ROLES);
    expect(codes(issues)).toEqual(['CONTROL_ENFORCEMENT_UNNAMED']);
    expect(issues[0].message).toContain('different claims');
  });

  it('PASSING COUNTERPART: the same policy with a site passes', () => {
    expect(validateControlSpec([policy()], ROLES)).toEqual([]);
  });

  it('the three real inert limits can be expressed honestly, and validate', () => {
    // The whole reason this module exists. These are the controls the production UI renders as
    // working; declared as unavailable they are a truthful specification rather than a dummy switch.
    const inert: ControlPolicy[] = [
      'agent.max_runs_per_hour', 'agent.max_writes_per_execution', 'agent.max_proposals_per_run',
    ].map((policyKey) => unavailable({ policyKey }));
    expect(validateControlSpec(inert, ROLES)).toEqual([]);
    expect(renderControlAvailability(inert).showable).toEqual([]);
    expect(renderControlAvailability(inert).unavailable.map((u) => u.why))
      .toEqual(['no_enforcement_site', 'no_enforcement_site', 'no_enforcement_site']);
  });
});

describe('controlSurfaceExists is tested in BOTH directions', () => {
  it('false when every control is unavailable — a spec of nothing is not a surface', () => {
    expect(controlSurfaceExists([unavailable(), unavailable({ policyKey: 'b' })])).toBe(false);
  });

  it('true when at least one control is genuinely enforced', () => {
    expect(controlSurfaceExists([unavailable(), policy({ policyKey: 'b' })])).toBe(true);
  });

  it('false for an enforced claim with no call site — the claim alone is not a surface', () => {
    expect(controlSurfaceExists([policy({
      enforcement: { status: 'enforced', enforcedBy: 'route_permission', callSite: '' },
    })])).toBe(false);
  });

  it('false for an empty or non-array spec', () => {
    expect(controlSurfaceExists([])).toBe(false);
    expect(controlSurfaceExists(null as never)).toBe(false);
  });
});

describe('the spec is NOT an authorization source', () => {
  it('the TYPE forbids claiming requester-is-not-approver is enforced', () => {
    // `separationEnforcedInCode` is the literal `false`. A spec that sets it true does not compile,
    // and when it arrives as JSON it is refused — so the honest answer is the only expressible one.
    const claiming = smuggle({
      ...policy(),
      approverRequirement: { required: true, approverRoleId: 'role-owner',
        separationEnforcedInCode: true },
    });
    const issues = validateControlSpec([claiming], ROLES);
    expect(codes(issues)).toEqual(['CONTROL_SPEC_MALFORMED']);
    expect(issues[0].message).toContain('may not claim');
  });

  it('an approval requirement with no named approver is refused', () => {
    const issues = validateControlSpec([policy({
      approverRequirement: { required: true, approverRoleId: null, separationEnforcedInCode: false },
    })], ROLES);
    expect(codes(issues)).toEqual(['CONTROL_APPROVER_UNNAMED']);
  });

  it('an approver role the project does not declare is refused', () => {
    const issues = validateControlSpec([policy({
      approverRequirement: { required: true, approverRoleId: 'role-ghost',
        separationEnforcedInCode: false },
    })], ROLES);
    expect(codes(issues)).toEqual(['CONTROL_APPROVER_ROLE_UNKNOWN']);
  });

  it('PASSING COUNTERPART: a real approver role passes', () => {
    expect(validateControlSpec([policy({
      approverRequirement: { required: true, approverRoleId: 'role-admin',
        separationEnforcedInCode: false },
    })], ROLES)).toEqual([]);
  });
});

describe('the typed value must match its declared type and range', () => {
  it.each([
    ['boolean with a number', { valueType: 'boolean' as const, value: 1, allowedRange: null }],
    ['integer with a string', { valueType: 'integer' as const, value: 'sixty' }],
    ['integer with a float', { valueType: 'integer' as const, value: 1.5 }],
    ['enum with a number', { valueType: 'enum' as const, value: 7,
      allowedRange: { oneOf: ['a'] } }],
  ])('%s is refused', (_n, over) => {
    expect(codes(validateControlSpec([policy(over)], ROLES)))
      .toContain('CONTROL_VALUE_TYPE_MISMATCH');
  });

  it('a numeric value outside its range is refused', () => {
    expect(codes(validateControlSpec([policy({ value: 9999 })], ROLES)))
      .toEqual(['CONTROL_VALUE_OUT_OF_RANGE']);
  });

  it('an enum value outside its declared set is refused', () => {
    expect(codes(validateControlSpec([policy({
      valueType: 'enum', value: 'sideways', allowedRange: { oneOf: ['live', 'hold'] },
    })], ROLES))).toEqual(['CONTROL_VALUE_OUT_OF_RANGE']);
  });

  it.each([
    ['numeric with a oneOf range', { valueType: 'integer' as const, value: 5,
      allowedRange: { oneOf: ['a'] } }],
    ['enum with a min/max range', { valueType: 'enum' as const, value: 'a',
      allowedRange: { min: 1, max: 2 } }],
  ])('%s is refused as a range-shape mismatch', (_n, over) => {
    expect(codes(validateControlSpec([policy(over)], ROLES)))
      .toContain('CONTROL_RANGE_SHAPE_MISMATCH');
  });

  it('PASSING COUNTERPART: a null range is legal and means unbounded', () => {
    expect(validateControlSpec([policy({ allowedRange: null, value: 999999 })], ROLES)).toEqual([]);
  });

  it('PASSING COUNTERPART: a value at each boundary passes', () => {
    expect(validateControlSpec([policy({ value: 1 })], ROLES)).toEqual([]);
    expect(validateControlSpec([policy({ value: 500 })], ROLES)).toEqual([]);
  });
});

describe('the rest of the 4.5 tuple', () => {
  it('a missing required permission is refused', () => {
    expect(codes(validateControlSpec([policy({ requiredPermission: '  ' })], ROLES)))
      .toEqual(['CONTROL_PERMISSION_MISSING']);
  });

  it.each([[0], [-1], [1.5]])('version %s is refused', (version) => {
    expect(codes(validateControlSpec([policy({ version })], ROLES)))
      .toEqual(['CONTROL_VERSION_INVALID']);
  });

  it('an unparseable effectiveAt is refused', () => {
    expect(codes(validateControlSpec([policy({ effectiveAt: 'whenever' })], ROLES)))
      .toEqual(['CONTROL_EFFECTIVE_AT_INVALID']);
  });

  it('previewDiff FALSE is refused — declaring it false declares non-compliance', () => {
    // The same treatment P4-T1 gave `preservesNavigationState`: a declared field that is never
    // enforced is the dummy switch this phase exists to refuse.
    expect(codes(validateControlSpec([policy({ previewDiff: false })], ROLES)))
      .toEqual(['CONTROL_PREVIEW_ABSENT']);
  });

  it('a duplicate policy key is refused — the later declaration would silently win', () => {
    expect(codes(validateControlSpec([policy(), policy()], ROLES)))
      .toEqual(['CONTROL_KEY_DUPLICATE']);
  });

  it('PASSING COUNTERPART: two DIFFERENT keys pass', () => {
    expect(validateControlSpec([policy(), policy({ policyKey: 'other' })], ROLES)).toEqual([]);
  });
});

describe('renderControlAvailability splits what may be shown from what may not', () => {
  it('an enforced control is showable with its site; an unavailable one carries its reason', () => {
    const out = renderControlAvailability([policy(), unavailable({ policyKey: 'inert' })]);
    expect(out.showable).toEqual([{
      policyKey: 'agent.max_runs_per_hour',
      enforcedBy: 'persisted_column_checked',
      callSite: 'workforceAgentRuntime.ts:69',
    }]);
    expect(out.unavailable).toEqual([{ policyKey: 'inert', why: 'no_enforcement_site' }]);
  });

  it('an enforced claim with no site is NOT showable — it lands in unavailable', () => {
    const out = renderControlAvailability([policy({
      enforcement: { status: 'enforced', enforcedBy: 'route_permission', callSite: '' },
    })]);
    expect(out.showable).toEqual([]);
    expect(out.unavailable[0].why).toBe('no_enforcement_site');
  });

  it('skips a malformed entry rather than crashing on it', () => {
    const out = renderControlAvailability([smuggle(null), policy()]);
    expect(out.showable).toHaveLength(1);
    expect(out.unavailable).toEqual([]);
  });
});

describe('MALFORMED INPUT IS REFUSED, NEVER THROWN', () => {
  const SRC = readFileSync(join(__dirname, '..', 'controlSpecification.ts'), 'utf8');

  /** Names the module dereferences, plus the stringification traps. Derived, not listed. */
  const NOT_INPUT = new Set(['map', 'filter', 'every', 'some', 'forEach', 'find', 'includes',
    'push', 'join', 'trim', 'has', 'add', 'get', 'set', 'size', 'values', 'keys', 'length',
    'isArray', 'isInteger', 'parse', 'stringify', 'toBe', 'toEqual', 'sort', 'slice', 'split',
    'replace', 'from', 'of', 'prototype', 'call', 'apply', 'NaN']);

  function derived(pattern: RegExp): string[] {
    const found = new Set<string>();
    for (const m of SRC.matchAll(pattern)) found.add(m[1]);
    for (const k of NOT_INPUT) found.delete(k);
    return [...found].sort();
  }
  const LITERALS = derived(/'([A-Za-z_][A-Za-z0-9_]*)'/g);

  /**
   * The keyspace unions THREE derivations, because a dot-access regex alone has a blind spot and
   * this check found it on its first run: `min` and `max` are reached by DESTRUCTURING
   * (`const { min, max } = range`) and by an `in` test, never by `.min`, so the dot pattern
   * missed them entirely.
   *
   * A verifier warned about exactly this class for P4-T1 - computed access, destructuring,
   * aliased locals - and T1 happened to have none, so the weakness never showed. A derivation
   * with a blind spot is worse than a list, because it looks principled. Unioning the
   * single-quoted literals (which catch `'min' in range` and every `as const` member) closes it.
   * Over-inclusion is safe; under-inclusion is the failure mode.
   */
  const KEYSPACE = [...new Set([
    ...derived(/\.([A-Za-z_]\w*)/g),
    ...LITERALS,
    'toString', 'valueOf', '__proto__', 'constructor', '0',
  ])].sort();

  it('THE KEYSPACE IS DERIVED: every field the module dereferences can be generated', () => {
    for (const f of ['policyKey', 'valueType', 'value', 'allowedRange', 'requiredPermission',
      'approverRequirement', 'version', 'effectiveAt', 'previewDiff', 'enforcement', 'status',
      'enforcedBy', 'callSite', 'why', 'required', 'approverRoleId', 'separationEnforcedInCode',
      'min', 'max', 'oneOf']) {
      expect(KEYSPACE).toContain(f);
    }
    expect(KEYSPACE).toContain('toString');
  });

  it('THE LEAF VALUES ARE DERIVED: the union literals the module compares against', () => {
    for (const v of ['enforced', 'unavailable', 'boolean', 'integer', 'enum',
      'system_setting_checked', 'no_enforcement_site', 'prompt_text_only']) {
      expect(LITERALS).toContain(v);
    }
  });

  function lcg(seed: number): () => number {
    let x = seed >>> 0;
    return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 0x100000000; };
  }

  function jsonText(rnd: () => number, depth: number): string {
    const r = rnd();
    if (depth <= 0 || r < 0.34) {
      const leaf = rnd();
      if (leaf < 0.18) return 'null';
      if (leaf < 0.32) return 'true';
      if (leaf < 0.46) return String(Math.floor(rnd() * 1000) - 500);
      if (leaf < 0.56) return '1.5';
      if (leaf < 0.68) return '""';
      if (leaf < 0.86) return JSON.stringify(LITERALS[Math.floor(rnd() * LITERALS.length)]);
      return JSON.stringify(`s${Math.floor(rnd() * 9999)}`);
    }
    const n = Math.floor(rnd() * 4);
    if (r < 0.67) {
      const items: string[] = [];
      for (let i = 0; i < n; i += 1) items.push(jsonText(rnd, depth - 1));
      return `[${items.join(',')}]`;
    }
    const parts: string[] = [];
    for (let i = 0; i < n + 1; i += 1) {
      const k = KEYSPACE[Math.floor(rnd() * KEYSPACE.length)];
      parts.push(`${JSON.stringify(k)}:${jsonText(rnd, depth - 1)}`);
    }
    return `{${parts.join(',')}}`;
  }

  /** Literals already known to break stringification or type guards. */
  const KNOWN_HOSTILE = ['{"toString":null}', '{"valueOf":null}', '{"toString":{}}',
    '{"__proto__":{"x":1}}', '{"length":2}', '[]', '{}', 'null', 'true', '0', '""', '-1', '1e308'];

  function corpus(): unknown[] {
    const rnd = lcg(20261005);
    const out: unknown[] = KNOWN_HOSTILE.map((t) => JSON.parse(t));
    for (let i = 0; i < 300; i += 1) out.push(JSON.parse(jsonText(rnd, 3)));
    return out;
  }

  const at = (k: string, v: unknown) => ({ ...policy(), [k]: v });
  const nested = (outer: string, k: string, v: unknown) => ({
    ...policy(), [outer]: { ...(policy() as never)[outer] as object, [k]: v },
  });

  const PATHS: ReadonlyArray<readonly [string, (v: unknown) => unknown]> = [
    ['<policy itself>', (v) => v],
    ['policyKey', (v) => at('policyKey', v)],
    ['valueType', (v) => at('valueType', v)],
    ['value', (v) => at('value', v)],
    ['allowedRange', (v) => at('allowedRange', v)],
    ['allowedRange.min', (v) => at('allowedRange', { min: v, max: 10 })],
    ['allowedRange.max', (v) => at('allowedRange', { min: 1, max: v })],
    ['allowedRange.oneOf', (v) => at('allowedRange', { oneOf: v })],
    ['allowedRange.oneOf[0]', (v) => at('allowedRange', { oneOf: [v] })],
    ['requiredPermission', (v) => at('requiredPermission', v)],
    ['version', (v) => at('version', v)],
    ['effectiveAt', (v) => at('effectiveAt', v)],
    ['previewDiff', (v) => at('previewDiff', v)],
    ['approverRequirement', (v) => at('approverRequirement', v)],
    ['approverRequirement.required', (v) => nested('approverRequirement', 'required', v)],
    ['approverRequirement.approverRoleId', (v) => nested('approverRequirement', 'approverRoleId', v)],
    ['approverRequirement.separationEnforcedInCode',
      (v) => nested('approverRequirement', 'separationEnforcedInCode', v)],
    ['enforcement', (v) => at('enforcement', v)],
    ['enforcement.status', (v) => nested('enforcement', 'status', v)],
    ['enforcement.enforcedBy', (v) => nested('enforcement', 'enforcedBy', v)],
    ['enforcement.callSite', (v) => nested('enforcement', 'callSite', v)],
    ['enforcement.why', (v) => ({ ...policy(), enforcement: { status: 'unavailable', why: v } })],
  ];

  /**
   * A valid exemplar per position whose guard requires a specific shape.
   *
   * Three positions can only be reached by a value that IS the right structure, which random
   * substitution will not produce. The exemplar proves the position is wired; the hostile corpus
   * proves nothing throws there.
   */
  const VALID_AT: Record<string, unknown> = {
    '<policy itself>': policy(),
    valueType: 'integer',
    allowedRange: { min: 1, max: 500 },
    'enforcement.status': 'enforced',
    'enforcement.enforcedBy': 'route_permission',
    approverRequirement: noApproval,
    enforcement: policy().enforcement,
    'enforcement.why': 'not_implemented',
    previewDiff: true,
    'approverRequirement.separationEnforcedInCode': false,
    'approverRequirement.required': false,
  };

  it('GENERATED CORPUS: no JSON.parse-producible value throws, in any position', () => {
    const values = corpus();
    const throws: string[] = [];
    const perPosition: Record<string, number> = {};

    for (const [pathName, put] of PATHS) {
      const all = pathName in VALID_AT ? [...values, VALID_AT[pathName]] : values;
      for (const v of all) {
        const p = smuggle(put(v));
        try {
          const issues = validateControlSpec([p], ROLES);
          if (bodyRan(issues)) perPosition[pathName] = (perPosition[pathName] ?? 0) + 1;
        } catch (e) { throws.push(`validateControlSpec @ ${pathName} :: ${(e as Error).message}`); }
        try { renderControlAvailability([p]); } catch (e) {
          throws.push(`renderControlAvailability @ ${pathName} :: ${(e as Error).message}`);
        }
        try { controlSurfaceExists([p]); } catch (e) {
          throws.push(`controlSurfaceExists @ ${pathName} :: ${(e as Error).message}`);
        }
      }
    }

    expect(throws.slice(0, 5)).toEqual([]);
    expect(throws).toHaveLength(0);
    // PER POSITION, and it NAMES the dead ones. An aggregate hides zero rows.
    expect(PATHS.map(([n]) => n).filter((n) => !(perPosition[n] > 0))).toEqual([]);
  });

  it('THE ARGUMENT ITSELF is generated over too, and a non-array is REFUSED', () => {
    const throws: string[] = [];
    for (const v of corpus()) {
      for (const [n, run] of [
        ['validateControlSpec', () => validateControlSpec(v as never, ROLES)],
        ['renderControlAvailability', () => renderControlAvailability(v as never)],
        ['controlSurfaceExists', () => controlSurfaceExists(v as never)],
      ] as ReadonlyArray<readonly [string, () => unknown]>) {
        try { run(); } catch (e) { throws.push(`${n} :: ${(e as Error).message}`); }
      }
    }
    expect(throws).toHaveLength(0);
    // Fail CLOSED: a broken argument is refused, not reported as a compliant empty spec.
    for (const v of [null, undefined, 0, {}, true, 'x']) {
      expect(codes(validateControlSpec(v as never, ROLES))).toEqual(['CONTROL_SPEC_MALFORMED']);
    }
  });

  it('a third enforcement status is REFUSED, not thrown', () => {
    const issues = validateControlSpec([smuggle({
      ...policy(), enforcement: { status: 'partly', enforcedBy: 'route_permission', callSite: 'x' },
    })], ROLES);
    expect(codes(issues)).toEqual(['CONTROL_SPEC_MALFORMED']);
    expect(issues[0].message).toContain('There is no third');
  });

  it('AMENDMENT 3: the module header states no present-tense count of this apparatus', () => {
    expect(SRC).not.toMatch(/the \d+ positions/);
    expect(SRC).not.toMatch(/\d+ positions are/);
  });

  it('AMENDMENT 3: the position table carries no duplicate entries', () => {
    const names = PATHS.map(([n]) => n);
    expect(names).toEqual([...new Set(names)]);
  });
});

describe('the code list is the contract', () => {
  it('every declared code is reachable, and nothing outside the list is emitted', () => {
    const cases: ControlPolicy[][] = [
      [smuggle(null)],
      [policy(), policy()],
      [policy({ enforcement: { status: 'enforced', enforcedBy: 'route_permission', callSite: '' } })],
      [policy({ valueType: 'integer', value: 'x' })],
      [policy({ value: 9999 })],
      [policy({ valueType: 'enum', value: 'a', allowedRange: { min: 1, max: 2 } })],
      [policy({ requiredPermission: '' })],
      [policy({ approverRequirement: { required: true, approverRoleId: null,
        separationEnforcedInCode: false } })],
      [policy({ approverRequirement: { required: true, approverRoleId: 'ghost',
        separationEnforcedInCode: false } })],
      [policy({ version: 0 })],
      [policy({ effectiveAt: 'nope' })],
      [policy({ previewDiff: false })],
    ];
    const emitted = new Set<string>();
    for (const c of cases) for (const i of validateControlSpec(c, ROLES)) emitted.add(i.code);
    expect([...emitted].sort()).toEqual([...CONTROL_CODES].sort());
  });
});

describe('the refusal-code table in the design doc matches the code', () => {
  it('every CONTROL_ row in workspace-and-control-design.md is a real code, and none is missing', () => {
    // Added after the P4-T2 verifier found that the doc sentence claimed this check existed
    // when only the emittable-set half did. Reads the doc the way `workspaceMapping.test.ts`
    // already reads source files.
    const doc = readFileSync(
      join(__dirname, '../../../../../../docs/project-lifecycle/workspace-and-control-design.md'),
      'utf8',
    );
    const rows = [...doc.matchAll(/^\|\s*`(CONTROL_[A-Z_]+)`\s*\|/gm)].map((m) => m[1]);

    // POSITIVE CONTROL for the extraction itself: a regex that matched nothing would make
    // the comparison below vacuous in one direction and trivially false in the other, so
    // assert the parse found rows before comparing them.
    expect(rows.length).toBeGreaterThan(0);
    expect([...new Set(rows)].sort()).toEqual([...CONTROL_CODES].sort());
  });
});

describe('COMPOSITION: controlSurfaceExists() output fits the design brief field', () => {
  // The P4-T2 verifier was right that the function has NO production call site: P4-T3
  // consumes a passed boolean of the same name, and no design-stage orchestrator exists yet
  // to call one and supply the other. That wire is in the carried-forward register with an
  // owner. What this test can do is pin that the two halves FIT, so they cannot drift while
  // the wire is open — and it is a real call site for the function, in the correct
  // dependency direction (lifecycle → delivery).
  const facts = (spec: ControlPolicy[]) => ({
    controlSurfaceExists: controlSurfaceExists(spec),
    showableControls: renderControlAvailability(spec).showable,
  });
  const u = { title: 'Agent limits', items: [], proposed_surfaces: [] } as unknown as ProjectUnderstanding;
  const bp = { readiness: { not_discussed: [] } } as unknown as BuildBlueprint;

  it('an enforced control reaches the brief as a populated controls field', () => {
    const brief = buildDesignBrief(u, bp, facts([policy()]));
    expect(brief.controls).toEqual([{
      policyKey: 'agent.max_runs_per_hour',
      enforcedBy: 'persisted_column_checked',
      callSite: 'workforceAgentRuntime.ts:69',
    }]);
    // The other three facts are genuinely absent here and are correctly opened, so this asserts
    // the precise thing: nothing about CONTROLS is open when a control is enforced.
    expect(brief.open_facts?.join(' ')).not.toContain('control');
  });

  it('an all-unavailable spec reaches it as an OPEN FACT, not an empty array', () => {
    const brief = buildDesignBrief(u, bp, facts([policy({
      enforcement: { status: 'unavailable', why: 'no_enforcement_site' },
    })]));
    expect(brief.controls).toBeUndefined();
    expect(brief.open_facts?.join(' ')).toContain('nothing a human can actually operate');
  });
});