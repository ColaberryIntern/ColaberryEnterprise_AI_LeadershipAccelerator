import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface IntentScoreAttributes {
  id?: string;
  visitor_id: string;
  lead_id?: number | null;
  score: number;
  score_components?: Record<string, any> | null;
  intent_level: string;
  signals_count: number;
  last_signal_at?: Date | null;
  score_updated_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

class IntentScore extends Model<IntentScoreAttributes> implements IntentScoreAttributes {
  declare id: string;
  declare visitor_id: string;
  declare lead_id: number | null;
  declare score: number;
  declare score_components: Record<string, any> | null;
  declare intent_level: string;
  declare signals_count: number;
  declare last_signal_at: Date | null;
  declare score_updated_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

IntentScore.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    visitor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'visitors', key: 'id' },
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    score_components: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    intent_level: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'low',
    },
    signals_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_signal_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    score_updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
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
    tableName: 'intent_scores',
    timestamps: false,
    indexes: [
      { fields: ['visitor_id'], unique: true },
      { fields: ['lead_id'] },
      { fields: ['score'] },
      { fields: ['intent_level'] },
    ],
  }
);

export default IntentScore;
