import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface EnrollmentLeadAttributes {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  referral_channel?: 'mailchimp' | 'landing_direct' | 'partner' | 'anthropic' | 'direct' | string;
  status?: 'prospect' | 'sales_contact' | 'enrolled' | 'churned';
  lost_reason?: 'price' | 'time' | 'prereqs' | 'timing';
  enrollment_id?: string | null;
  notes?: string;
  created_at?: Date;
  updated_at?: Date;
}

class EnrollmentLead extends Model<EnrollmentLeadAttributes> implements EnrollmentLeadAttributes {
  declare id: string;
  declare name: string;
  declare email: string;
  declare phone: string;
  declare referral_channel: string;
  declare status: 'prospect' | 'sales_contact' | 'enrolled' | 'churned';
  declare lost_reason: 'price' | 'time' | 'prereqs' | 'timing';
  declare enrollment_id: string | null;
  declare notes: string;
  declare created_at: Date;
  declare updated_at: Date;
}

EnrollmentLead.init(
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
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    referral_channel: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('prospect', 'sales_contact', 'enrolled', 'churned'),
      allowNull: false,
      defaultValue: 'prospect',
    },
    lost_reason: {
      type: DataTypes.ENUM('price', 'time', 'prereqs', 'timing'),
      allowNull: true,
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'enrollments', key: 'id' },
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'enrollment_leads',
    timestamps: false,
    indexes: [
      { fields: ['email'], unique: true, name: 'idx_enrollment_leads_email' },
      { fields: ['status'], name: 'idx_enrollment_leads_status' },
      { fields: ['referral_channel'], name: 'idx_enrollment_leads_channel' },
    ],
  }
);

export default EnrollmentLead;
