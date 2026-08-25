import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { ChangeRequestStatus } from '../services/delivery/clientChangeRequest';

/**
 * DeliveryChangeRequest — a client's request to change something, plus what it would cost.
 *
 * Master plan §Gate 10: *"Client change request must show impact before build."*
 *
 * `impact_summary` is a **snapshot**, not a live computation. Two reasons, and the second
 * is the one that matters: a stored summary is what the client actually saw when they
 * approved, and recomputing it later would silently re-describe a decision they already
 * made against different information. The live recomputation is still available on the
 * builder surface — but the record of what was shown is fixed.
 *
 * `impact_internal` holds the full node-level report and is **never** sent to a client;
 * `impact_summary` is the client-safe counts-and-flags shape. Keeping both on one row
 * rather than in two tables means they cannot drift, and the projection layer decides
 * which one leaves the building.
 */
export interface DeliveryChangeRequestAttributes {
  id?: string;
  delivery_project_id: string;
  title: string;
  description?: string | null;
  status: ChangeRequestStatus;
  requested_by_identity_id?: string | null;
  requested_at?: Date;
  /** Client-safe counts and flags. Snapshot of what the client was shown. */
  impact_summary?: any;
  /** Full node-level impact report. Builder surface only. */
  impact_internal?: any;
  impact_assessed_at?: Date | null;
  approved_by_identity_id?: string | null;
  approved_at?: Date | null;
  declined_reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryChangeRequest extends Model<DeliveryChangeRequestAttributes>
  implements DeliveryChangeRequestAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare title: string;
  declare description: string | null;
  declare status: ChangeRequestStatus;
  declare requested_by_identity_id: string | null;
  declare requested_at: Date;
  declare impact_summary: any;
  declare impact_internal: any;
  declare impact_assessed_at: Date | null;
  declare approved_by_identity_id: string | null;
  declare approved_at: Date | null;
  declare declined_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryChangeRequest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'draft' },
    requested_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    requested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    impact_summary: { type: DataTypes.JSONB, allowNull: true },
    impact_internal: { type: DataTypes.JSONB, allowNull: true },
    impact_assessed_at: { type: DataTypes.DATE, allowNull: true },
    approved_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    declined_reason: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'delivery_change_requests',
    timestamps: false,
    indexes: [
      { fields: ['delivery_project_id'] },
      { fields: ['status'] },
    ],
  },
);

export default DeliveryChangeRequest;
