import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// A friendship / connection between two enrollments (students). One directional
// row per request: `requester_id` asked `addressee_id`. `status` moves
// pending → accepted (they're friends) or pending → declined. "Are A and B
// friends?" = an accepted row in either direction. Keyed on enrollment_id (a
// student), matching the cohort-presence rail; notifications translate
// enrollment → community_members.id at emit time.
//
// The table is provisioned by ensureFriendshipSchema() in server.ts (this repo
// runs no global sequelize.sync at boot) — status is a VARCHAR + CHECK there so
// new states are trivial to add without a Postgres ENUM migration.
export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

class Friendship extends Model {
  declare id: string;
  declare requester_id: string;
  declare addressee_id: string;
  declare status: FriendshipStatus;
  declare created_at: Date;
  declare updated_at: Date;
}

Friendship.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    requester_id: { type: DataTypes.UUID, allowNull: false },
    addressee_id: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
  },
  {
    sequelize,
    tableName: 'friendships',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at', // required with underscored (see CommunityMember.ts)
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['requester_id', 'addressee_id'], name: 'friendships_pair_unique' },
      { fields: ['addressee_id'], name: 'idx_friendships_addressee' },
      { fields: ['requester_id'], name: 'idx_friendships_requester' },
    ],
  },
);

export default Friendship;
