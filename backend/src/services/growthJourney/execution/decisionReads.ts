import { GrowthJourneyDecision } from '../../../models';
import type { ExecutionDecisionView } from './planChecks';

/**
 * The execution side's reads of the decision row (Phase 5 T510). READ-ONLY BY
 * CONTRACT: this module names the append-only decision model so that the
 * files that UPDATE receipts (the adapter, the approval, the reconciler)
 * never have to - the append-only guard forbids any update or destroy call in
 * a file that names `GrowthJourneyDecision`, and this split is what keeps that
 * guard meaningful rather than worked around. Nothing here writes anything;
 * a source pin in the adapter's test says so.
 */

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** The decision as the planner and the adapter read it - a view, never the model instance, never an address. */
export function decisionViewOf(row: GrowthJourneyDecision): ExecutionDecisionView {
  return {
    id: String(row.get('id')),
    tenant_id: String(row.get('tenant_id')),
    brand_id: String(row.get('brand_id')),
    program_id: (row.get('program_id') as string | null) ?? null,
    subject_ref: String(row.get('subject_ref')),
    lead_id: (row.get('lead_id') as number | null) ?? null,
    enrollment_id: (row.get('enrollment_id') as string | null) ?? null,
    mode: String(row.get('mode')),
    selected_action: (row.get('selected_action') as string | null) ?? null,
    selected_channel: (row.get('selected_channel') as string | null) ?? null,
    selected_content: asRecord(row.get('selected_content')),
    candidates: asArray(row.get('candidates')),
    suppressed: asArray(row.get('suppressed')),
    deferred_actions: asArray(row.get('deferred_actions')),
    reason: String(row.get('reason') ?? ''),
    created_at: new Date(row.get('created_at') as Date | string),
  };
}

export async function readDecisionView(decisionId: string): Promise<ExecutionDecisionView | null> {
  const row = await GrowthJourneyDecision.findOne({ where: { id: decisionId } });
  return row ? decisionViewOf(row) : null;
}
