import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ReferralType = 'corporate_sponsor' | 'introduced' | 'anonymous';
export type ReferralStatus =
  | 'submitted'
  | 'lead_created'
  | 'campaign_assigned'
  | 'in_progress'
  | 'meeting_scheduled'
  | 'enrolled'
  | 'closed_lost';

interface AlumniReferralAttributes {
  id?: string;
  profile_id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  job_title?: string;
  referral_type: ReferralType;
  lead_id?: number;
  campaign_id?: string;
  status?: ReferralStatus;
  created_at?: Date;
  updated_at?: Date;
}

class AlumniReferral extends Model<AlumniReferralAttributes> implements AlumniReferralAttributes {
  declare id: string;
  declare profile_id: string;
  declare company_name: string;
  declare contact_name: string;
  declare contact_email: string;
  declare job_title: string;
  declare referral_type: ReferralType;
  declare lead_id: number;
  declare campaign_id: string;
  declare status: ReferralStatus;
  declare created_at: Date;
  declare updated_at: Date;
}

AlumniReferral.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    profile_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'alumni_referral_profiles', key: 'id' },
    },
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    contact_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    contact_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    job_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    referral_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'submitted',
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
    tableName: 'alumni_referrals',
    timestamps: false,
    indexes: [
      { fields: ['profile_id'] },
      { fields: ['lead_id'] },
      { fields: ['contact_email'] },
      { fields: ['status'] },
      { fields: ['referral_type'] },
    ],
  }
);

export default AlumniReferral;
