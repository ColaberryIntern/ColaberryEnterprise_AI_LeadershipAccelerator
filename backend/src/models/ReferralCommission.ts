import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface ReferralCommissionAttributes {
  id?: string;
  referral_id: string;
  profile_id: string;
  deal_value?: number;
  commission_amount?: number;
  payment_status?: string;
  approved_at?: Date;
  paid_at?: Date;
  created_at?: Date;
}

class ReferralCommission extends Model<ReferralCommissionAttributes> implements ReferralCommissionAttributes {
  declare id: string;
  declare referral_id: string;
  declare profile_id: string;
  declare deal_value: number;
  declare commission_amount: number;
  declare payment_status: string;
  declare approved_at: Date;
  declare paid_at: Date;
  declare created_at: Date;
}

ReferralCommission.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    referral_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'alumni_referrals', key: 'id' },
    },
    profile_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'alumni_referral_profiles', key: 'id' },
    },
    deal_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    commission_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 250.00,
    },
    payment_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    paid_at: {
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
    tableName: 'referral_commissions',
    timestamps: false,
    indexes: [
      { fields: ['referral_id'] },
      { fields: ['profile_id'] },
      { fields: ['payment_status'] },
    ],
  }
);

export default ReferralCommission;
