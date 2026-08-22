import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface EventLedgerAttributes {
  id: string;
  event_type: string;
  actor: string;
  entity_type: string;
  entity_id: string;
  payload: any;
  /** Multi-tenant ecosystem context. Nullable — most ledger events are platform-wide. */
  tenant_id?: string | null;
  brand_id?: string | null;
  created_at: Date;
}

class EventLedger extends Model<EventLedgerAttributes> implements EventLedgerAttributes {
  declare id: string;
  declare event_type: string;
  declare actor: string;
  declare entity_type: string;
  declare entity_id: string;
  declare payload: any;
  declare tenant_id: string | null;
  declare brand_id: string | null;
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
    // --- multi-tenant ecosystem context ---------------------------------------
    // Declared because the DDL adds these columns and Sequelize only touches
    // attributes the model knows about. A column present in Postgres but absent
    // here reads back undefined and silently drops writes.
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    brand_id: { type: DataTypes.UUID, allowNull: true },
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
