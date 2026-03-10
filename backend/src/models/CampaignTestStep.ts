import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type TestStepStatus = 'passed' | 'failed' | 'skipped';

interface CampaignTestStepAttributes {
  id?: string;
  test_run_id: string;
  step_name: string;
  channel?: string | null;
  status?: TestStepStatus;
  started_at?: Date;
  completed_at?: Date | null;
  duration_ms?: number | null;
  details?: Record<string, any> | null;
  error_message?: string | null;
  created_at?: Date;
}

class CampaignTestStep extends Model<CampaignTestStepAttributes> implements CampaignTestStepAttributes {
  declare id: string;
  declare test_run_id: string;
  declare step_name: string;
  declare channel: string | null;
  declare status: TestStepStatus;
  declare started_at: Date;
  declare completed_at: Date | null;
  declare duration_ms: number | null;
  declare details: Record<string, any> | null;
  declare error_message: string | null;
  declare created_at: Date;
}

CampaignTestStep.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    test_run_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'campaign_test_runs', key: 'id' },
    },
    step_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'passed',
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
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'campaign_test_steps',
    timestamps: false,
    indexes: [
      { fields: ['test_run_id'] },
    ],
  }
);

export default CampaignTestStep;
