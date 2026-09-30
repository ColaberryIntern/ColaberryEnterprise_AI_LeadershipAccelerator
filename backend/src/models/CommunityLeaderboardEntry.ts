import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CommunityLeaderboardPeriod = '7d' | '30d' | 'all_time';

export interface CommunityLeaderboardEntryAttributes {
  id?: string;
  member_id: string;
  period: CommunityLeaderboardPeriod;
  points?: number;
  rank_snapshot?: number | null;
  computed_at?: Date;
}

// One row per (member, period). The unique constraint makes the periodic
// recompute-and-upsert job idempotent — re-running it for the same member/
// period replaces the row rather than duplicating it.
class CommunityLeaderboardEntry
  extends Model<CommunityLeaderboardEntryAttributes>
  implements CommunityLeaderboardEntryAttributes
{
  declare id: string;
  declare member_id: string;
  declare period: CommunityLeaderboardPeriod;
  declare points: number;
  declare rank_snapshot: number | null;
  declare computed_at: Date;
}

CommunityLeaderboardEntry.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    member_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'community_members', key: 'id' },
    },
    period: {
      type: DataTypes.ENUM('7d', '30d', 'all_time'),
      allowNull: false,
    },
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    rank_snapshot: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    computed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'community_leaderboard_entries',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['member_id', 'period'],
        name: 'uq_community_leaderboard_member_period',
      },
      { fields: ['period', 'points'], name: 'idx_community_leaderboard_period_points' },
    ],
  }
);

export default CommunityLeaderboardEntry;
