import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type VariantStatus = 'active' | 'testing' | 'promoted' | 'retired';

interface CampaignVariantAttributes {
  id?: string;
  campaign_id: string;
  step_index: number;
  channel: string;
  variant_label: string;
  subject?: string | null;
  body?: string | null;
  ai_instructions_override?: string | null;
  status?: VariantStatus;
  sends?: number;
  opens?: number;
  replies?: number;
  bounces?: number;
  conversions?: number;
  performance_score?: number | null;
  parent_variant_id?: string | null;
  generation_metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class CampaignVariant extends Model<CampaignVariantAttributes> implements CampaignVariantAttributes {
  declare id: string;
  declare campaign_id: string;
  declare step_index: number;
  declare channel: string;
  declare variant_label: string;
  declare subject: string | null;
  declare body: string | null;
  declare ai_instructions_override: string | null;
  declare status: VariantStatus;
  declare sends: number;
  declare opens: number;
  declare replies: number;
  declare bounces: number;
  declare conversions: number;
  declare performance_score: number | null;
  declare parent_variant_id: string | null;
  declare generation_metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

CampaignVariant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'campaigns', key: 'id' },
    },
    step_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    variant_label: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    subject: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ai_instructions_override: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'testing',
    },
    sends: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    opens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    replies: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    bounces: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    conversions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    performance_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: null,
    },
    parent_variant_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaign_variants', key: 'id' },
    },
    generation_metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'campaign_variants',
    timestamps: false,
    indexes: [
      { fields: ['campaign_id', 'step_index', 'channel'] },
      { fields: ['campaign_id', 'status'] },
    ],
  }
);

export default CampaignVariant;
