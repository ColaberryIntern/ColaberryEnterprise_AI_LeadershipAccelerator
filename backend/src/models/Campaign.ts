import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CampaignType = 'warm_nurture' | 'cold_outbound' | 're_engagement' | 'behavioral_trigger' | 'alumni' | 'alumni_re_engagement' | 'payment_readiness' | 'executive_outreach';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';
export type CampaignMode = 'standard' | 'autonomous';
export type CampaignChannel = 'email' | 'sms' | 'social' | 'paid_search' | 'paid_social' | 'direct_mail' | 'referral' | 'organic';
/**
 * Where a campaign sits in the funnel. Drives objective-aware ranking: an awareness
 * campaign must not be ranked on cost-per-lead, and an acquisition campaign must not be
 * ranked on likes.
 *
 * THE ARRAY IS THE SOURCE OF TRUTH and the union is derived from it, rather than the two
 * being written out separately and kept in step by hand. That ordering is deliberate:
 *
 *  - `as const` makes this a tuple of string literals, which is what `z.enum()` requires. A
 *    `readonly CampaignFunnelStage[]` - what this was - cannot be passed to `z.enum()` at all,
 *    so the request contract had to restate the five values, and a sixth stage added here
 *    would have been silently rejected by a validator nobody remembered to update.
 *  - Deriving the type means the model, the DDL check and the Zod enum cannot disagree. There
 *    is nothing to assert, because there is only one list.
 */
export const CAMPAIGN_FUNNEL_STAGES = [
  'awareness',
  'consideration',
  'conversion',
  'retention',
  'advocacy',
] as const;

export type CampaignFunnelStage = (typeof CAMPAIGN_FUNNEL_STAGES)[number];

export type CampaignApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'live' | 'paused' | 'completed';

