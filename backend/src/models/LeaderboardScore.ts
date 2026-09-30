import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// The current score row for one ChallengeParticipant. Drives the leaderboard
// ranking. milestones_json captures the per-milestone breakdown behind the
// points total; rank_snapshot is the last computed rank (denormalized so the
// board can render without re-ranking on every read). One score row per
// participant (challenge_participant_id is unique).
export interface LeaderboardScoreAttributes {
  id?: string;
  challenge_participant_id: string;
  points: number;
  milestones_json?: Record<string, any> | null;
  projects_shipped: number;
  cert_earned: boolean;
  rank_snapshot?: number | null;
  updated_at?: Date;
  created_at?: Date;
}

class LeaderboardScore
  extends Model<LeaderboardScoreAttributes>
  implements LeaderboardScoreAttributes
{
  declare id: string;
  declare challenge_participant_id: string;
  declare points: number;
  declare milestones_json: Record<string, any> | null;
  declare projects_shipped: number;
  declare cert_earned: boolean;
  declare rank_snapshot: number | null;
  declare updated_at: Date;
  declare created_at: Date;
}

LeaderboardScore.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    challenge_participant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'challenge_participants', key: 'id' },
    },
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    milestones_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    projects_shipped: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    cert_earned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    rank_snapshot: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    updated_at: {
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
    tableName: 'leaderboard_scores',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['challenge_participant_id'],
        name: 'leaderboard_scores_participant_unique',
      },
      { fields: ['points'], name: 'idx_leaderboard_scores_points' },
      { fields: ['rank_snapshot'], name: 'idx_leaderboard_scores_rank_snapshot' },
    ],
  }
);

export default LeaderboardScore;
