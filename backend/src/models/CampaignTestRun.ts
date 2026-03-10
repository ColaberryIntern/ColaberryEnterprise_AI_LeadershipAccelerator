import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type TestRunStatus = 'running' | 'passed' | 'failed' | 'partial';
export type TestRunInitiator = 'manual' | 'qa_agent';

interface CampaignTestRunAttributes {
  id?: string;
  campaign_id: string;
  started_at?: Date;
  completed_at?: Date | null;
  status?: TestRunStatus;
  score?: number | null;
  initiated_by: TestRunInitiator;
  test_lead_id?: number | null;
  summary?: Record<string, any> | null;
  created_at?: Date;
}

class CampaignTestRun extends Model<CampaignTestRunAttributes> implements CampaignTestRunAttributes {
  declare id: string;
  declare campaign_id: string;
  declare started_at: Date;
  declare completed_at: Date | null;
  declare status: TestRunStatus;
  declare score: number | null;
  declare initiated_by: TestRunInitiator;
  declare test_lead_id: number | null;
  declare summary: Record<string, any> | null;
  declare created_at: Date;
}

CampaignTestRun.init(
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
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'running',
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    initiated_by: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    test_lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    summary: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'campaign_test_runs',
    timestamps: false,
    indexes: [
      { fields: ['campaign_id'] },
      { fields: ['status'] },
    ],
  }
);

export default CampaignTestRun;
