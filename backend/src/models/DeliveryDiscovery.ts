import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryDiscovery — the understanding a project is built on, versioned and approved.
 *
 * Master plan §Gate 4 requires approval of a discovery snapshot *before* full
 * architecture. That sequencing is the point: architecture built on an unconfirmed
 * understanding is expensive to unwind, and the cheapest moment to discover a
 * misunderstanding is before anyone has designed around it.
 *
 * Same freeze discipline as `DeliveryContract`: approval captures `approved_snapshot`,
 * and a change to an approved discovery creates version N+1 rather than editing N. What
 * the client confirmed we understood has to stay readable exactly as they confirmed it.
 *
 * THE SEVEN OUTPUT FIELDS ARE NOT DECORATION. Master plan §Gate 4 requires Project AI to
 * state what remains human and where agents may act, alongside what software should
 * handle. Storing them as distinct columns rather than one blob is what lets Gate 7 check
 * that the story graph honours them — and what stops "where AI should recommend" quietly
 * collapsing into "where agents may act", which is the difference between a suggestion
 * and an action taken on someone's behalf.
 */
export type DiscoveryStatus = 'draft' | 'proposed' | 'approved' | 'superseded';

export const DISCOVERY_STATUSES: readonly DiscoveryStatus[] = [
  'draft',
  'proposed',
  'approved',
  'superseded',
];

export interface DeliveryDiscoveryAttributes {
  id?: string;
  delivery_project_id: string;
  version?: number;
  status?: DiscoveryStatus;

  // ── What was captured (master plan §Gate 4 intake list) ──
  business_goal?: string | null;
  users?: Record<string, any> | null;
  jobs_to_be_done?: Record<string, any> | null;
  workflow?: Record<string, any> | null;
  systems?: Record<string, any> | null;
  data_sources?: Record<string, any> | null;
  pain_points?: Record<string, any> | null;
  human_judgment?: Record<string, any> | null;
  constraints?: Record<string, any> | null;
  compliance?: Record<string, any> | null;
  success_measures?: Record<string, any> | null;

  // ── What Project AI produced ──
  understood?: string | null;
  recommended?: string | null;
  /** What stays a human decision. Kept distinct so it cannot be quietly automated later. */
  remains_human?: string | null;
  software_handles?: string | null;
  ai_recommends?: string | null;
  agents_may_act?: string | null;
  open_decisions?: Record<string, any> | null;

  approved_snapshot?: Record<string, any> | null;
  approved_by_identity_id?: string | null;
  approved_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryDiscovery
  extends Model<DeliveryDiscoveryAttributes>
  implements DeliveryDiscoveryAttributes
{
  declare id: string;
  declare delivery_project_id: string;
  declare version: number;
  declare status: DiscoveryStatus;
  declare business_goal: string | null;
  declare users: Record<string, any> | null;
  declare jobs_to_be_done: Record<string, any> | null;
  declare workflow: Record<string, any> | null;
  declare systems: Record<string, any> | null;
  declare data_sources: Record<string, any> | null;
  declare pain_points: Record<string, any> | null;
  declare human_judgment: Record<string, any> | null;
  declare constraints: Record<string, any> | null;
  declare compliance: Record<string, any> | null;
  declare success_measures: Record<string, any> | null;
  declare understood: string | null;
  declare recommended: string | null;
  declare remains_human: string | null;
  declare software_handles: string | null;
  declare ai_recommends: string | null;
  declare agents_may_act: string | null;
  declare open_decisions: Record<string, any> | null;
  declare approved_snapshot: Record<string, any> | null;
  declare approved_by_identity_id: string | null;
  declare approved_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryDiscovery.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    business_goal: { type: DataTypes.TEXT, allowNull: true },
    users: { type: DataTypes.JSONB, allowNull: true },
    jobs_to_be_done: { type: DataTypes.JSONB, allowNull: true },
    workflow: { type: DataTypes.JSONB, allowNull: true },
    systems: { type: DataTypes.JSONB, allowNull: true },
    data_sources: { type: DataTypes.JSONB, allowNull: true },
    pain_points: { type: DataTypes.JSONB, allowNull: true },
    human_judgment: { type: DataTypes.JSONB, allowNull: true },
    constraints: { type: DataTypes.JSONB, allowNull: true },
    compliance: { type: DataTypes.JSONB, allowNull: true },
    success_measures: { type: DataTypes.JSONB, allowNull: true },
    understood: { type: DataTypes.TEXT, allowNull: true },
    recommended: { type: DataTypes.TEXT, allowNull: true },
    remains_human: { type: DataTypes.TEXT, allowNull: true },
    software_handles: { type: DataTypes.TEXT, allowNull: true },
    ai_recommends: { type: DataTypes.TEXT, allowNull: true },
    agents_may_act: { type: DataTypes.TEXT, allowNull: true },
    open_decisions: { type: DataTypes.JSONB, allowNull: true },
    approved_snapshot: { type: DataTypes.JSONB, allowNull: true },
    approved_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_discoveries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['delivery_project_id', 'version'],
        name: 'delivery_discoveries_project_version_unique',
      },
    ],
  },
);

export default DeliveryDiscovery;
