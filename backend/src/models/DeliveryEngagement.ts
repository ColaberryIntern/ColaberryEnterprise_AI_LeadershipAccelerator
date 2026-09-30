import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryEngagement — one client relationship under one brand of one tenant.
 *
 * The top of the Refactored delivery graph: Tenant → Brand → Organization →
 * DeliveryEngagement → DeliveryProject. An engagement is the commercial container; the
 * projects under it are the things actually built.
 *
 * CARRIES ITS OWN tenant_id/brand_id, unlike most of the delivery tables. It is listed
 * and authorized directly rather than always reached through a parent, and it is one of
 * the two tables a cross-tenant enumeration would target — so the scoping check has to be
 * answerable without a join. Everything hanging below `delivery_projects` scopes by join
 * instead (Gate 0 DATA_OWNERSHIP_MATRIX).
 *
 * `organization_id` is nullable on purpose. An internal or training engagement has no
 * client company, and requiring one would have meant inventing placeholder organizations
 * — which is how a table stops meaning anything.
 */
export type EngagementType =
  | 'commercial_client'
  | 'government_public_sector'
  | 'internal'
  | 'training'
  | 'delivery_residency';

export const ENGAGEMENT_TYPES: readonly EngagementType[] = [
  'commercial_client',
  'government_public_sector',
  'internal',
  'training',
  'delivery_residency',
];

export type EngagementStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export const ENGAGEMENT_STATUSES: readonly EngagementStatus[] = [
  'active',
  'paused',
  'completed',
  'cancelled',
];

export interface DeliveryEngagementAttributes {
  id?: string;
  tenant_id: string;
  brand_id?: string | null;
  organization_id?: string | null;
  engagement_type?: EngagementType;
  name: string;
  status?: EngagementStatus;
  /**
   * INTEGER, not UUID. `leads.id` is an autoincrement integer while everything else in
   * this graph is a UUID (multi-tenancy D-03). This looks like a typo and is not.
   */
  source_lead_id?: number | null;
  client_owner_identity_id?: string | null;
  delivery_owner_identity_id?: string | null;
  start_at?: Date | null;
  target_end_at?: Date | null;
  metadata?: Record<string, any> | null;
  archived_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryEngagement
  extends Model<DeliveryEngagementAttributes>
  implements DeliveryEngagementAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string | null;
  declare organization_id: string | null;
  declare engagement_type: EngagementType;
  declare name: string;
  declare status: EngagementStatus;
  declare source_lead_id: number | null;
  declare client_owner_identity_id: string | null;
  declare delivery_owner_identity_id: string | null;
  declare start_at: Date | null;
  declare target_end_at: Date | null;
  declare metadata: Record<string, any> | null;
  declare archived_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryEngagement.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    organization_id: { type: DataTypes.UUID, allowNull: true },
    engagement_type: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'commercial_client',
    },
    name: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    source_lead_id: { type: DataTypes.INTEGER, allowNull: true },
    client_owner_identity_id: { type: DataTypes.UUID, allowNull: true },
    delivery_owner_identity_id: { type: DataTypes.UUID, allowNull: true },
    start_at: { type: DataTypes.DATE, allowNull: true },
    target_end_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_engagements',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['tenant_id', 'status'], name: 'idx_delivery_engagements_tenant_status' },
      { fields: ['organization_id'], name: 'idx_delivery_engagements_org' },
    ],
  },
);

export default DeliveryEngagement;
