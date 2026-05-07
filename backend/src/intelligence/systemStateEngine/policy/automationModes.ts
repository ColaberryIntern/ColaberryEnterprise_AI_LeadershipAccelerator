/**
 * automationModes — shared mode enum + helper extracted from
 * safeLearningGuardrails so multiple gates can reuse the same mode
 * vocabulary without coupling.
 *
 * Phase 12 §A.7.
 */

export type AutomationMode = 'autonomous' | 'supervised' | 'frozen';

/**
 * Standard interpretation of the mode for any decision-gating module.
 * - 'frozen' → never apply, return reject.
 * - 'supervised' → never apply automatically; queue for operator review.
 * - 'autonomous' → may apply when confidence is above the floor AND
 *   no other blocking conditions hold.
 */
export interface AutomationModeDecision {
  readonly action: 'apply' | 'queue_for_review' | 'reject';
  readonly reason: string;
  readonly mode: AutomationMode;
}

export function decideByMode(opts: {
  mode: AutomationMode;
  confidence: number;
  min_confidence_to_apply: number;
  reject_reason_if_frozen?: string;
  block_reasons?: ReadonlyArray<string>;
}): AutomationModeDecision {
  if (opts.mode === 'frozen') {
    return { action: 'reject', reason: opts.reject_reason_if_frozen || 'Mode frozen.', mode: 'frozen' };
  }
  if (opts.block_reasons && opts.block_reasons.length > 0) {
    return { action: 'queue_for_review', reason: opts.block_reasons.join('; '), mode: opts.mode };
  }
  if (opts.confidence < opts.min_confidence_to_apply) {
    return { action: 'queue_for_review', reason: `Confidence ${opts.confidence} below floor ${opts.min_confidence_to_apply}.`, mode: opts.mode };
  }
  if (opts.mode === 'supervised') {
    return { action: 'queue_for_review', reason: 'Supervised mode requires operator approval.', mode: 'supervised' };
  }
  return { action: 'apply', reason: `Confidence ${opts.confidence} ≥ ${opts.min_confidence_to_apply}; mode autonomous.`, mode: 'autonomous' };
}
