import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface ICPProfileAttributes {
  id?: string;
  name: string;
  description?: string;
  role: 'primary' | 'secondary';

  // Targeting filters (Apollo-compatible)
  person_titles?: string[];
  person_seniorities?: string[];
  industries?: string[];
  company_size_min?: number;
  company_size_max?: number;
  person_locations?: string[];
  keywords?: string[];
  apollo_filters?: Record<string, any>;

  // Intelligence
  pain_indicators?: string[];
  buying_signals?: string[];

  // Performance (populated by ICP insight feedback)
  response_rate?: number;
  booking_rate?: number;
  sample_size?: number;
  last_computed_at?: Date;

  // Associations
  campaign_id?: string;
  created_by?: string;
  created_at?: Date;
  updated_at?: Date;
}

class ICPProfile extends Model<ICPProfileAttributes> implements ICPProfileAttributes {
  declare id: string;
  declare name: string;
  declare description: string;
  declare role: 'primary' | 'secondary';
  declare person_titles: string[];
  declare person_seniorities: string[];
  declare industries: string[];
  declare company_size_min: number;
  declare company_size_max: number;
  declare person_locations: string[];
  declare keywords: string[];
  declare apollo_filters: Record<string, any>;
  declare pain_indicators: string[];
  declare buying_signals: string[];
  declare response_rate: number;
  declare booking_rate: number;
  declare sample_size: number;
  declare last_computed_at: Date;
  declare campaign_id: string;
  declare created_by: string;
  declare created_at: Date;
  declare updated_at: Date;
}

ICPProfile.init(
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
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'primary',
    },
    person_titles: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    person_seniorities: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    industries: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    company_size_min: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    company_size_max: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    person_locations: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    keywords: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    apollo_filters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    pain_indicators: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    buying_signals: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    response_rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
    },
    booking_rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
    },
    sample_size: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    last_computed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'admin_users', key: 'id' },
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
    tableName: 'icp_profiles',
    timestamps: false,
  }
);

export default ICPProfile;
