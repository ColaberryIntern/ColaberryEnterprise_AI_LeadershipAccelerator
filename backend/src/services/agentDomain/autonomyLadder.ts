/**
 * The R0-R9 autonomy ladder, mapped PER CAPABILITY — never per agent.
 *
 * Run `20261007-school-agent-factory` (T06), session CC-20261006-a4k7.
 *
 * ## The naming collision, and why every stored value is namespaced
 *
 * The owner's ladder is R0-R9. This platform ALREADY uses bare `R0`-`R5` for something else
 * entirely: **risk tiers**. `modules/delivery/deliveryRiskLevels.ts:34` defines
 * `DeliveryRiskLevel = 'R0'|…|'R5'`, and its header states that R0-R4 "mean **exactly** what they
 * mean there — that is deliberate, so 'R3' is one concept across the platform", feeding
 * `maxRiskTier` in `workGraph/capabilityRegistry.ts:43`.
 *
 * In THAT vocabulary, `R3` means `schema_security_or_external_side_effect`.
 * In the owner's vocabulary, `R3` means "approved, user-initiated sandbox tool operations".
 *
 * A bare `R3` written into capability data could therefore be read as authorizing schema, security
 * or external side effects. That is a misread in the dangerous direction, so the owner's labels are
 * kept verbatim and every STORED value is namespaced `autonomy:R0` … `autonomy:R9`.
 *
 * ## The sink that fails OPEN
 *
 * An earlier version of this guard named only `DeliveryRiskLevel` and `maxRiskTier`. Both fail
 * **closed**: `deliveryRiskIndex()` (`deliveryRiskLevels.ts:61-65`) returns the HIGHEST rank for an
 * unrecognized value, on the stated reasoning that "returning 0 would make a typo look like a
 * read-only action".
 *
 * Two readers fail **open**, and they are the reason this guard exists:
 *   - `services/agentAutonomy.ts:82-86` `isHighRiskTier()` does `if (idx === -1) return false;`
 *     under the comment "malformed/unrecognized tier -> safe default, not forced approval". That is
 *     safe only against *forcing* approval. An unrecognized value reads as NOT high risk and
 *     **skips the human-approval requirement**.
 *   - `services/workGraph/capabilityRouter.ts:28-30` `riskTierIndex()` returns **0** for an
 *     unrecognized tier and feeds `riskTierAllowed()` as a dispatch gate, so an unrecognized value
 *     clears EVERY `maxRiskTier` ceiling as though it were read-only. Worse than skipping approval.
 *
 * Their inputs are plain `string` columns, so a type-scoped guard cannot see them. The guard is
 * therefore COLUMN-scoped, and its test DISCOVERS the columns from the models rather than
 * hardcoding a list — hardcoding is how the enumeration went stale the first time.
 */

/** The owner's ten levels, labels verbatim. */
export const AUTONOMY_LEVELS = [
  'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9',
] as const;

export type AutonomyLevel = typeof AUTONOMY_LEVELS[number];

/** The namespace prefix. A bare `R<n>` is never a valid stored value. */
export const AUTONOMY_NAMESPACE = 'autonomy:';

export type AutonomyStage = `autonomy:${AutonomyLevel}`;

export const AUTONOMY_STAGES: ReadonlyArray<AutonomyStage> =
  AUTONOMY_LEVELS.map((l) => `${AUTONOMY_NAMESPACE}${l}` as AutonomyStage);

/** What each level means, in the owner's words. */
export const AUTONOMY_MEANINGS: Readonly<Record<AutonomyLevel, string>> = Object.freeze({
  R0: 'Define the workflow, requirements, risks and human decisions.',
  R1: 'Prepare isolated development, fixtures and baseline tests.',
  R2: 'Answer questions using approved knowledge and records.',
  R3: 'Perform approved, user-initiated sandbox tool operations.',
  R4: 'Execute and verify stateful, multi-step sandbox tasks.',
  R5: 'Evaluate in shadow mode against approved reference outcomes.',
  R6: 'Conduct a separately approved, supervised production pilot.',
  R7: 'Automate only explicitly authorized action classes within limits.',
  R8: 'Coordinate necessary, authorized handoffs with other agents.',
  R9: 'Demonstrate reliable operation, monitoring, recovery and ownership.',
});

/**
 * Columns that carry a platform RISK tier. An autonomy value must never reach one of these.
 * Discovered from the models and asserted by the test, not trusted from this list — the list is
 * the documented expectation, and the test is what keeps it true.
 */
export const RISK_TIER_BEARING_MODELS: ReadonlyArray<string> = [
  'ApprovalRequest',
  'IntelligenceDecision',
  'ReeseOutreach',
  'Ticket',
  'TicketWorkUnit',
  'WorkLedgerEvent',
];

/** The column name the six models above carry, and the one an autonomy value must never reach. */
export const RISK_TIER_COLUMN = 'risk_tier';

/**
 * Error thrown when an autonomy value is routed at a risk-tier column.
 *
 * A stable `error_class` string, per CLAUDE.md's Error classification rule, because a generic
 * `Error` in the logs would be indistinguishable from anything else going wrong.
 */
export class AutonomyInRiskTierColumnError extends Error {
  readonly error_class = 'AutonomyInRiskTierColumnError';

