import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyPolicy — an operator's setting for one brand × owner queue
 * (§6.1 `growth_journey_policies`; §11 capacity and assignment; Phase 4 T401).
 *
 * ─── FOUR POLICY TYPES, ONE TABLE ───────────────────────────────────────────
 *
 *   queue_capacity  how many handoffs a day the queue can take (`daily_capacity`)
 *   queue_assignee  who the queue's handoffs are assigned to, in the `tickets`
 *                   vocabulary (`assigned_to_type` / `assigned_to_id`)
 *   cooldown        how long a `not_ready` / `nurture` return-to-AI keeps the
 *                   AI's commercial outreach off (`cooldown_days`)
 *   sla             how long a handoff may sit before it is breached (`sla_hours`)
 *
 * Every value is nullable and the boot seed writes rows with every value NULL
 * (the `INERT_ON_CREATE` discipline `brand_offer_policies` established): a
 * policy row changes nothing until a human fills it in. In particular a NULL
 * `daily_capacity` is reported by the capacity reader as `unknown` — never
 * as zero (which would refuse every handoff) and never as unlimited (which
 * would drown the queue).
 *
 * ─── WHY NOT A ROLE ─────────────────────────────────────────────────────────
 *
 * `MGMT_ROLES` has neither `sales` nor `solution_architect`, and Phase 4 adds
 * no RBAC role. A queue is a string an operator maps to a person here; a
 * queue with no `queue_assignee` row leaves its handoffs `queued`, visible
 * and unassigned, which is the honest state when nobody has been named.
 *
 * Mutable on purpose — an operator changes these — so `updated_at` is
 * maintained and the model is outside the append-only guard's pattern.
 */

export type GrowthJourneyPolicyType = 'queue_capacity' | 'queue_assignee' | 'cooldown' | 'sla';

export interface GrowthJourneyPolicyAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  policy_type: GrowthJourneyPolicyType;
  owner_queue?: string | null;
  daily_capacity?: number | null;
  sla_hours?: number | null;
  assigned_to_type?: string | null;
  assigned_to_id?: string | null;
  cooldown_days?: number | null;
  settings?: Record<string, unknown>;
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

class GrowthJourneyPolicy
  extends Model<GrowthJourneyPolicyAttributes>
  implements GrowthJourneyPolicyAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare policy_type: GrowthJourneyPolicyType;
  declare owner_queue: string | null;
  declare daily_capacity: number | null;
  declare sla_hours: number | null;
  declare assigned_to_type: string | null;
  declare assigned_to_id: string | null;
  declare cooldown_days: number | null;
  declare settings: Record<string, unknown>;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

GrowthJourneyPolicy.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    policy_type: { type: DataTypes.STRING(32), allowNull: false },
    owner_queue: { type: DataTypes.STRING(32), allowNull: true },
    daily_capacity: { type: DataTypes.INTEGER, allowNull: true },
    sla_hours: { type: DataTypes.INTEGER, allowNull: true },
    assigned_to_type: { type: DataTypes.STRING(16), allowNull: true },
    assigned_to_id: { type: DataTypes.STRING(255), allowNull: true },
    cooldown_days: { type: DataTypes.INTEGER, allowNull: true },
    settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'active' },
  },
  {
    sequelize,
    tableName: 'growth_journey_policies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default GrowthJourneyPolicy;
