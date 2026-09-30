import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface FriendReferralAttributes {
  id?: string;
  enrollment_id: string;
  friend_name: string;
  friend_email: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * One row per friend a student recommends via the "recommend a friend"
 * onboarding step (backend/src/services/pointsService.ts's `referral_submitted`
 * event awards points once per enrollment regardless of row count — this table
 * is the record of who was recommended, not the idempotency key itself).
 */
class FriendReferral extends Model<FriendReferralAttributes> implements FriendReferralAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare friend_name: string;
  declare friend_email: string;
  declare created_at: Date;
  declare updated_at: Date;
}

FriendReferral.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'enrollments', key: 'id' } },
    friend_name: { type: DataTypes.STRING(200), allowNull: false },
    friend_email: { type: DataTypes.STRING(320), allowNull: false },
  },
  {
    sequelize,
    tableName: 'friend_referrals',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['enrollment_id'] },
      // Idempotency key: resubmitting the referral form (retry, double-click,
      // network hiccup + client retry) must not create duplicate rows for the
      // same friend. See submitReferrals()'s `ignoreDuplicates` bulkCreate.
      { unique: true, fields: ['enrollment_id', 'friend_email'] },
    ],
  }
);

export default FriendReferral;
