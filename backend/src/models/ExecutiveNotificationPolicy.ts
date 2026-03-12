import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface ExecutiveNotificationPolicyAttributes {
  id: string;
  scope: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_timezone: string;
  weekend_policy: string;
  severity_channel_map: Record<string, string[]>;
  rate_limits: Record<string, { max_per_hour: number }>;
  cluster_window_minutes: number;
  digest_morning_cron: string;
  digest_evening_cron: string;
  digest_enabled: boolean;
  acknowledgment_suppresses: boolean;
  severity_rules: Record<string, string[]>;
  enabled: boolean;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

class ExecutiveNotificationPolicy
  extends Model<ExecutiveNotificationPolicyAttributes>
  implements ExecutiveNotificationPolicyAttributes
{
  declare id: string;
  declare scope: string;
  declare quiet_hours_start: string;
  declare quiet_hours_end: string;
  declare quiet_hours_timezone: string;
  declare weekend_policy: string;
  declare severity_channel_map: Record<string, string[]>;
  declare rate_limits: Record<string, { max_per_hour: number }>;
  declare cluster_window_minutes: number;
  declare digest_morning_cron: string;
  declare digest_evening_cron: string;
  declare digest_enabled: boolean;
  declare acknowledgment_suppresses: boolean;
  declare severity_rules: Record<string, string[]>;
  declare enabled: boolean;
  declare updated_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ExecutiveNotificationPolicy.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    scope: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'global',
    },
    quiet_hours_start: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: '22:00',
    },
    quiet_hours_end: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: '07:00',
    },
    quiet_hours_timezone: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'America/Chicago',
    },
    weekend_policy: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'quiet_hours_only',
    },
    severity_channel_map: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        info: ['dashboard'],
        important: ['dashboard', 'email'],
        high: ['dashboard', 'email', 'sms'],
        critical: ['dashboard', 'email', 'sms', 'voice'],
      },
    },
    rate_limits: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        email: { max_per_hour: 10 },
        sms: { max_per_hour: 3 },
        voice: { max_per_hour: 1 },
      },
    },
    cluster_window_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    digest_morning_cron: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '0 7 * * *',
    },
    digest_evening_cron: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '0 18 * * *',
    },
    digest_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    acknowledgment_suppresses: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    severity_rules: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        info: ['roi_calculation', 'briefing_download', 'minor_governance_change'],
        important: ['high_sponsorship_score', 'multiple_bookings_24h', 'agent_drift_warning', 'strategy_call_booked'],
        high: ['enrollment_completed', 'payment_failed', 'governance_override', 'agent_error_threshold'],
        critical: ['system_failure', 'budget_cap_exceeded', 'autonomy_violation', 'payment_gateway_down', 'db_failure', '5xx_spike'],
      },
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    updated_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'executive_notification_policies',
    timestamps: false,
    indexes: [
      { fields: ['scope'], unique: true },
    ],
  }
);

export default ExecutiveNotificationPolicy;
