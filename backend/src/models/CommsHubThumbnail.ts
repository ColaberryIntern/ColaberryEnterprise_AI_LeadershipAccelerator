import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubThumbnail: one generated or uploaded thumbnail option for a hub event (CH2.1, used by CH4).
 * Never overwritten: "try again" adds a row. Columns match ensureCommsHubSchema.ts exactly.
 */
export type CommsHubThumbnailSource = 'template' | 'upload' | 'ai';

export interface CommsHubThumbnailAttributes {
  id?: string;
  event_id: string;
  source: CommsHubThumbnailSource;
  style_family?: string | null;
  prompt_used?: string | null;
  inputs?: Record<string, unknown>;
  asset_16x9_id?: string | null;
  asset_1x1_id?: string | null;
  asset_3x1_id?: string | null;
  model?: string | null;
  cost_usd?: string | null;
  latency_ms?: number | null;
  created_by?: string | null;
  created_at?: Date;
}

class CommsHubThumbnail extends Model<CommsHubThumbnailAttributes> implements CommsHubThumbnailAttributes {
  declare id: string;
  declare event_id: string;
  declare source: CommsHubThumbnailSource;
  declare style_family: string | null;
  declare prompt_used: string | null;
  declare inputs: Record<string, unknown>;
  declare asset_16x9_id: string | null;
  declare asset_1x1_id: string | null;
  declare asset_3x1_id: string | null;
  declare model: string | null;
  declare cost_usd: string | null;
  declare latency_ms: number | null;
  declare created_by: string | null;
  declare created_at: Date;
}

CommsHubThumbnail.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    event_id: { type: DataTypes.UUID, allowNull: false },
    source: { type: DataTypes.STRING(16), allowNull: false },
    style_family: { type: DataTypes.STRING(64), allowNull: true },
    prompt_used: { type: DataTypes.TEXT, allowNull: true },
    inputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    asset_16x9_id: { type: DataTypes.UUID, allowNull: true },
    asset_1x1_id: { type: DataTypes.UUID, allowNull: true },
    asset_3x1_id: { type: DataTypes.UUID, allowNull: true },
    model: { type: DataTypes.STRING(64), allowNull: true },
    cost_usd: { type: DataTypes.DECIMAL(10, 4), allowNull: true },
    latency_ms: { type: DataTypes.INTEGER, allowNull: true },
    created_by: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_thumbnails', timestamps: true, createdAt: 'created_at', updatedAt: false },
);

export default CommsHubThumbnail;
