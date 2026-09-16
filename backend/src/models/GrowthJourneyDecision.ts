import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyDecision — one governed next-action decision for one subject in
 * one brand (§6.1 `growth_journey_decisions`; §7.3 "one Governor arbitration
 * point"; Phase 3 T301).
 *
 * ─── WHY NOT `explorer_journey_decisions` ───────────────────────────────────
 *
 * That table's `enrollment_id` is NOT NULL with a foreign key to `enrollments`,
 * so a Colaberry Business or AI Flotation subject — who has no curriculum
 * enrolment — physically cannot be recorded there. Its key is also
 * `(enrollment_id, decision_date)`, one decision per learner per calendar day,
 * which cannot express one decision per subject PER BRAND. Explorer keeps
 * writing its own table, unchanged; this is the generic one.
 *
 * ─── APPEND-ONLY ────────────────────────────────────────────────────────────
 *
 * No `updated_at`. A re-decision is a new row; `idempotency_key` is unique, so
 * a replayed run lands on the existing row rather than a second one. The
 * outcome of an action is a later row or an execution receipt, never an edit.
 *
 * ─── EVERY §7.3 FIELD, INCLUDING THE ONES WITH NO SOURCE ────────────────────
 *
 * §7.3 requires a decision to record all candidates, eligibility and policy
 * results, score/state evidence, content and brand eligibility, recent contacts
 * and cooldowns, human conversation status, sales capacity, the selected action,
 * every suppressed action with its reason, ruleset and model versions, whether
 * AI participated, and an execution receipt. Two of those have no source in
 * this codebase — there is no table that says whether a human is already in
 * conversation with someone, and none at all for sales capacity — so
 * `human_conversation` and `sales_capacity` default to `'unknown'` and the
 * decision says so. `'unknown'` never unlocks an action: it suppresses the
 * candidates that would need the answer.
 *
 * `executed` is false and `execution_receipt` is null for the whole of Phase 3.
 * Nothing in this phase can act on a person.
 */

export type GrowthJourneyDecisionMode = 'shadow' | 'live';
export type GrowthJourneyHumanConversation = 'yes' | 'no' | 'unknown';
export type GrowthJourneySalesCapacity = 'available' | 'full' | 'unknown';

export interface GrowthJourneyDecisionAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  program_id?: string | null;
  subject_ref: string;
  lead_id?: number | null;
  enrollment_id?: string | null;
  classification_id?: string | null;
  trigger: string;
  decision_date: string;
  mode: GrowthJourneyDecisionMode;
  selected_action?: string | null;
  selected_path?: string | null;
  selected_channel?: string | null;
  selected_content?: Record<string, unknown> | null;
  candidates?: unknown[];
  suppressed?: unknown[];
  deferred_actions?: unknown[];
  eligibility?: Record<string, unknown> | null;
  scores?: Record<string, unknown> | null;
  score_gaps?: string[];
  state_at_decision?: string | null;
  overlays_at_decision?: string[];
  contact_evidence?: Record<string, unknown> | null;
  human_conversation?: GrowthJourneyHumanConversation;
  sales_capacity?: GrowthJourneySalesCapacity;
  content_gaps?: string[];
  reason: string;
  requires_human_review?: boolean;
  ai_involved?: boolean;
  model_version?: string | null;
  ruleset_version: string;
  executed?: boolean;
  execution_receipt?: Record<string, unknown> | null;
  decided_by: string;
  idempotency_key: string;
  created_at?: Date;
}

class GrowthJourneyDecision
  extends Model<GrowthJourneyDecisionAttributes>
  implements GrowthJourneyDecisionAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare program_id: string | null;
  declare subject_ref: string;
  declare lead_id: number | null;
  declare enrollment_id: string | null;
  declare classification_id: string | null;
  declare trigger: string;
  declare decision_date: string;
  declare mode: GrowthJourneyDecisionMode;
  declare selected_action: string | null;
  declare selected_path: string | null;
  declare selected_channel: string | null;
  declare selected_content: Record<string, unknown> | null;
  declare candidates: unknown[];
  declare suppressed: unknown[];
  declare deferred_actions: unknown[];
  declare eligibility: Record<string, unknown> | null;
  declare scores: Record<string, unknown> | null;
  declare score_gaps: string[];
  declare state_at_decision: string | null;
  declare overlays_at_decision: string[];
  declare contact_evidence: Record<string, unknown> | null;
  declare human_conversation: GrowthJourneyHumanConversation;
  declare sales_capacity: GrowthJourneySalesCapacity;
  declare content_gaps: string[];
  declare reason: string;
  declare requires_human_review: boolean;
  declare ai_involved: boolean;
  declare model_version: string | null;
  declare ruleset_version: string;
  declare executed: boolean;
  declare execution_receipt: Record<string, unknown> | null;
  declare decided_by: string;
  declare idempotency_key: string;
  declare created_at: Date;
}

GrowthJourneyDecision.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    program_id: { type: DataTypes.UUID, allowNull: true },
    subject_ref: { type: DataTypes.STRING(128), allowNull: false },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    classification_id: { type: DataTypes.UUID, allowNull: true },
    trigger: { type: DataTypes.STRING(32), allowNull: false },
    decision_date: { type: DataTypes.DATEONLY, allowNull: false },
    mode: { type: DataTypes.STRING(16), allowNull: false },
    selected_action: { type: DataTypes.STRING(48), allowNull: true },
    selected_path: { type: DataTypes.STRING(64), allowNull: true },
    selected_channel: { type: DataTypes.STRING(16), allowNull: true },
    selected_content: { type: DataTypes.JSONB, allowNull: true },
    candidates: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    suppressed: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    deferred_actions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    eligibility: { type: DataTypes.JSONB, allowNull: true },
    scores: { type: DataTypes.JSONB, allowNull: true },
    score_gaps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    state_at_decision: { type: DataTypes.STRING(48), allowNull: true },
    overlays_at_decision: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    contact_evidence: { type: DataTypes.JSONB, allowNull: true },
    human_conversation: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'unknown' },
    sales_capacity: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'unknown' },
    content_gaps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    reason: { type: DataTypes.TEXT, allowNull: false },
    requires_human_review: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ai_involved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    model_version: { type: DataTypes.STRING(64), allowNull: true },
    ruleset_version: { type: DataTypes.STRING(32), allowNull: false },
    executed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    execution_receipt: { type: DataTypes.JSONB, allowNull: true },
    decided_by: { type: DataTypes.TEXT, allowNull: false },
    idempotency_key: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    sequelize,
    tableName: 'growth_journey_decisions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        name: 'growth_journey_decisions_idempotency_unique',
        fields: ['idempotency_key'],
      },
    ],
  },
);

export default GrowthJourneyDecision;
