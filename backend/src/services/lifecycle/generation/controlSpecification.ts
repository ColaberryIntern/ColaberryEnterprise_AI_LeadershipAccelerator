/**
 * P4-T2 — human controls as typed policies with real enforcement points.
 *
 * §4.5: "Manager controls specify policy key, typed value, allowed range, permission, approver
 * requirement, preview/diff, version, effective time, and enforcement point. … **Only show
 * functioning controls; unimplemented capabilities are labeled unavailable and block claims that
 * they work.**"
 *
 * ## The `unavailable` state is the point of this module, not a nicety
 *
 * The dummy switch §4.5 forbids is already shipped in this repository. `AiAgent` persists
 * `max_runs_per_hour`, `max_writes_per_execution` and `max_proposals_per_run`;
 * `agentPermissionService` has a check function for each; **all three have zero call sites** —
 * precisely: outside their own definitions the only reference in the tree is a doc comment at
 * `reese/agentDetailEmployeeFacts.ts:78`, so a grep returns a hit that is not a caller. Stated
 * that way because a loose grep of my own briefly suggested the opposite. And
 * `AgentTrustControlArchitecture.tsx:24` renders them to a human as `` `Not set — ${fallback}
 * applies` `` — a sentence asserting an enforcement that does not exist. Two verifiers confirmed
 * the zero independently.
 *
 * So this module's job is not to render a control. It is to make "we have a policy" and "the policy
 * is enforced" two different, separately checkable claims.
 *
 * ## The precedent, cited rather than reinvented
 *
 * `delivery/execution/executionPolicy.ts:47-48` already says it, about a different layer:
 *
 * > `enforcedBy` is recorded because "we have a policy" and "the policy is enforced" are different
 * > claims, and Gate 0 found three of these previously had no enforcer at all.
 *
 * That union is **not** extended here, deliberately. Its four members
 * (`runner_isolation | no_provider | branch_protection | policy_gate`) are sandbox-layer concepts;
 * a pause/resume, a rate limit or a schedule has no honest member among them. Extending it would
 * force a wrong classification or widen a live policy module. The principle carries over; the enum
 * does not.
 *
 * ## The vocabularies are DERIVED from what this repo actually does, not imagined
 *
 * Every `ControlEnforcementKind` and every `UnavailableReason` names a state a survey of this
 * codebase measured. That matters because an invented taxonomy will quietly lack the member that
 * describes the real situation, and the author will then pick the nearest flattering one.
 *
 * | member | the measured state it names |
 * |---|---|
 * | `system_setting_checked` | the kill switch and `llm_safe_mode`, read at named sites |
 * | `persisted_column_checked` | `ai_agents.enabled` / `.status`, checked in `workforceAgentRuntime` |
 * | `route_permission` | `requireAdmin` and friends on the control routes |
 * | `in_memory_only` | the agent-storm rate limit: real, unpersisted, not human-settable |
 * | `hardcoded_constant` | the Reese daily send caps: enforced, but no human can change them |
 * | `no_enforcement_site` | the three execution limits: stored, checked by nothing |
 * | `prompt_text_only` | charter authority lists and `ManagerDirective` — LLM persuasion, not a gate |
 * | `verdict_discarded` | `ticketAgentDispatcher` computes an authorization verdict and drops it |
 * | `shadow_mode_only` | `abac_enforcement` defaults to shadow, so the gate returns allowed anyway |
 * | `not_implemented` | spend caps and agent takeover: no mechanism at all |
 * | `no_human_surface` | the kill switch route exists and no UI calls it |
 *
 * ## What this module does NOT do
 *
 * It does not enforce anything, and it is not an authorization source. `requiredPermission` and
 * `approverRequirement` are **specification data**: what the design says should gate a change.
 * `ApproverRequirement.separationEnforcedInCode` is typed as the literal `false`, so the type
 * itself refuses to let a spec claim that requester-is-not-approver is enforced — because in this
 * repo it is not. `approval-and-change-policy.md:36` states the policy; no route implements it, and
 * `MANAGER_AUTHORIZATION_MAP.md` records that everything collapses to a single `requireAdmin` bit.
 * A future author who wants to claim otherwise must change the type, which is a visible diff.
 *
 * ## Shape safety, scoped
 *
 * Every `JSON.parse`-producible value in the `policies` argument, its elements, and their nested
 * fields is refused rather than thrown on — `CONTROL_SPEC_MALFORMED`. That bound is the one P4-T1
 * took eight gradings to state accurately, so it is stated narrowly here and proven by a generator
 * whose keyspace and leaf values are derived from this file. A throwing accessor and
 * `Object.create(null)` are out of scope: `JSON.parse` cannot produce them.
 *
 * NO DATABASE, no I/O, pure functions. `ValidationIssue` is reused from `factoryValidate` so a
 * consumer can concatenate these with the others and render one list.
 */

