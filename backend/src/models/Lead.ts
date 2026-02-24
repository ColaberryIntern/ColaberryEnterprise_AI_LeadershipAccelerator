import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface LeadAttributes {
  id?: number;
  name: string;
  email: string;
  company?: string;
  role?: string;
  interest_area?: string;
  message?: string;
  source?: string;
  form_type?: string;
  created_at?: Date;
}

class Lead extends Model<LeadAttributes> implements LeadAttributes {
  public id!: number;
  public name!: string;
  public email!: string;
  public company!: string;
  public role!: string;
  public interest_area!: string;
  public message!: string;
  public source!: string;
  public form_type!: string;
  public created_at!: Date;
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
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'leads',
    timestamps: false,
  }
);

export default Lead;
