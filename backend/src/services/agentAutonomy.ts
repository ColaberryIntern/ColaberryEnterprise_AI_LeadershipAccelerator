/**
 * agentAutonomy — the ABAC autonomy MODEL (TBI audit P2-1, design: docs/ai-governance/abac-design.md §3).
 *
 * Pure, dependency-free policy: the 4-rung autonomy ladder, how the existing permission tiers map
 * onto it, which action categories each rung may perform, and the HITL "always needs a human"
 * rules. No DB, no services — so it's trivially testable and importable anywhere without cycles.
 *
 * The authorization SERVICE (agentAuthorizationService) composes this with live state (kill switch,
 * registry, consent) into the actual gate. This file is just the rules.
 */

export type AutonomyLevel = 'observe' | 'suggest' | 'act_audited' | 'communicate';
export type ActionCategory = 'read' | 'propose' | 'write' | 'communicate' | 'agent_lifecycle';

/** Least → most privileged. A level's index is its rank. */
export const AUTONOMY_ORDER: AutonomyLevel[] = ['observe', 'suggest', 'act_audited', 'communicate'];

/** Map the existing agentPermissionService tiers onto the ladder (string-keyed to avoid an import cycle). */
const TIER_TO_LEVEL: Record<string, AutonomyLevel> = {
  read_only: 'observe',
  suggest_only: 'suggest',
  write_with_audit: 'act_audited',
  communication: 'communicate',
};

/** Derive an agent's autonomy level from its permission tier. Unknown → observe (fail-closed). */
export function levelForTier(tier: string | null | undefined): AutonomyLevel {
  return (tier && TIER_TO_LEVEL[tier]) || 'observe';
}

/** Which action categories each rung may perform (cumulative up the ladder). */
const LEVEL_CAPS: Record<AutonomyLevel, ActionCategory[]> = {
  observe: ['read'],
  suggest: ['read', 'propose'],
  act_audited: ['read', 'propose', 'write', 'agent_lifecycle'],
  communicate: ['read', 'propose', 'write', 'agent_lifecycle', 'communicate'],
};

// Precise outbound-comm tokens — deliberately NOT a bare 'send'/'post' substring, so internal writes
// like `retry_failed_send` or `post_repair_retest` are correctly classified as 'write', not 'communicate'.
const COMMUNICATE_HINTS = ['send_', 'synthflow', 'voice_call', 'place_call', 'make_call', 'social_post', 'publish_post', 'broadcast', 'send_dm'];
const LIFECYCLE_HINTS = ['create_agent', 'activate', 'deactivate', 'retire', 'register_agent', 'agent_lifecycle'];
const READ_HINTS = ['read', 'scan', 'monitor', 'analyze', 'analyse', 'get_', 'list_', 'fetch', 'detect', 'evaluate', 'qa_test', 'report'];

/** Classify a free-form action string into a category. Defaults to 'write' (a state mutation). */
export function actionCategory(action: string): ActionCategory {
  const a = (action || '').toLowerCase();
  if (a.includes('propose')) return 'propose';
  if (LIFECYCLE_HINTS.some((h) => a.includes(h))) return 'agent_lifecycle';
  if (COMMUNICATE_HINTS.some((h) => a.includes(h))) return 'communicate';
  if (READ_HINTS.some((h) => a.includes(h))) return 'read';
  return 'write';
}

/** Does this agent's level permit this action? */
export function levelAllowsAction(level: AutonomyLevel, action: string): boolean {
  return LEVEL_CAPS[level].includes(actionCategory(action));
}

export interface ActionContext {
  resourceType?: string | null;
  isNewLead?: boolean; // first-ever contact to this lead
  campaignAgeHours?: number | null; // age of the campaign this action targets
  // ProofDesk Milestone 4 (Governance Enforcement, shadow mode): the ProofDesk
  // per-action R0-R4 risk tier (already on tickets.risk_tier / work_ledger_events.risk_tier
  // since Milestone 1), reconciled here into the pre-existing 4-level autonomy ladder
  // rather than a second, competing governance model. Optional and additive - every
  // existing caller of actionRequiresApproval() that doesn't pass this (realtimeSyncEngine,
  // legacyErpIntegrationAgent) is completely unaffected.
  riskTier?: string | null;
}

// R0 (lowest) .. R4 (highest), same order/convention as
// workGraph/capabilityRouter.ts's RISK_TIER_ORDER - kept in sync deliberately so "R3/R4"
// means the same thing on both the dispatch-eligibility gate (capabilityRouter) and the
// HITL-approval gate (here). An unknown/malformed tier is treated as index 0 (R0, the
// safe/lowest tier) - the exact same fail-safe convention capabilityRouter.ts's own
// riskTierIndex() already uses, so this introduces no new failure mode.
const RISK_TIER_ORDER = ['R0', 'R1', 'R2', 'R3', 'R4'];
const HIGH_RISK_TIER_FLOOR_INDEX = RISK_TIER_ORDER.indexOf('R3'); // R3 and R4 both qualify

function isHighRiskTier(riskTier: string | null | undefined): boolean {
  if (!riskTier) return false;
  const idx = RISK_TIER_ORDER.indexOf(riskTier);
  if (idx === -1) return false; // malformed/unrecognized tier -> safe default, not forced approval
  return idx >= HIGH_RISK_TIER_FLOOR_INDEX;
}

export interface ApprovalDecision {
  required: boolean;
  rule?: string;
}

/**
 * The HITL "always needs a human yes" rules (§5 Q2 — Ali's set):
 *  1. public social posts, 2. agent creation/activation,
 *  3. first send to a brand-new (un-contacted) lead, 4. anything in a campaign's first 24h.
 */
export function actionRequiresApproval(action: string, ctx: ActionContext = {}): ApprovalDecision {
  const cat = actionCategory(action);
  const a = (action || '').toLowerCase();

  // ProofDesk Milestone 4 (Governance Enforcement, shadow mode): R3/R4 risk-tier
  // actions ALWAYS require approval, independent of the acting agent's own ladder
  // level or action category - checked first, ahead of every other rule, since a
  // high-risk-tier action needs a human regardless of what category it happens to
  // classify as. Malformed/unrecognized risk tiers never trigger this (isHighRiskTier's
  // safe-default), so a bad string can only ever fail OPEN here, never crash the caller
  // and never falsely force an approval that wasn't warranted.
  if (isHighRiskTier(ctx.riskTier)) {
    return { required: true, rule: 'high_risk_tier' };
  }

  // High-stakes legacy ERP writes (VA financial/procurement/asset systems) are always
  // held for a human — REQ-003 approval gate + TBI "AI proposes, human approves".
  if (a.includes('erp_data_push') || ctx.resourceType === 'legacy_erp_module') {
    return { required: true, rule: 'erp_write' };
  }

  if (cat === 'agent_lifecycle') return { required: true, rule: 'agent_lifecycle' };

  const isSocial = ctx.resourceType === 'social' || a.includes('social') || a.includes('publish');
  if (cat === 'communicate' && isSocial) return { required: true, rule: 'public_social_post' };

  if (cat === 'communicate' && ctx.isNewLead === true) return { required: true, rule: 'first_touch_new_lead' };

  if (
    (cat === 'communicate' || cat === 'write') &&
    ctx.campaignAgeHours != null &&
    ctx.campaignAgeHours < 24
  ) {
    return { required: true, rule: 'campaign_first_24h' };
  }

  return { required: false };
}
