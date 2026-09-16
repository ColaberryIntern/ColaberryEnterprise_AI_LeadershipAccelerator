import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyHandoff — the AI-to-human task (§6.1 `growth_journey_handoffs`;
 * §9 the evidence packet; §11 the five assignment paths; Phase 4 T401).
 *
 * ─── THE ONE MUTABLE ROW A HUMAN OWNS ───────────────────────────────────────
 *
 * A task changes state — queued, assigned, accepted, dispositioned, returned
 * to the AI, expired, cancelled — so this table carries `updated_at` and its
 * writer is allowed to `.update(`. That is why `GrowthJourneyHandoff` is NOT
 * in the append-only guard's model pattern, and why the services that update
 * it take the decision row as an argument rather than importing the
 * append-only `GrowthJourneyDecision` model: the guard stays as strict as it
 * is. Every state change is also an `event_ledger` row, so mutation does not
 * cost the history.
 *
 * ─── NOT A SECOND TASK SYSTEM ───────────────────────────────────────────────
 *
 * The human's to-do is a `tickets` row created through `ticketService`, and
 * `ticket_id` points at it. `assigned_to_type` / `assigned_to_id` are the
 * `tickets` vocabulary verbatim (`TicketActorType`, an id as a string) so a
 * handoff and its ticket never disagree about who owns it. `owner_queue` is a
 * policy string an operator maps to an assignee through
 * `growth_journey_policies` — `MGMT_ROLES` has no sales or solution-architect
 * role, and Phase 4 adds none.
 *
 * ─── NOTHING HERE CONTACTS OR NOTIFIES ANYONE ───────────────────────────────
 *
 * A handoff is a row a human reads in a queue. Alerting the human is Phase 5.
 * The `evidence` packet is built from stored rows and carries ids, counts,
 * timestamps and outcome types — never an address, a message body or a
 * transcript.
 */

export type GrowthJourneyOwnerQueue =
  | 'admissions'
  | 'sales'
  | 'solution_architect'
  | 'support'
  | 'ali'
  | 'human_review';

export type GrowthJourneyHandoffStatus =
  | 'queued'
  | 'assigned'
  | 'accepted'
  | 'dispositioned'
  | 'returned_to_ai'
  | 'expired'
  | 'cancelled';

export type GrowthJourneyHandoffDisposition =
  | 'qualified'
  | 'not_ready'
  | 'nurture'
  | 'no_contact'
  | 'disqualified'
  | 'converted';

export type GrowthJourneyHandoffPriority = 'critical' | 'high' | 'medium' | 'low';

export type GrowthJourneyHandoffSource = 'decision_deferral' | 'human_review' | 'reply_route' | 'manual';

/** The six queues, as the policy rows and the strategies name them. */
export const OWNER_QUEUES: readonly GrowthJourneyOwnerQueue[] = ['admissions', 'sales', 'solution_architect', 'support', 'ali', 'human_review'];

/** Statuses under which a subject is considered owned — the partial unique index's predicate. */
export const OPEN_HANDOFF_STATUSES: readonly GrowthJourneyHandoffStatus[] = ['queued', 'assigned', 'accepted'];

export interface GrowthJourneyReturnToAi {
  program_slug: string;
  cooldown_until: string;
  reason: string;
}

export interface GrowthJourneyHandoffAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  program_id?: string | null;
  subject_ref: string;
  lead_id?: number | null;
  enrollment_id?: string | null;
  decision_id?: string | null;
  organization_id?: string | null;
  owner_queue: GrowthJourneyOwnerQueue;
  assigned_to_type?: string | null;
  assigned_to_id?: string | null;
  ticket_id?: string | null;
  priority?: GrowthJourneyHandoffPriority;
  expected_value?: number | string | null;
  urgent?: boolean;
  reason: string;
  evidence: Record<string, unknown>;
  qualification_gaps?: string[];
  talking_points?: string[];
  best_channel?: string | null;
  consent_basis?: string | null;
  sla_due_at?: Date | null;
  status?: GrowthJourneyHandoffStatus;
  disposition?: GrowthJourneyHandoffDisposition | null;
  disposition_reason?: string | null;
  disposition_at?: Date | null;
  dispositioned_by?: string | null;
  return_to_ai?: GrowthJourneyReturnToAi | null;
  accepted_at?: Date | null;
  expired_at?: Date | null;
  source: GrowthJourneyHandoffSource;
  idempotency_key: string;
  created_at?: Date;
  updated_at?: Date;
}

class GrowthJourneyHandoff
  extends Model<GrowthJourneyHandoffAttributes>
  implements GrowthJourneyHandoffAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare program_id: string | null;
  declare subject_ref: string;
  declare lead_id: number | null;
  declare enrollment_id: string | null;
  declare decision_id: string | null;
  declare organization_id: string | null;
  declare owner_queue: GrowthJourneyOwnerQueue;
  declare assigned_to_type: string | null;
  declare assigned_to_id: string | null;
  declare ticket_id: string | null;
  declare priority: GrowthJourneyHandoffPriority;
  declare expected_value: number | string | null;
  declare urgent: boolean;
  declare reason: string;
  declare evidence: Record<string, unknown>;
  declare qualification_gaps: string[];
  declare talking_points: string[];
  declare best_channel: string | null;
  declare consent_basis: string | null;
  declare sla_due_at: Date | null;
  declare status: GrowthJourneyHandoffStatus;
  declare disposition: GrowthJourneyHandoffDisposition | null;
  declare disposition_reason: string | null;
  declare disposition_at: Date | null;
  declare dispositioned_by: string | null;
  declare return_to_ai: GrowthJourneyReturnToAi | null;
  declare accepted_at: Date | null;
  declare expired_at: Date | null;
  declare source: GrowthJourneyHandoffSource;
  declare idempotency_key: string;
  declare created_at: Date;
  declare updated_at: Date;
}

GrowthJourneyHandoff.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    program_id: { type: DataTypes.UUID, allowNull: true },
    subject_ref: { type: DataTypes.STRING(128), allowNull: false },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    decision_id: { type: DataTypes.UUID, allowNull: true },
    organization_id: { type: DataTypes.UUID, allowNull: true },
    owner_queue: { type: DataTypes.STRING(32), allowNull: false },
    assigned_to_type: { type: DataTypes.STRING(16), allowNull: true },
    assigned_to_id: { type: DataTypes.STRING(255), allowNull: true },
    ticket_id: { type: DataTypes.UUID, allowNull: true },
    priority: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'medium' },
    expected_value: { type: DataTypes.DECIMAL, allowNull: true },
    urgent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    evidence: { type: DataTypes.JSONB, allowNull: false },
    qualification_gaps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    talking_points: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    best_channel: { type: DataTypes.STRING(16), allowNull: true },
    consent_basis: { type: DataTypes.STRING(64), allowNull: true },
    sla_due_at: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued' },
    disposition: { type: DataTypes.STRING(20), allowNull: true },
    disposition_reason: { type: DataTypes.TEXT, allowNull: true },
    disposition_at: { type: DataTypes.DATE, allowNull: true },
    dispositioned_by: { type: DataTypes.STRING(128), allowNull: true },
    return_to_ai: { type: DataTypes.JSONB, allowNull: true },
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    expired_at: { type: DataTypes.DATE, allowNull: true },
    source: { type: DataTypes.STRING(32), allowNull: false },
    idempotency_key: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    sequelize,
    tableName: 'growth_journey_handoffs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        name: 'growth_journey_handoffs_idempotency_unique',
        fields: ['idempotency_key'],
      },
    ],
  },
);

export default GrowthJourneyHandoff;
