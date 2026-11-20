import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubActivity: the hub's human-readable trail (created, edited, approved, rejected, cancelled,
 * paused, group changed, sent), shown on the Schedule & history tab (CH2.1). Append-only.
 * actor_id is null for the delivery worker. Columns match ensureCommsHubSchema.ts exactly.
 */
export type CommsHubEntityType = 'event' | 'thumbnail' | 'message' | 'delivery' | 'settings' | 'broadcast';

export interface CommsHubActivityAttributes {
  id?: string;
  actor_id?: string | null;
  actor_label?: string | null;
  action: string;
  entity_type: CommsHubEntityType;
  entity_id?: string | null;
  detail?: Record<string, unknown>;
  created_at?: Date;
}

class CommsHubActivity extends Model<CommsHubActivityAttributes> implements CommsHubActivityAttributes {
  declare id: string;
  declare actor_id: string | null;
  declare actor_label: string | null;
  declare action: string;
  declare entity_type: CommsHubEntityType;
  declare entity_id: string | null;
  declare detail: Record<string, unknown>;
  declare created_at: Date;
}

CommsHubActivity.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    actor_id: { type: DataTypes.STRING(64), allowNull: true },
    actor_label: { type: DataTypes.STRING(255), allowNull: true },
    action: { type: DataTypes.STRING(64), allowNull: false },
    entity_type: { type: DataTypes.STRING(32), allowNull: false },
    entity_id: { type: DataTypes.UUID, allowNull: true },
    detail: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_activity', timestamps: true, createdAt: 'created_at', updatedAt: false },
);

export default CommsHubActivity;
