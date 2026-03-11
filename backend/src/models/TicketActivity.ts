import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { TicketActorType } from './Ticket';

interface TicketActivityAttributes {
  id?: string;
  ticket_id: string;
  actor_type: TicketActorType;
  actor_id: string;
  action: string;
  from_value?: string | null;
  to_value?: string | null;
  comment?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
}

class TicketActivity extends Model<TicketActivityAttributes> implements TicketActivityAttributes {
  declare id: string;
  declare ticket_id: string;
  declare actor_type: TicketActorType;
  declare actor_id: string;
  declare action: string;
  declare from_value: string | null;
  declare to_value: string | null;
  declare comment: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
}

TicketActivity.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tickets', key: 'id' },
    },
    actor_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    actor_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    from_value: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    to_value: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'ticket_activities',
    timestamps: false,
    indexes: [
      { fields: ['ticket_id', 'created_at'] },
    ],
  }
);

export default TicketActivity;