interface CampaignAttributes {
  id?: string;
  name: string;
  description?: string;
  type: CampaignType;
  status?: CampaignStatus;
  sequence_id?: string;
  targeting_criteria?: Record<string, any>;
  channel_config?: Record<string, any>;
  budget_total?: number;
  budget_spent?: number;
  ai_system_prompt?: string;
  settings?: Record<string, any>;
  goals?: string;
  gtm_notes?: string;
  started_at?: Date;
  completed_at?: Date;
  interest_group?: string;
  qa_status?: string;
  campaign_mode?: CampaignMode;
  ramp_state?: Record<string, any> | null;
  evolution_config?: Record<string, any> | null;
  destination_path?: string;
  tracking_link?: string;
  objective?: string;
  channel?: CampaignChannel;
  approval_status?: CampaignApprovalStatus;
  approved_by?: string;
  approved_at?: Date;
  budget_cap?: number;
  cost_per_lead_target?: number;
  expected_roi?: number;
  tenant_id?: string | null;
  brand_id?: string | null;
  organization_id?: string | null;
  sender_profile_id?: string | null;
  created_by?: string;
  /**
   * Both nullable in the database (`allowNull: true`), and `mode_override`'s null is
   * meaningful — it means "inherit from project", not "unset". Typed `| null` to match,
   * consistent with tenant_id/brand_id/organization_id above. Previously typed as bare
   * `string`, which was one half of the defect where neither column appeared in the class
   * `declare` block at all.
   */
  capability_id?: string | null;
  mode_override?: string | null;
  // --- Marketing Operations planning + taxonomy (ensureMarketingCampaignSchema) ---
  funnel_stage?: CampaignFunnelStage | null;
  /** Accountable owner. Distinct from created_by, which records who typed it in. */
  owner_admin_id?: string | null;
  /** Required approver. Distinct from approved_by, which records who already approved. */
  approver_admin_id?: string | null;
  planned_start_at?: Date | null;
  planned_end_at?: Date | null;
  /** Stable tracking identity, unique per tenant. Never the freely-editable display name. */
  utm_campaign_slug?: string | null;
  /** Typed targets. The legacy `goals` TEXT column is free prose and stays untouched. */
  goals_json?: Record<string, any> | null;
  parent_campaign_id?: string | null;
  archived_at?: Date | null;
  archived_reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class Campaign extends Model<CampaignAttributes> implements CampaignAttributes {
  declare id: string;
  declare name: string;
  declare description: string;
  declare type: CampaignType;
  declare status: CampaignStatus;
  declare sequence_id: string;
  declare targeting_criteria: Record<string, any>;
  declare channel_config: Record<string, any>;
  declare budget_total: number;
  declare budget_spent: number;
  declare ai_system_prompt: string;
  declare settings: Record<string, any>;
  declare goals: string;
  declare gtm_notes: string;
  declare started_at: Date;
  declare completed_at: Date;
  declare interest_group: string;
  declare qa_status: string;
  declare campaign_mode: CampaignMode;
  declare ramp_state: Record<string, any> | null;
  declare evolution_config: Record<string, any> | null;
  declare destination_path: string;
  declare tracking_link: string;
  declare objective: string;
  declare channel: CampaignChannel;
  declare approval_status: CampaignApprovalStatus;
  declare approved_by: string;
  declare approved_at: Date;
  declare budget_cap: number;
  declare cost_per_lead_target: number;
  declare expected_roi: number;
  declare tenant_id: string | null;
  declare brand_id: string | null;
  declare organization_id: string | null;
  declare sender_profile_id: string | null;
  declare created_by: string;
  // capability_id and mode_override were present in CampaignAttributes and in .init() but
  // missing here, so `campaign.capability_id` did not resolve through the typed model and
  // read as undefined. backend/CLAUDE.md requires all three declarations to agree.
  declare capability_id: string | null;
  declare mode_override: string | null;
  // --- Marketing Operations planning + taxonomy ---
  declare funnel_stage: CampaignFunnelStage | null;
  declare owner_admin_id: string | null;
  declare approver_admin_id: string | null;
  declare planned_start_at: Date | null;
  declare planned_end_at: Date | null;
  declare utm_campaign_slug: string | null;
  declare goals_json: Record<string, any> | null;
  declare parent_campaign_id: string | null;
  declare archived_at: Date | null;
  declare archived_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Campaign.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
    },
    sequence_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'follow_up_sequences', key: 'id' },
    },
    targeting_criteria: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    channel_config: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: { email: { enabled: true, daily_limit: 50 }, voice: { enabled: false }, sms: { enabled: false } },
    },
    budget_total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    budget_spent: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    ai_system_prompt: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        test_mode_enabled: false,
        test_email: '',
        test_phone: '',
        delay_between_sends: 120,
        max_leads_per_cycle: 10,
        agent_name: 'Colaberry AI',
        agent_greeting: 'Hi {first_name}, this is {agent_name} calling from Colaberry.',
        sender_email: '',
        sender_name: '',
        call_time_start: '09:00',
        call_time_end: '17:00',
        call_timezone: 'America/Chicago',
        call_active_days: [1, 2, 3, 4, 5],
        max_call_duration: 300,
        max_daily_calls: 50,
        auto_dnc_on_request: true,
        voicemail_enabled: true,
        pass_prior_conversations: true,
        auto_reply_enabled: true,
      },
    },
    goals: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    gtm_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    interest_group: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    qa_status: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'untested',
    },
    campaign_mode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'standard',
    },
    ramp_state: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    evolution_config: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    destination_path: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    tracking_link: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    objective: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    channel: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    approval_status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'draft',
    },
    approved_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'admin_users', key: 'id' },
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    budget_cap: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    cost_per_lead_target: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    expected_roi: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'admin_users', key: 'id' },
    },
    capability_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'capabilities', key: 'id' },
    },
    mode_override: {
      type: DataTypes.STRING(20),
      allowNull: true,  // null = inherit from project
    },
    // --- Marketing Operations planning + taxonomy ---
    // Columns must match backend/src/db/ensureMarketingCampaignSchema.ts EXACTLY.
    // All nullable: `campaigns` is a live table and the DDL adds nothing NOT NULL.
    funnel_stage: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    owner_admin_id: {
      // No `references` on purpose. The DDL adds a bare UUID: adding an FK to a live table
      // with existing rows risks a validation failure at boot, and the ALTER only warns,
      // which would leave the column silently absent.
      type: DataTypes.UUID,
      allowNull: true,
    },
    approver_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    planned_start_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    planned_end_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    utm_campaign_slug: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    goals_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    parent_campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    archived_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    archived_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // --- multi-tenant ecosystem ownership ------------------------------------
    // Declared because the DDL adds these columns and Sequelize only touches
    // attributes the model knows about. schedulerService names them explicitly in
    // its `attributes` list; without these declarations the query returns them as
    // undefined and every campaign silently falls back to the legacy sender.
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    organization_id: { type: DataTypes.UUID, allowNull: true },
    sender_profile_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    tableName: 'campaigns',
    timestamps: false,
    indexes: [
      { fields: ['status'], name: 'idx_campaigns_status' },
      { fields: ['type'], name: 'idx_campaigns_type' },
      { fields: ['created_at'], name: 'idx_campaigns_created_at' },
    ],
  }
);

export default Campaign;
