import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface EventLedgerAttributes {
  id: string;
  event_type: string;
  actor: string;
  entity_type: string;
  entity_id: string;
  payload: any;
  created_at: Date;
}

class EventLedger extends Model<EventLedgerAttributes> implements EventLedgerAttributes {
  declare id: string;
  declare event_type: string;
  declare actor: string;
  declare entity_type: string;
  declare entity_id: string;
  declare payload: any;
  declare created_at: Date;
}

EventLedger.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    event_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    actor: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'system',
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    entity_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    payload: {
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
    tableName: 'event_ledger',
    timestamps: false,
  }
);

export default EventLedger;
