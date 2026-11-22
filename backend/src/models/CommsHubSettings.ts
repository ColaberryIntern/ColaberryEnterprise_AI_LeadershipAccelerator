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
  /** CH10.4 WhatsApp sending state: the earliest next send, the Central day's count, and the breaker. */
  whatsapp_next_send_at?: Date | null;
  whatsapp_day?: string | null;
  whatsapp_day_count?: number;
  whatsapp_breaker_until?: Date | null;
  whatsapp_breaker_reason?: string | null;
  whatsapp_breaker_alerted_for?: string | null;
}

class CommsHubSettings extends Model<CommsHubSettingsAttributes> implements CommsHubSettingsAttributes {
  declare id: number;
  declare sending_paused: boolean;
  declare quiet_hours: CommsHubQuietHours | null;
  declare alert_recipients: string[];
  declare test_cohort_id: string | null;
  declare updated_by: string | null;
  declare updated_at: Date;
  declare whatsapp_next_send_at: Date | null;
  declare whatsapp_day: string | null;
  declare whatsapp_day_count: number;
  declare whatsapp_breaker_until: Date | null;
  declare whatsapp_breaker_reason: string | null;
  declare whatsapp_breaker_alerted_for: string | null;
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
    whatsapp_next_send_at: { type: DataTypes.DATE, allowNull: true },
    whatsapp_day: { type: DataTypes.DATEONLY, allowNull: true },
    whatsapp_day_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    whatsapp_breaker_until: { type: DataTypes.DATE, allowNull: true },
    whatsapp_breaker_reason: { type: DataTypes.STRING(64), allowNull: true },
    whatsapp_breaker_alerted_for: { type: DataTypes.STRING(128), allowNull: true },
  },
  { sequelize, tableName: 'comms_hub_settings', timestamps: true, createdAt: false, updatedAt: 'updated_at' },
);

export default CommsHubSettings;
