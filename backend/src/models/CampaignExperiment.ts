import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface CampaignExperimentAttributes {
  id?: string;
  campaign_id?: string | null;
  variant: string;
  metric: string;
  result?: number | null;
  baseline?: number | null;
  lift_pct?: number | null;
  status?: string;
  started_at?: Date;
  concluded_at?: Date | null;
  created_at?: Date;
}

class CampaignExperiment extends Model<CampaignExperimentAttributes> implements CampaignExperimentAttributes {
  declare id: string;
  declare campaign_id: string | null;
  declare variant: string;
  declare metric: string;
  declare result: number | null;
  declare baseline: number | null;
  declare lift_pct: number | null;
  declare status: string;
  declare started_at: Date;
  declare concluded_at: Date | null;
  declare created_at: Date;
}

CampaignExperiment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    variant: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    metric: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    result: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    baseline: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    lift_pct: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'running',
      comment: 'running | concluded | adopted | rolled_back',
    },
    started_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    concluded_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'campaign_experiments',
    timestamps: false,
    indexes: [
      { fields: ['campaign_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  }
);

export default CampaignExperiment;
