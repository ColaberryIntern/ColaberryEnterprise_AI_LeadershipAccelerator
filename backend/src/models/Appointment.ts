import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AppointmentAttributes {
  id?: string;
  lead_id: number;
  admin_user_id?: string;
  title: string;
  description?: string;
  scheduled_at: Date;
  duration_minutes?: number;
  type: string;
  status?: string;
  outcome_notes?: string;
  created_at?: Date;
  updated_at?: Date;
}

class Appointment extends Model<AppointmentAttributes> implements AppointmentAttributes {
  declare id: string;
  declare lead_id: number;
  declare admin_user_id: string;
  declare title: string;
  declare description: string;
  declare scheduled_at: Date;
  declare duration_minutes: number;
  declare type: string;
  declare status: string;
  declare outcome_notes: string;
  declare created_at: Date;
  declare updated_at: Date;
}

Appointment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
    },
    admin_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'admin_users', key: 'id' },
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    scheduled_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    duration_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
    },
    type: {
      type: DataTypes.ENUM('strategy_call', 'demo', 'follow_up', 'enrollment_close'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'completed', 'cancelled', 'no_show'),
      allowNull: false,
      defaultValue: 'scheduled',
    },
    outcome_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'appointments',
    timestamps: false,
  }
);

export default Appointment;
