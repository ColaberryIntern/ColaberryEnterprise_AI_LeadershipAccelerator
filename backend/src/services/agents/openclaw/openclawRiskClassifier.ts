/**
 * OpenClaw Risk Classifier -Phase 4
 *
 * Consolidates scattered auto-approve/human-execution/stage logic
 * into a single deterministic classifier.
 *
 * Pure function -no DB writes, no side effects.
 */

import {
  isHumanExecution,
  getStrategy,
  shouldAutoApprove,
  isPostCreationAllowed,
} from './openclawPlatformStrategy';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AutomationRisk = 'SAFE_AUTOMATION' | 'ASSISTED_AUTOMATION' | 'HUMAN_REQUIRED';

export interface RiskClassificationInput {
  platform: string;
  action_type: 'reply' | 'create_post' | 'follow_up' | 'dm_suggestion';
  conversation_stage: number;
  lead_score: number;
  intent_level: 'low' | 'medium' | 'high';
}

export interface RiskClassificationResult {
  risk: AutomationRisk;
  reasons: string[];
  auto_approve: boolean;
  requires_human_review: boolean;
}

// ─── Classifier ──────────────────────────────────────────────────────────────

/**
 * Classify the automation risk for a given action context.
 *
 * Priority order:
 * 1. HUMAN_REQUIRED -hard rules that cannot be overridden
 * 2. ASSISTED_AUTOMATION -needs human approval before execution
 * 3. SAFE_AUTOMATION -can execute automatically
 */
export function classifyAutomationRisk(
  input: RiskClassificationInput,
  configOverrides: string[] = [],
): RiskClassificationResult {
  const reasons: string[] = [];

  // ── HUMAN_REQUIRED checks (hard rules) ──────────────────────────────────

  // Rule 1: HUMAN_EXECUTION platforms ALWAYS require human
  if (isHumanExecution(input.platform)) {
    reasons.push(`Platform "${input.platform}" is HUMAN_EXECUTION -never automate`);
    return { risk: 'HUMAN_REQUIRED', reasons, auto_approve: false, requires_human_review: true };
  }

  // Rule 2: DM suggestions always require human
  if (input.action_type === 'dm_suggestion') {
    reasons.push('DM suggestions always require human review');
    return { risk: 'HUMAN_REQUIRED', reasons, auto_approve: false, requires_human_review: true };
  }

  // Rule 3: create_post blocked on PASSIVE_SIGNAL platforms
  if (input.action_type === 'create_post' && !isPostCreationAllowed(input.platform)) {
    reasons.push(`Post creation blocked on ${getStrategy(input.platform)} platform "${input.platform}"`);
    return { risk: 'HUMAN_REQUIRED', reasons, auto_approve: false, requires_human_review: true };
  }

  // Rule 4: Conversion-stage interactions (stage >= 5) always require human
  if (input.conversation_stage >= 5) {
    reasons.push(`Stage ${input.conversation_stage} is conversion territory -human review required`);
    return { risk: 'HUMAN_REQUIRED', reasons, auto_approve: false, requires_human_review: true };
  }

  // ── ASSISTED_AUTOMATION checks ──────────────────────────────────────────

  // Rule 5: High-value leads get human eyes
  if (input.lead_score >= 70) {
    reasons.push(`Lead score ${input.lead_score} is high-value -human review recommended`);
    return { risk: 'ASSISTED_AUTOMATION', reasons, auto_approve: false, requires_human_review: true };
  }

  // Rule 6: High intent at stage 3+ needs human judgment
  if (input.intent_level === 'high' && input.conversation_stage >= 3) {
    reasons.push(`High intent at stage ${input.conversation_stage} -human review recommended`);
    return { risk: 'ASSISTED_AUTOMATION', reasons, auto_approve: false, requires_human_review: true };
  }

  // ── SAFE_AUTOMATION ─────────────────────────────────────────────────────

  // Delegate to existing shouldAutoApprove logic for final check
  const canAutoApprove = shouldAutoApprove(input.platform, configOverrides);
  if (canAutoApprove) {
    reasons.push(`Platform "${input.platform}" passes auto-approve (${getStrategy(input.platform)})`);
    return { risk: 'SAFE_AUTOMATION', reasons, auto_approve: true, requires_human_review: false };
  }

  // Fallback: if shouldAutoApprove says no but we didn't hit HUMAN_REQUIRED rules,
  // this is an ASSISTED_AUTOMATION case (e.g., AUTHORITY_BROADCAST needing review)
  reasons.push(`Platform "${input.platform}" strategy ${getStrategy(input.platform)} requires review`);
  return { risk: 'ASSISTED_AUTOMATION', reasons, auto_approve: false, requires_human_review: true };
}
