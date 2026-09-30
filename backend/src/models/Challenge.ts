import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// A scored challenge that participants compete in (the leaderboard surface).
// sponsor_id is nullable: a challenge may be global/individual (Door A) or
// scoped to a single employer's sponsored cohort (Door B, company leaderboard).
// scoring_config is a JSONB blob describing how points/milestones are weighted.
export interface ChallengeAttributes {
  id?: string;
  name: string;
  sponsor_id?: string | null;
  start_date?: Date | null;
  end_date?: Date | null;
  scoring_config?: Record<string, any> | null;
  status: 'draft' | 'active' | 'completed' | 'archived';
  created_at?: Date;
  updated_at?: Date;
}

class Challenge extends Model<ChallengeAttributes> implements ChallengeAttributes {
  declare id: string;
  declare name: string;
  declare sponsor_id: string | null;
  declare start_date: Date | null;
  declare end_date: Date | null;
  declare scoring_config: Record<string, any> | null;
  declare status: 'draft' | 'active' | 'completed' | 'archived';
  declare created_at: Date;
  declare updated_at: Date;
}

Challenge.init(
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
    sponsor_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sponsors', key: 'id' },
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    scoring_config: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'completed', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
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
    tableName: 'challenges',
    timestamps: false,
    indexes: [
      { fields: ['sponsor_id'], name: 'idx_challenges_sponsor_id' },
      { fields: ['status'], name: 'idx_challenges_status' },
      { fields: ['start_date'], name: 'idx_challenges_start_date' },
    ],
  }
);

export default Challenge;
