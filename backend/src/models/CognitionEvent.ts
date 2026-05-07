/**
 * CognitionEvent — append-only persistent log of cognitive events.
 *
 * One row per event published to the cognitive event bus. Powers the replay
 * store and the autonomous regression detector's history checks.
 *
 * Phase 8 §1, §3, §12.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface Attrs {
  id?: string;
  event_id: string;
  project_id: string;
  kind: string;
  severity: 'info' | 'warning' | 'error' | null;
  payload: any;
  emitted_at: Date;
  created_at?: Date;
}

class CognitionEvent extends Model<Attrs> implements Attrs {
  declare id: string;
  declare event_id: string;
  declare project_id: string;
  declare kind: string;
  declare severity: 'info' | 'warning' | 'error' | null;
  declare payload: any;
  declare emitted_at: Date;
  declare created_at: Date;
}

CognitionEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    event_id: { type: DataTypes.STRING(64), allowNull: false },
    project_id: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(64), allowNull: false },
    severity: { type: DataTypes.STRING(16), allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    emitted_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cognition_events',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'emitted_at'] },
      { fields: ['kind'] },
      { fields: ['severity'] },
    ],
  }
);

export default CognitionEvent;
