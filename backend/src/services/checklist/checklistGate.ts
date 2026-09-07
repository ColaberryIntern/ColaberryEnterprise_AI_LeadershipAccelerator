import { ChecklistItemDefinition } from './checklistDefinitions';

/**
 * checklistGate — Reese Agentic AI Employee mission, Capability 6's "block
 * material actions when incomplete... every bypass requires an authorized
 * actor, reason, timestamp, and audit event." PURE, no I/O — modeled on this
 * repo's own capacityOverride.ts (delivery/capacityOverride.ts), the closest
 * real precedent for "named actor + reason with a real minimum quality bar
 * + mandatory audit" found during discovery.
 */

export interface ChecklistCompletionResult {
  complete: boolean;
  /** Every incomplete item, required or not — for honest display. */
  incompleteItems: string[];
  /** The subset of incompleteItems that actually gates `complete`. */
  incompleteRequiredItems: string[];
}

/** Pure. `complete` gates only on required items — see checklistDefinitions.ts's
 * own header for why non-required items never block. */
export function evaluateChecklistCompletion(
  items: Record<string, boolean>,
  definitions: ChecklistItemDefinition[],
): ChecklistCompletionResult {
  const incompleteItems = definitions.filter((d) => !items[d.key]).map((d) => d.key);
  const incompleteRequiredItems = definitions.filter((d) => d.required && !items[d.key]).map((d) => d.key);
  return { complete: incompleteRequiredItems.length === 0, incompleteItems, incompleteRequiredItems };
}

const MIN_BYPASS_REASON_LENGTH = 20;

export interface ChecklistBypassRequest {
  authorizedByEmail: string;
  reason: string;
  now: Date;
}

export interface ChecklistBypassRefusal {
  rule: string;
  detail: string;
}

export type ChecklistBypassDecision =
  | { granted: true; reason: string; authorizedByEmail: string; bypassedAt: Date; auditRequired: true }
  | { granted: false; refusals: ChecklistBypassRefusal[] };

/**
 * Evaluate a bypass request. `auditRequired` is `true` in the type itself
 * rather than a boolean the caller computes — same reasoning as
 * capacityOverride.ts's OverrideDecision: a bypass that is not audited did
 * not happen, and an unconditional flag means no call site can accidentally
 * skip it.
 */
export function decideChecklistBypass(request: ChecklistBypassRequest): ChecklistBypassDecision {
  const refusals: ChecklistBypassRefusal[] = [];
  const add = (rule: string, detail: string) => refusals.push({ rule, detail });

  if (!request.authorizedByEmail) {
    add('authorizer_unknown', 'A bypass must record who authorized it.');
  }
  if (!request.reason || request.reason.trim().length < MIN_BYPASS_REASON_LENGTH) {
    add('reason_insufficient', 'A bypass needs a reason a reviewer could evaluate months later, not a placeholder.');
  }

  if (refusals.length > 0) return { granted: false, refusals };

  return {
    granted: true,
    reason: request.reason.trim(),
    authorizedByEmail: request.authorizedByEmail,
    bypassedAt: request.now,
    auditRequired: true,
  };
}

/** Is this checklist instance authorized to be acted on right now — either
 * genuinely complete, or explicitly bypassed by a real, audited decision? */
export function isChecklistSatisfied(instance: { complete: boolean; bypassedAt: Date | null }): boolean {
  return instance.complete || instance.bypassedAt !== null;
}
