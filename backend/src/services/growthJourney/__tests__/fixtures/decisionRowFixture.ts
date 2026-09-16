/**
 * One `growth_journey_decisions` row exactly as `decisionService.ts`'s
 * `decisionRow` writes it — every column, the JSONB records in their stored
 * shapes. Shared by the Why unit test and the route access test so both drive
 * the view over the real record. A plain `.ts` under `fixtures/`: importable
 * without being collected, and outside the trees the source guards walk.
 */
import type { GrowthJourneyDecision } from '../../../../models';

export const DECISION_ID = '50000000-0000-4000-8000-000000000001';
export const KNOWN_EMAIL = 'sam.rivera@example.com'; // the subject's address: known to the test, absent from the row

const channel = (eligible: boolean, reason: string, evaluator: string) => ({
  eligible, reason, evaluator, last_contact_at: eligible ? '2026-09-13T15:00:00.000Z' : null, hours_since_last_contact: eligible ? 39 : null,
});

export const suppression = (i: number) => ({ action_type: `ACTION_${i}`, campaign_key: i % 2 ? `campaign_${i}` : null, reason: `suppressed_reason_${i}` });

export function storedRow(over: Partial<Record<string, unknown>> = {}): GrowthJourneyDecision {
  return {
    id: DECISION_ID,
    tenant_id: '10000000-0000-4000-8000-000000000002',
    brand_id: '20000000-0000-4000-8000-000000000003',
    program_id: '30000000-0000-4000-8000-000000000001',
    subject_ref: 'lead:501',
    lead_id: 501,
    enrollment_id: null,
    classification_id: '40000000-0000-4000-8000-000000000001',
    trigger: 'nightly',
    decision_date: '2026-09-15',
    mode: 'shadow',
    selected_action: 'SEND_EMAIL',
    selected_path: 'business_consulting',
    selected_channel: 'email',
    selected_content: { asset_type: 'capability_education', offer_family: 'consulting', assets: [] },
    candidates: [
      // Stored with the ranking fields the arbitration used; the view hands them through and never reads them.
      { action_type: 'SEND_EMAIL', campaign_key: 'capability_education', channel: 'email', priority_tier: 7, intra_tier_score: 40, rule_id: 'capabilityEducation', required_assets: [{ asset_type: 'capability_education', offer_family: 'consulting' }] },
      { action_type: 'IN_APP_NUDGE', campaign_key: null, channel: 'in_app', priority_tier: 9, intra_tier_score: 10, rule_id: 'inAppNudge', required_assets: [] },
    ],
    suppressed: [suppression(1), suppression(2), suppression(3), suppression(4)],
    deferred_actions: [{ would: 'reply_aware_sequence', reason: 'layer 3 is Phase 5', payload: { overlay: 'NO_RESPONSE' } }],
    eligibility: {
      program_status: 'draft',
      program_active: false,
      offer: { allowed: true, reason: 'allowed', brand_id: '20000000-0000-4000-8000-000000000003', offer_family: 'consulting', policy_id: 'pol-1', approved_content_ready: false },
      not_emitted: [{ generator: 'caseStudy', reason: 'state EXPLORING_SOLUTIONS without a recent contact' }],
      inputs_unavailable: ['appointments'],
    },
    scores: {
      dimensions: [
        { key: 'engagement', label: 'Engagement', value: 62, source: 'delivery_engagements', factors: [{ factor: 'opened', label: 'Opened', points: 20 }] },
        { key: 'budget_signal', label: 'Budget signal', value: null, source: 'none', factors: [] },
        { key: 'fit', label: 'Fit', value: 80, source: 'lead_fields', factors: [] },
      ],
      summary: null,
      available: true,
      computed_at: '2026-09-15T06:00:00.000Z',
    },
    score_gaps: ['budget_signal:no_source'],
    state_at_decision: 'EXPLORING_SOLUTIONS',
    overlays_at_decision: ['NO_RESPONSE'],
    contact_evidence: {
      channels: {
        email: channel(true, 'eligible', 'none'),
        sms: channel(false, 'no_consent_record', 'consent'),
        voice: channel(false, 'auto_dial_disabled', 'consent'),
        in_app: channel(true, 'eligible', 'none'),
      },
      recent_contact_count: 1,
      hours_since_last_contact: 39,
      human_conversation: 'unknown',
      human_conversation_reason: 'no source in this codebase: nothing records whether a human is in conversation',
      sales_capacity: 'unknown',
      sales_capacity_reason: 'no source in this codebase: there is no sales capacity or assignment table',
      failed_closed: false,
    },
    human_conversation: 'unknown',
    sales_capacity: 'unknown',
    content_gaps: ['content_purpose_unsupported:capability_education'],
    reason: 'selected: capabilityEducation',
    requires_human_review: false,
    ai_involved: false,
    model_version: null,
    ruleset_version: 'p3-business-v1',
    executed: false,
    execution_receipt: null,
    decided_by: 'governor:p3-business-v1',
    idempotency_key: 'k-1',
    created_at: new Date('2026-09-15T06:00:01Z'),
    ...over,
  } as unknown as GrowthJourneyDecision;
}
