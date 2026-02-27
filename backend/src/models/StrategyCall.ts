import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface StrategyCallAttributes {
  id?: string;
  name: string;
  email: string;
  company: string;
  phone: string | null;
  scheduled_at: Date;
  timezone: string;
  google_event_id: string;
  meet_link: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
  prep_token?: string;
  lead_id?: number | null;
  created_at?: Date;
}

class StrategyCall extends Model<StrategyCallAttributes> implements StrategyCallAttributes {
  declare id: string;
  declare name: string;
  declare email: string;
  declare company: string;
  declare phone: string | null;
  declare scheduled_at: Date;
  declare timezone: string;
  declare google_event_id: string;
  declare meet_link: string;
  declare status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  declare notes: string | null;
  declare prep_token: string;
  declare lead_id: number | null;
  declare created_at: Date;
}

StrategyCall.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
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
      defaultValue: '',
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    scheduled_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    timezone: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    google_event_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    meet_link: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'scheduled',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    prep_token: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: true,
      unique: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'strategy_calls',
    timestamps: false,
  }
);

export default StrategyCall;
