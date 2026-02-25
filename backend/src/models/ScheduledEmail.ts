import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface ScheduledEmailAttributes {
  id?: string;
  lead_id: number;
  sequence_id?: string;
  step_index: number;
  subject: string;
  body: string;
  to_email: string;
  scheduled_for: Date;
  sent_at?: Date;
  status?: string;
  created_at?: Date;
}

class ScheduledEmail extends Model<ScheduledEmailAttributes> implements ScheduledEmailAttributes {
  declare id: string;
  declare lead_id: number;
  declare sequence_id: string;
  declare step_index: number;
  declare subject: string;
  declare body: string;
  declare to_email: string;
  declare scheduled_for: Date;
  declare sent_at: Date;
  declare status: string;
  declare created_at: Date;
}

ScheduledEmail.init(
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
    sequence_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'follow_up_sequences', key: 'id' },
    },
    step_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    to_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    scheduled_for: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'scheduled_emails',
    timestamps: false,
  }
);

export default ScheduledEmail;