  constructor(model: string, column: string, value: unknown) {
    super(
      `AutonomyInRiskTierColumnError: refusing to write '${String(value)}' to ${model}.${column}. `
      + 'That column carries the platform RISK ladder (deliveryRiskLevels.ts), where R0-R5 mean '
      + 'something else entirely. Both risk sinks fail OPEN on a value they do not recognise: '
      + 'agentAutonomy.isHighRiskTier() returns false, so the approval is skipped, and '
      + 'workGraph/capabilityRouter.riskTierIndex() returns 0, so every maxRiskTier ceiling is '
      + 'cleared. An autonomy value here removes two guards silently.',
    );
    this.name = 'AutonomyInRiskTierColumnError';
  }
}

/**
 * Refuses an autonomy value destined for a risk-tier column. THE enforcement point for
 * `RISK_TIER_BEARING_MODELS`, which was previously a list nothing consulted.
 *
 * Deliberately refuses BOTH the namespaced form (`autonomy:R7`) and the bare one (`R7`). The bare
 * form is the dangerous one, because it is lexically valid in the risk vocabulary for R0-R5 and
 * would be accepted without complaint.
 */
export function assertNoAutonomyInRiskTierColumn(
  model: string, column: string, value: unknown,
): void {
  if (column !== RISK_TIER_COLUMN) return;
  if (isAutonomyStage(value) || isBareAutonomyLevel(value)) {
    throw new AutonomyInRiskTierColumnError(model, column, value);
  }
}

export function isAutonomyStage(value: unknown): value is AutonomyStage {
  return typeof value === 'string'
    && (AUTONOMY_STAGES as ReadonlyArray<string>).includes(value);
}

/** A bare `R3` is exactly the value that must never be stored. */
export function isBareAutonomyLevel(value: unknown): boolean {
  return typeof value === 'string' && /^R[0-9]$/.test(value);
}

export function autonomyIndex(stage: AutonomyStage): number {
  return AUTONOMY_STAGES.indexOf(stage);
}

export type NotApplicable = { readonly not_applicable: true; readonly reason: string };

export type CapabilityAutonomy = AutonomyStage | NotApplicable;

/** `not_applicable` is permitted ONLY with a recorded reason. A reasonless one is invalid. */
export function isValidCapabilityAutonomy(v: unknown): boolean {
  if (isAutonomyStage(v)) return true;
  // Narrowed through a structural type rather than `as any`. The three casts that were here were
  // undocumented, which CLAUDE.md forbids, and unnecessary: this is exactly what `unknown` plus a
  // shape is for.
  const o = v as { not_applicable?: unknown; reason?: unknown } | null | undefined;
  if (o && typeof o === 'object' && o.not_applicable === true) {
    return typeof o.reason === 'string' && o.reason.trim().length > 0;
  }
  return false;
}

export interface CapabilityAuthorityInput {
  readonly capability_id: string;
  /** The level a HUMAN has approved for this capability. Never inferred from behaviour. */
  readonly approved_autonomy: CapabilityAutonomy;
  readonly max_permitted_autonomy: CapabilityAutonomy;
  /** Tool grants actually held, by environment. An empty list authorizes nothing. */
  readonly granted_tools: ReadonlyArray<string>;
  readonly environment: 'sandbox' | 'production';
  /** True when a human must make the decision, at every level, forever. */
  readonly human_decision: boolean;
}

export interface EffectiveAuthority {
  readonly capability_id: string;
  readonly effective_autonomy: AutonomyStage | null;
  readonly reasons: ReadonlyArray<string>;
}

/**
 * Effective authority for ONE capability, computed from THAT capability's own approved level, its
 * tool grants, its environment and whether the decision is human-required.
 *
 * **It never consults any other capability.** That is the whole contract: one capability reaching
 * `autonomy:R7` must not raise another capability's authority, and must not raise the agent's. An
 * implementation that took a maximum over the domain would be the defect this function exists to
 * prevent, and a test constructs exactly that scenario.
 */
export function effectiveAuthority(input: CapabilityAuthorityInput): EffectiveAuthority {
  const reasons: string[] = [];

  if (!isAutonomyStage(input.approved_autonomy)) {
    reasons.push('no_approved_autonomy');
    return { capability_id: input.capability_id, effective_autonomy: null, reasons };
  }

  let level: AutonomyStage = input.approved_autonomy;

  // A ceiling can only ever LOWER the result.
  if (isAutonomyStage(input.max_permitted_autonomy)
      && autonomyIndex(input.max_permitted_autonomy) < autonomyIndex(level)) {
    level = input.max_permitted_autonomy;
    reasons.push('capped_by_max_permitted');
  }

  // Production is never reached by approval alone: a pilot (R6) is separately approved.
  if (input.environment === 'production' && autonomyIndex(level) >= autonomyIndex('autonomy:R6')) {
    reasons.push('production_requires_separate_pilot_approval');
  }

  // No tool grants means nothing beyond answering from approved knowledge.
  if (input.granted_tools.length === 0 && autonomyIndex(level) > autonomyIndex('autonomy:R2')) {
    level = 'autonomy:R2';
    reasons.push('no_tool_grants');
  }

  // A human-required decision stays human-required at EVERY level. It is never automated.
  if (input.human_decision) {
    reasons.push('human_decision_required_at_every_level');
    if (autonomyIndex(level) > autonomyIndex('autonomy:R5')) {
      level = 'autonomy:R5';
      reasons.push('capped_below_automation_because_human_decision');
    }
  }

  return { capability_id: input.capability_id, effective_autonomy: level, reasons };
}

/**
 * Convenience for a whole domain. Maps each capability independently; it is deliberately NOT a
 * reduce, so there is no shape in which one capability's level can influence another's.
 */
export function effectiveAuthorityForDomain(
  capabilities: ReadonlyArray<CapabilityAuthorityInput>,
): EffectiveAuthority[] {
  return capabilities.map((c) => effectiveAuthority(c));
}
