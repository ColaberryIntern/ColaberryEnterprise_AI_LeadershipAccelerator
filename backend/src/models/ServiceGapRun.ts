/**
 * ServiceGapRun - one batch "Analyze unlinked case studies" run of the AI Service Gap Detector, with progress
 * counters the page polls. At most one `running` run per tenant (partial unique index). Schema: db/ensureServiceGapSchema.ts.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ServiceGapRunStatus = 'running' | 'completed' | 'failed';

export interface ServiceGapRunAttributes {
  id: string;
  tenant_id: string;
  status: ServiceGapRunStatus;
  total: number;
  analyzed: number;
  reused: number;
  failed: number;
  last_error: string | null;
  started_by: string | null;
  started_at: Date;
  finished_at: Date | null;
}

export class ServiceGapRun extends Model<ServiceGapRunAttributes> {
  declare id: string;
  declare tenant_id: string;
  declare status: ServiceGapRunStatus;
  declare total: number;
  declare analyzed: number;
  declare reused: number;
  declare failed: number;
  declare last_error: string | null;
  declare started_by: string | null;
  declare started_at: Date;
  declare finished_at: Date | null;
}

ServiceGapRun.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'running' },
    total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    analyzed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    reused: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_error: { type: DataTypes.TEXT, allowNull: true },
    started_by: { type: DataTypes.TEXT, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finished_at: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, modelName: 'ServiceGapRun', tableName: 'service_gap_runs', timestamps: false },
);

export default ServiceGapRun;
