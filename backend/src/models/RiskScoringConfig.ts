import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface RiskScoringConfigAttributes {
  id: string;
  blast_radius_weights: any;
  reversibility_weights: any;
  intent_thresholds: any;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

class RiskScoringConfig extends Model<RiskScoringConfigAttributes> implements RiskScoringConfigAttributes {
  declare id: string;
  declare blast_radius_weights: any;
  declare reversibility_weights: any;
  declare intent_thresholds: any;
  declare updated_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

RiskScoringConfig.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    blast_radius_weights: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    reversibility_weights: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    intent_thresholds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        enrollment_ready: 80,
        high_intent: 60,
        engaged: 40,
        exploring: 20,
      },
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
    tableName: 'risk_scoring_configs',
    timestamps: false,
  }
);

export default RiskScoringConfig;