import type { ValidationIssue } from '../../factory/factoryValidate';

/** How a control's value is typed. */
export type ControlValueType =
  | 'boolean'
  | 'integer'
  | 'duration_minutes'
  | 'enum'
  | 'money_minor_units';

/** Layers that really do enforce something in this repo. See the header table. */
export type ControlEnforcementKind =
  | 'system_setting_checked'
  | 'persisted_column_checked'
  | 'route_permission'
  | 'in_memory_only'
  | 'hardcoded_constant';

/** Why a control is NOT enforced. Every member names a measured state in this repo. */
export type UnavailableReason =
  | 'no_enforcement_site'
  | 'prompt_text_only'
  | 'verdict_discarded'
  | 'shadow_mode_only'
  | 'not_implemented'
  | 'no_human_surface';

/**
 * Enforced, with a NAMED call site, or unavailable with a reason. There is no third state and no
 * default: a control whose enforcement nobody has established is `unavailable`, not assumed.
 */
export type ControlEnforcement =
  | { status: 'enforced'; enforcedBy: ControlEnforcementKind; callSite: string }
  | { status: 'unavailable'; why: UnavailableReason };

/**
 * Who must approve a change to this control.
 *
 * `separationEnforcedInCode` is the literal `false` on purpose. §4.6 requires that "the proposer
 * cannot fabricate the approver", and `approval-and-change-policy.md:36` states it as policy — but
 * no route in this repo enforces requester-is-not-approver. The type therefore makes the honest
 * answer the only expressible one.
 */
export interface ApproverRequirement {
  required: boolean;
  /** Role that must approve. `null` is only legal when `required` is false. */
  approverRoleId: string | null;
  separationEnforcedInCode: false;
}

/** One manager control, with the complete §4.5 tuple. */
export interface ControlPolicy {
  policyKey: string;
  valueType: ControlValueType;
  value: unknown;
  /** `null` means unbounded, which is legal and must be declared rather than left absent. */
  allowedRange: { min: number; max: number } | { oneOf: ReadonlyArray<string> } | null;
  requiredPermission: string;
  approverRequirement: ApproverRequirement;
  version: number;
  /** ISO-8601. When the control takes effect; §4.5's "effective time". */
  effectiveAt: string;
  /** §4.5's "preview/diff": can a human see what a change would do before committing it? */
  previewDiff: boolean;
  enforcement: ControlEnforcement;
}

/** The codes this module adds. Each covers ONE concern — see P4-T1 on overloading. */
export const CONTROL_CODES = [
  'CONTROL_SPEC_MALFORMED',
  'CONTROL_KEY_DUPLICATE',
  'CONTROL_ENFORCEMENT_UNNAMED',
  'CONTROL_VALUE_TYPE_MISMATCH',
  'CONTROL_VALUE_OUT_OF_RANGE',
  'CONTROL_RANGE_SHAPE_MISMATCH',
  'CONTROL_PERMISSION_MISSING',
  'CONTROL_APPROVER_UNNAMED',
  'CONTROL_APPROVER_ROLE_UNKNOWN',
  'CONTROL_VERSION_INVALID',
  'CONTROL_EFFECTIVE_AT_INVALID',
  'CONTROL_PREVIEW_ABSENT',
] as const;
export type ControlCode = (typeof CONTROL_CODES)[number];

// Local one-line predicates rather than an import from `workspaceBindingChecks`: that module's
// public surface is already over CLAUDE.md's 12-symbol ceiling (a recorded P4-T1 residual), and
// coupling two generation modules to share two one-liners would make it worse.
const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const blank = (v: string): boolean => v.trim() === '';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

