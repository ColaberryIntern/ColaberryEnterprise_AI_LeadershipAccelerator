import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AlumniReferralProfileAttributes {
  id?: string;
  alumni_email: string;
  alumni_name: string;
  alumni_phone?: string;
  alumni_cohort?: string;
  status?: string;
  total_referrals?: number;
  total_earnings?: number;
  created_at?: Date;
  updated_at?: Date;
}

class AlumniReferralProfile extends Model<AlumniReferralProfileAttributes> implements AlumniReferralProfileAttributes {
  declare id: string;
  declare alumni_email: string;
  declare alumni_name: string;
  declare alumni_phone: string;
  declare alumni_cohort: string;
  declare status: string;
  declare total_referrals: number;
  declare total_earnings: number;
  declare created_at: Date;
  declare updated_at: Date;
}

AlumniReferralProfile.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    alumni_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    alumni_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    alumni_phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    alumni_cohort: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    total_referrals: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_earnings: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
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
    tableName: 'alumni_referral_profiles',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['alumni_email'] },
      { fields: ['status'] },
    ],
  }
);

export default AlumniReferralProfile;
