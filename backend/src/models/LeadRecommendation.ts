import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface LeadRecommendationAttributes {
  id?: string;
  campaign_id: string;
  icp_profile_id: string;
  apollo_person_id?: string | null;
  lead_data: Record<string, any>;
  program_fit_score: number;
  probability_of_sale: number;
  expected_revenue?: number | null;
  reasoning: string;
  status?: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string | null;
  reviewed_at?: Date | null;
  lead_id?: number | null;
  created_at?: Date;
  updated_at?: Date | null;
}

class LeadRecommendation extends Model<LeadRecommendationAttributes> implements LeadRecommendationAttributes {
  declare id: string;
  declare campaign_id: string;
  declare icp_profile_id: string;
  declare apollo_person_id: string | null;
  declare lead_data: Record<string, any>;
  declare program_fit_score: number;
  declare probability_of_sale: number;
  declare expected_revenue: number | null;
  declare reasoning: string;
  declare status: 'pending' | 'approved' | 'rejected';
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare lead_id: number | null;
  declare created_at: Date;
  declare updated_at: Date | null;
}

LeadRecommendation.init(
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
    icp_profile_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'icp_profiles', key: 'id' },
    },
    apollo_person_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    lead_data: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    program_fit_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    probability_of_sale: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    expected_revenue: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    reviewed_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'admin_users', key: 'id' },
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
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
    tableName: 'lead_recommendations',
    timestamps: false,
    indexes: [
      { fields: ['campaign_id', 'status'] },
      { fields: ['icp_profile_id'] },
      { fields: ['apollo_person_id'] },
    ],
  }
);

export default LeadRecommendation;