const err = (code: ControlCode, message: string, stepId?: string): ValidationIssue =>
  ({ code, message, stepId, severity: 'error' });

/** Describe a value without invoking user code. P4-T1 threw on `String()` here twice. */
const label = (v: unknown): string => {
  if (isStr(v)) return v;
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
};

const ENFORCEMENT_KINDS: ReadonlyArray<string> = [
  'system_setting_checked', 'persisted_column_checked', 'route_permission', 'in_memory_only',
  'hardcoded_constant',
];
const UNAVAILABLE_REASONS: ReadonlyArray<string> = [
  'no_enforcement_site', 'prompt_text_only', 'verdict_discarded', 'shadow_mode_only',
  'not_implemented', 'no_human_surface',
];
const VALUE_TYPES: ReadonlyArray<string> = [
  'boolean', 'integer', 'duration_minutes', 'enum', 'money_minor_units',
];

/**
 * Is this policy structurally usable? Returns a refusal, or `null` when the content rules can run
 * without throwing on anything `JSON.parse` can produce.
 */
function shapeIssue(p: ControlPolicy): ValidationIssue | null {
  if (!isObj(p)) {
    return err('CONTROL_SPEC_MALFORMED',
      `A policy entry is ${label(p)}, not an object. A dropped entry in a JSON array arrives `
      + 'exactly this way.');
  }
  const r = p as unknown as Record<string, unknown>;
  const at = isStr(r.policyKey) ? r.policyKey : undefined;
  const bad = (m: string) => err('CONTROL_SPEC_MALFORMED', m, at);

  if (!isStr(r.policyKey) || blank(r.policyKey)) return bad('A policy carries no usable policyKey.');
  for (const f of ['requiredPermission', 'effectiveAt'] as const) {
    if (!isStr(r[f])) return bad(`Policy ${r.policyKey} has a non-string ${f}.`);
  }
  if (typeof r.previewDiff !== 'boolean') {
    return bad(`Policy ${r.policyKey} has a non-boolean previewDiff.`);
  }
  if (typeof r.version !== 'number') {
    return bad(`Policy ${r.policyKey} has a non-numeric version.`);
  }
  if (!VALUE_TYPES.includes(r.valueType as string)) {
    return bad(`Policy ${r.policyKey} declares valueType "${label(r.valueType)}", which is not one `
      + `of ${VALUE_TYPES.join(', ')}.`);
  }
  if (r.allowedRange !== null && !isObj(r.allowedRange)) {
    return bad(`Policy ${r.policyKey} has an allowedRange that is neither null nor an object.`);
  }
  if (!isObj(r.approverRequirement)) {
    return bad(`Policy ${r.policyKey} carries no usable approverRequirement.`);
  }
  const a = r.approverRequirement;
  if (typeof a.required !== 'boolean') {
    return bad(`Policy ${r.policyKey} has a non-boolean approverRequirement.required.`);
  }
  if (a.approverRoleId !== null && !isStr(a.approverRoleId)) {
    return bad(`Policy ${r.policyKey} has an approverRoleId that is neither null nor a string.`);
  }
  if (a.separationEnforcedInCode !== false) {
    return bad(`Policy ${r.policyKey} sets separationEnforcedInCode to `
      + `"${label(a.separationEnforcedInCode)}". It must be false: no route in this repo enforces `
      + 'requester-is-not-approver, so a spec may not claim it does.');
  }
  if (!isObj(r.enforcement)) {
    return bad(`Policy ${r.policyKey} carries no usable enforcement.`);
  }
  const e = r.enforcement;
  if (e.status === 'enforced') {
    if (!ENFORCEMENT_KINDS.includes(e.enforcedBy as string)) {
      return bad(`Policy ${r.policyKey} claims enforcement by "${label(e.enforcedBy)}", which is `
        + 'not a layer this repo enforces at.');
    }
    return isStr(e.callSite) ? null
      : bad(`Policy ${r.policyKey} claims enforcement with a non-string callSite.`);
  }
  if (e.status === 'unavailable') {
    return UNAVAILABLE_REASONS.includes(e.why as string) ? null
      : bad(`Policy ${r.policyKey} is unavailable for reason "${label(e.why)}", which is not one of `
        + `${UNAVAILABLE_REASONS.join(', ')}.`);
  }
  return bad(`Policy ${r.policyKey} declares enforcement status "${label(e.status)}"; the only `
    + 'states are "enforced" and "unavailable". There is no third.');
}

