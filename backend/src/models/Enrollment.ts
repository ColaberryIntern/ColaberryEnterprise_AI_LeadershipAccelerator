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
  created_at?: Date;
}

class Enrollment extends Model<EnrollmentAttributes> implements EnrollmentAttributes {
  public id!: string;
  public full_name!: string;
  public email!: string;
  public company!: string;
  public title!: string;
  public phone!: string;
  public company_size!: string;
  public cohort_id!: string;
  public stripe_session_id!: string;
  public payment_status!: 'paid' | 'pending_invoice' | 'failed';
  public payment_method!: 'credit_card' | 'invoice';
  public created_at!: Date;
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
