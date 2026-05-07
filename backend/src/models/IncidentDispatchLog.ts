/**
 * IncidentDispatchLog — append-only audit of every fan-out attempt.
 *
 * One row per `fanOutIncident` invocation. Captures which subscribers
 * accepted, which succeeded/failed, and how long each took. Powers the
 * Phase 9 dispatch-log endpoint and any cost-of-alerting queries.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface Attrs {
  id?: string;
  incident_id: string;
  project_id: string;
  severity: 'info' | 'warning' | 'error';
  type: string;
  attempted_subscribers: string[];
  outcomes: any[];
  succeeded: number;
  failed: number;
  elapsed_ms: number;
  dispatched_at: Date;
  created_at?: Date;
}

class IncidentDispatchLog extends Model<Attrs> implements Attrs {
  declare id: string;
  declare incident_id: string;
  declare project_id: string;
  declare severity: 'info' | 'warning' | 'error';
  declare type: string;
  declare attempted_subscribers: string[];
  declare outcomes: any[];
  declare succeeded: number;
  declare failed: number;
  declare elapsed_ms: number;
  declare dispatched_at: Date;
  declare created_at: Date;
}

IncidentDispatchLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    incident_id: { type: DataTypes.UUID, allowNull: false },
    project_id: { type: DataTypes.UUID, allowNull: false },
    severity: { type: DataTypes.STRING(16), allowNull: false },
    type: { type: DataTypes.STRING(64), allowNull: false },
    attempted_subscribers: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    outcomes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    succeeded: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    elapsed_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    dispatched_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'incident_dispatch_logs',
    timestamps: false,
    indexes: [
      { fields: ['incident_id'] },
      { fields: ['project_id'] },
      { fields: ['project_id', 'dispatched_at'] },
    ],
  }
);

export default IncidentDispatchLog;