/** Does the declared value match its declared type and range? */
function valueIssues(p: ControlPolicy): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const push = (c: ControlCode, m: string) => out.push(err(c, m, p.policyKey));
  const numeric = p.valueType === 'integer' || p.valueType === 'duration_minutes'
    || p.valueType === 'money_minor_units';

  if (p.valueType === 'boolean' && typeof p.value !== 'boolean') {
    push('CONTROL_VALUE_TYPE_MISMATCH',
      `Policy ${p.policyKey} is typed boolean but its value is ${label(p.value)}.`);
  }
  if (numeric && !isInt(p.value)) {
    push('CONTROL_VALUE_TYPE_MISMATCH',
      `Policy ${p.policyKey} is typed ${p.valueType} but its value is ${label(p.value)}.`);
  }
  if (p.valueType === 'enum' && !isStr(p.value)) {
    push('CONTROL_VALUE_TYPE_MISMATCH',
      `Policy ${p.policyKey} is typed enum but its value is ${label(p.value)}.`);
  }

  const range = p.allowedRange;
  if (range === null) return out;

  const isNumericRange = 'min' in range && 'max' in range;
  if (numeric && !isNumericRange) {
    push('CONTROL_RANGE_SHAPE_MISMATCH',
      `Policy ${p.policyKey} is numeric but its allowedRange is not a min/max.`);
  } else if (p.valueType === 'enum' && isNumericRange) {
    push('CONTROL_RANGE_SHAPE_MISMATCH',
      `Policy ${p.policyKey} is an enum but its allowedRange is a min/max.`);
  } else if (isNumericRange && isInt(p.value)) {
    const { min, max } = range as { min: number; max: number };
    if (!isInt(min) || !isInt(max)) {
      push('CONTROL_RANGE_SHAPE_MISMATCH',
        `Policy ${p.policyKey} has a non-integer bound in its allowedRange.`);
    } else if (p.value < min || p.value > max) {
      push('CONTROL_VALUE_OUT_OF_RANGE',
        `Policy ${p.policyKey} has value ${p.value}, outside its declared range ${min}..${max}.`);
    }
  } else if (!isNumericRange && isStr(p.value)) {
    const { oneOf } = range as { oneOf: ReadonlyArray<string> };
    if (!Array.isArray(oneOf) || !oneOf.every(isStr)) {
      push('CONTROL_RANGE_SHAPE_MISMATCH',
        `Policy ${p.policyKey} has an allowedRange.oneOf that is not a string array.`);
    } else if (!oneOf.includes(p.value)) {
      push('CONTROL_VALUE_OUT_OF_RANGE',
        `Policy ${p.policyKey} has value "${p.value}", which is not in its declared set.`);
    }
  }
  return out;
}

/** The remaining §4.5 requirements, once shape and value are sound. */
function tupleIssues(p: ControlPolicy, roleIds: ReadonlySet<string>): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const push = (c: ControlCode, m: string) => out.push(err(c, m, p.policyKey));

  // THE INTEGRITY RULE. A control with no named call site is not a control.
  if (p.enforcement.status === 'enforced' && blank(p.enforcement.callSite)) {
    push('CONTROL_ENFORCEMENT_UNNAMED',
      `Policy ${p.policyKey} claims to be enforced but names no call site. "We have a policy" and `
      + '"the policy is enforced" are different claims; without a site this is the second one '
      + 'asserted on the strength of the first. Mark it unavailable instead.');
  }
  if (blank(p.requiredPermission)) {
    push('CONTROL_PERMISSION_MISSING',
      `Policy ${p.policyKey} names no required permission, so anyone who reaches the surface can `
      + 'change it.');
  }
  if (p.approverRequirement.required && p.approverRequirement.approverRoleId === null) {
    push('CONTROL_APPROVER_UNNAMED',
      `Policy ${p.policyKey} requires approval but names no approver role. An approval with no `
      + 'nameable human behind it is what the approval ladders exist to refuse.');
  }
  const approver = p.approverRequirement.approverRoleId;
  if (approver !== null && !roleIds.has(approver)) {
    push('CONTROL_APPROVER_ROLE_UNKNOWN',
      `Policy ${p.policyKey} names approver role ${approver}, which the project does not declare.`);
  }
  if (!isInt(p.version) || p.version < 1) {
    push('CONTROL_VERSION_INVALID',
      `Policy ${p.policyKey} has version ${label(p.version)}; a version is a positive integer, and `
      + 'without one a change cannot be told from the state it replaced.');
  }
  if (blank(p.effectiveAt) || Number.isNaN(Date.parse(p.effectiveAt))) {
    push('CONTROL_EFFECTIVE_AT_INVALID',
      `Policy ${p.policyKey} has effectiveAt "${label(p.effectiveAt)}", which is not a parseable `
      + 'timestamp.');
  }
  // §4.5 requires preview/diff, so declaring false declares non-compliance rather than satisfying
  // the field — the same treatment P4-T1 gave `preservesNavigationState`.
  if (!p.previewDiff) {
    push('CONTROL_PREVIEW_ABSENT',
      `Policy ${p.policyKey} declares no preview/diff. §4.5 requires a human to see what a change `
      + 'would do before committing it.');
  }
  return out;
}

