import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AgentReportContentSection = 'cost' | 'activity' | 'trust' | 'tickets';
export type AgentReportCadence = 'daily' | 'weekly';
export type AgentReportChannel = 'email';

/**
 * AgentReportSubscription — a manager's standing request to receive a
 * recurring email about one agent, on a chosen cadence and delivery hour,
 * in their own timezone. Per REPORTING_MAP.md's Checkpoint A finding, no
 * object combining "what to report / who / how often / what timezone /
 * what channel" existed anywhere before this.
 *
 * `content_scope` is a closed set (cost/activity/trust/tickets), not free
 * text — same closed-enum-for-honesty reasoning as AgentGoal.metric_key:
 * every section this can request is one the report generator (Checkpoint
 * D's next piece) already knows how to render from real data, so there is
 * no "unsupported section silently ignored" failure mode.
 *
 * `channel` is a closed enum with exactly one live value today (`'email'`).
 * Slack has real code (`slackSubscriber.ts`) but is dormant — never wired,
 * no env var, no registration call — so it must not be a selectable value
 * here until it's actually live, per the mission's own
 * "do not render unsupported channels" rule.
 *
 * `timezone` is snapshotted from the creating manager's own
 * `OrgMember.timezone` at creation time (or the repo-wide default for a
 * `super_admin`, who has no `OrgMember` row) rather than read live at send
 * time — a deliberate simplification: it keeps this table self-contained
 * and avoids a null-org-member edge case at send time, at the cost of a
 * subscription not automatically following a later profile timezone change
 * (the manager can just edit the subscription).
 */
export interface AgentReportSubscriptionAttributes {
  id?: string;
  agent_id: string;
  subscriber_org_member_id?: string | null;
  created_by_email: string;
  content_scope: AgentReportContentSection[];
  cadence: AgentReportCadence;
  delivery_hour_local: number;
  timezone: string;
  channel?: AgentReportChannel;
  enabled?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class AgentReportSubscription extends Model<AgentReportSubscriptionAttributes> implements AgentReportSubscriptionAttributes {
  declare id: string;
  declare agent_id: string;
  declare subscriber_org_member_id: string | null;
  declare created_by_email: string;
  declare content_scope: AgentReportContentSection[];
  declare cadence: AgentReportCadence;
  declare delivery_hour_local: number;
  declare timezone: string;
  declare channel: AgentReportChannel;
  declare enabled: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentReportSubscription.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'ai_agents', key: 'id' },
    },
    subscriber_org_member_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'org_members', key: 'id' },
    },
    created_by_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    content_scope: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    cadence: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    delivery_hour_local: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    timezone: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: 'America/Chicago',
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'email',
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'agent_report_subscriptions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['agent_id', 'enabled'], name: 'idx_agent_report_subs_agent_enabled' },
    ],
  }
);

export default AgentReportSubscription;
