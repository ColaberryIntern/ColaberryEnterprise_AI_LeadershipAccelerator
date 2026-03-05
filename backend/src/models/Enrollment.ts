import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface EnrollmentAttributes {
  id?: string;
  full_name: string;
  email: string;
  company: string;
  title?: string;
  phone?: string;
  company_size?: string;
  cohort_id: string;
  stripe_session_id?: string;
  payment_status: 'paid' | 'pending_invoice' | 'failed';
  payment_method: 'credit_card' | 'invoice';
  status?: 'active' | 'completed' | 'withdrawn' | 'suspended';
  readiness_score?: number;
  prework_score?: number;
  attendance_score?: number;
  assignment_score?: number;
  maturity_level?: number;
  intake_completed?: boolean;
  intake_data_json?: any;
  notes?: string;
  created_at?: Date;
  portal_token?: string;
  portal_token_expires_at?: Date;
  portal_enabled?: boolean;
}

class Enrollment extends Model<EnrollmentAttributes> implements EnrollmentAttributes {
  declare id: string;
  declare full_name: string;
  declare email: string;
  declare company: string;
  declare title: string;
  declare phone: string;
  declare company_size: string;
  declare cohort_id: string;
  declare stripe_session_id: string;
  declare payment_status: 'paid' | 'pending_invoice' | 'failed';
  declare payment_method: 'credit_card' | 'invoice';
  declare status: 'active' | 'completed' | 'withdrawn' | 'suspended';
  declare readiness_score: number;
  declare prework_score: number;
  declare attendance_score: number;
  declare assignment_score: number;
  declare maturity_level: number;
  declare intake_completed: boolean;
  declare intake_data_json: any;
  declare notes: string;
  declare portal_token: string;
  declare portal_token_expires_at: Date;
  declare portal_enabled: boolean;
  declare created_at: Date;
}

Enrollment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    full_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    company_size: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    cohort_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'cohorts', key: 'id' },
    },
    stripe_session_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    payment_status: {
      type: DataTypes.ENUM('paid', 'pending_invoice', 'failed'),
      allowNull: false,
      defaultValue: 'pending_invoice',
    },
    payment_method: {
      type: DataTypes.ENUM('credit_card', 'invoice'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('active', 'completed', 'withdrawn', 'suspended'),
      allowNull: false,
      defaultValue: 'active',
    },
    readiness_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    prework_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    attendance_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    assignment_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    maturity_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    intake_completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    intake_data_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    portal_token: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    portal_token_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    portal_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'enrollments',
    timestamps: false,
  }
);

export default Enrollment;