/** Validate a declared control specification against the roles the project declares. */
export function validateControlSpec(
  policies: ReadonlyArray<ControlPolicy>,
  roleIds: ReadonlySet<string> = new Set(),
): ValidationIssue[] {
  if (!Array.isArray(policies)) {
    return [err('CONTROL_SPEC_MALFORMED',
      `The policies argument is ${label(policies)}, not an array. Nothing can be validated against `
      + 'it, so this refuses rather than reporting an empty specification as compliant.')];
  }
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const p of policies) {
    const shape = shapeIssue(p);
    if (shape) { issues.push(shape); continue; }
    if (seen.has(p.policyKey)) {
      issues.push(err('CONTROL_KEY_DUPLICATE',
        `Policy key ${p.policyKey} is declared more than once; the later declaration would silently `
        + 'win.', p.policyKey));
      continue;
    }
    seen.add(p.policyKey);
    issues.push(...valueIssues(p));
    issues.push(...tupleIssues(p, roleIds));
  }
  return issues;
}

/**
 * What a human may be shown, and what must be labelled unavailable.
 *
 * The split §4.5 demands. A caller that renders `showable` and ignores `unavailable` is building
 * the production UI this module exists to argue against.
 */
export function renderControlAvailability(
  policies: ReadonlyArray<ControlPolicy>,
): {
    showable: Array<{ policyKey: string; enforcedBy: ControlEnforcementKind; callSite: string }>;
    unavailable: Array<{ policyKey: string; why: UnavailableReason }>;
  } {
  const showable: Array<{ policyKey: string; enforcedBy: ControlEnforcementKind; callSite: string }>
    = [];
  const unavailable: Array<{ policyKey: string; why: UnavailableReason }> = [];
  if (!Array.isArray(policies)) return { showable, unavailable };

  for (const p of policies) {
    if (shapeIssue(p) !== null) continue;
    if (p.enforcement.status === 'enforced' && !blank(p.enforcement.callSite)) {
      showable.push({
        policyKey: p.policyKey,
        enforcedBy: p.enforcement.enforcedBy,
        callSite: p.enforcement.callSite,
      });
    } else {
      unavailable.push({
        policyKey: p.policyKey,
        why: p.enforcement.status === 'unavailable' ? p.enforcement.why : 'no_enforcement_site',
      });
    }
  }
  return { showable, unavailable };
}

/**
 * Does this specification describe a control surface at all?
 *
 * True only when at least one control is genuinely enforced. A specification of entirely
 * unavailable controls is a description of nothing, and must not satisfy a "controls exist" gate —
 * which is why this is a predicate a caller can be made to consult rather than a count it can
 * misread. P4-T3 consumes it: the design brief populates `controls` only when this is true, so the
 * brief carries an open fact rather than an empty array that reads like "no controls needed".
 */
export function controlSurfaceExists(policies: ReadonlyArray<ControlPolicy>): boolean {
  if (!Array.isArray(policies)) return false;
  return policies.some((p) => shapeIssue(p) === null
    && p.enforcement.status === 'enforced'
    && !blank(p.enforcement.callSite));
}
