import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CommunityPointsEventAttributes {
  id?: string;
  member_id: string;
  points: number;
  created_at?: Date;
}

// Append-only points ledger. Written once per like/unlike state transition
// (see communityService.ts::toggleLike) — never updated or deduplicated
// itself, since the CommunityLike unique constraint upstream already makes
// each transition fire exactly once. This is what makes 7d/30d rolling
// leaderboard windows possible; CommunityMember.points is only a running
// total with no history.
class CommunityPointsEvent extends Model<CommunityPointsEventAttributes> implements CommunityPointsEventAttributes {
  declare id: string;
  declare member_id: string;
  declare points: number;
  declare created_at: Date;
}

CommunityPointsEvent.init(
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
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'community_points_events',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [{ fields: ['member_id', 'created_at'], name: 'idx_community_points_events_member_created' }],
  }
);

export default CommunityPointsEvent;
