import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ResponsiblePersonAttributes {
  id?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  work_hours?: string | null;
  time_zone?: string | null;
  calendar_link?: string | null;
  areas?: string[];
  shift_note?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class ResponsiblePerson extends Model<ResponsiblePersonAttributes> implements ResponsiblePersonAttributes {
  declare id: string;
  declare name: string;
  declare email: string | null;
  declare phone: string | null;
  declare work_hours: string | null;
  declare time_zone: string | null;
  declare calendar_link: string | null;
  declare areas: string[];
  declare shift_note: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ResponsiblePerson.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    email: { type: DataTypes.STRING(200), allowNull: true },
    phone: { type: DataTypes.STRING(50), allowNull: true },
    work_hours: { type: DataTypes.STRING(100), allowNull: true },
    time_zone: { type: DataTypes.STRING(50), allowNull: true },
    calendar_link: { type: DataTypes.STRING(500), allowNull: true },
    areas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    shift_note: { type: DataTypes.STRING(200), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'responsible_persons',
    timestamps: false,
  }
);

export default ResponsiblePerson;
