import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubSettings: the hub's single settings row (id = 1, enforced by a CHECK) (CH2.1, used by CH7).
 * Columns match ensureCommsHubSchema.ts exactly.
 */
export interface CommsHubQuietHours { start: string; end: string }

export interface CommsHubSettingsAttributes {
  id?: number;
  sending_paused?: boolean;
  quiet_hours?: CommsHubQuietHours | null;
  alert_recipients?: string[];
  test_cohort_id?: string | null;
  updated_by?: string | null;
  updated_at?: Date;
}

class CommsHubSettings extends Model<CommsHubSettingsAttributes> implements CommsHubSettingsAttributes {
  declare id: number;
  declare sending_paused: boolean;
  declare quiet_hours: CommsHubQuietHours | null;
  declare alert_recipients: string[];
  declare test_cohort_id: string | null;
  declare updated_by: string | null;
  declare updated_at: Date;
}

CommsHubSettings.init(
  {
    id: { type: DataTypes.SMALLINT, primaryKey: true, defaultValue: 1 },
    sending_paused: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    quiet_hours: { type: DataTypes.JSONB, allowNull: true },
    alert_recipients: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    test_cohort_id: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.STRING(64), allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_settings', timestamps: true, createdAt: false, updatedAt: 'updated_at' },
);

export default CommsHubSettings;
