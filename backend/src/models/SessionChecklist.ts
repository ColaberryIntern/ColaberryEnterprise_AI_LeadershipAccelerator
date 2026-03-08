import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface SessionChecklistAttributes {
  id?: string;
  session_id: string;
  checklist_item: string;
  description?: string;
  item_type?: 'tool_setup' | 'account_creation' | 'reading' | 'prerequisite' | 'custom';
  is_collected?: boolean;
  sort_order?: number;
  created_at?: Date;
}

class SessionChecklist extends Model<SessionChecklistAttributes> implements SessionChecklistAttributes {
  declare id: string;
  declare session_id: string;
  declare checklist_item: string;
  declare description: string;
  declare item_type: 'tool_setup' | 'account_creation' | 'reading' | 'prerequisite' | 'custom';
  declare is_collected: boolean;
  declare sort_order: number;
  declare created_at: Date;
}

SessionChecklist.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'live_sessions', key: 'id' },
    },
    checklist_item: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    item_type: {
      type: DataTypes.ENUM('tool_setup', 'account_creation', 'reading', 'prerequisite', 'custom'),
      allowNull: false,
      defaultValue: 'custom',
    },
    is_collected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'session_checklists',
    timestamps: false,
  }
);

export default SessionChecklist;
