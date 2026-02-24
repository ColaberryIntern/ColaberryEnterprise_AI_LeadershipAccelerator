import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface LeadAttributes {
  id?: number;
  name: string;
  email: string;
  company?: string;
  role?: string;
  phone?: string;
  interest_area?: string;
  message?: string;
  source?: string;
  form_type?: string;
  status?: string;
  interest_level?: string;
  notes?: string;
  assigned_admin?: string;
  consent_contact?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class Lead extends Model<LeadAttributes> implements LeadAttributes {
  declare id: number;
  declare name: string;
  declare email: string;
  declare company: string;
  declare role: string;
  declare phone: string;
  declare interest_area: string;
  declare message: string;
  declare source: string;
  declare form_type: string;
  declare status: string;
  declare interest_level: string;
  declare notes: string;
  declare assigned_admin: string;
  declare consent_contact: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

Lead.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    interest_area: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'website',
    },
    form_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'contact',
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'new',
    },
    interest_level: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    assigned_admin: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    consent_contact: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'leads',
    timestamps: false,
  }
);

export default Lead;
