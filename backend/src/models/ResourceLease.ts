import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Work Graph (Milestone 3). A ResourceLease is a time-bounded claim an
// agent run holds on a resource_key (e.g. "file:backend/src/x.ts", "route:/api/x",
// "campaign:123") so two agents never mutate the same resource concurrently. Only
// one ACTIVE lease per resource_key can exist at a time - enforced at the DB level
// by a partial unique index (see ensureWorkGraphSchema.ts), not just in application
// code, so a race between two acquire attempts is resolved by Postgres itself.

export type ResourceLeaseStatus = 'active' | 'released' | 'expired' | 'cancelled';

interface ResourceLeaseAttributes {
  id?: string;
  resource_key: string;
  work_unit_id?: string | null;
  run_id?: string | null;
  lease_owner: string;
  status?: ResourceLeaseStatus;
  acquired_at?: Date;
  expires_at: Date;
  heartbeat_at?: Date | null;
  idempotency_key: string;
  before_state_version?: string | null;
  cancellation_token?: string;
  released_at?: Date | null;
  created_at?: Date;
}

class ResourceLease extends Model<ResourceLeaseAttributes> implements ResourceLeaseAttributes {
  declare id: string;
  declare resource_key: string;
  declare work_unit_id: string | null;
  declare run_id: string | null;
  declare lease_owner: string;
  declare status: ResourceLeaseStatus;
  declare acquired_at: Date;
  declare expires_at: Date;
  declare heartbeat_at: Date | null;
  declare idempotency_key: string;
  declare before_state_version: string | null;
  declare cancellation_token: string;
  declare released_at: Date | null;
  declare created_at: Date;
}

ResourceLease.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    resource_key: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    work_unit_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'ticket_work_units', key: 'id' },
    },
    run_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'agent_runs', key: 'id' },
    },
    lease_owner: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    acquired_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    heartbeat_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    idempotency_key: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    before_state_version: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    cancellation_token: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
    },
    released_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'resource_leases',
    timestamps: false,
    indexes: [
      { fields: ['resource_key'] },
      { fields: ['work_unit_id'] },
      { fields: ['run_id'] },
      { fields: ['status'] },
      { fields: ['expires_at'] },
    ],
  }
);

export default ResourceLease;
