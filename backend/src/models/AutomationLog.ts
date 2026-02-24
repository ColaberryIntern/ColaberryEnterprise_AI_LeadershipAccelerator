import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface AutomationLogAttributes {
  id?: string;
  type: 'email' | 'voice_call';
  related_type: string;
  related_id: string;
  status: 'success' | 'failed';
  provider_response?: string;
  created_at?: Date;
}

class AutomationLog extends Model<AutomationLogAttributes> implements AutomationLogAttributes {
  declare id: string;
  declare type: 'email' | 'voice_call';
  declare related_type: string;
  declare related_id: string;
  declare status: 'success' | 'failed';
  declare provider_response: string;
  declare created_at: Date;
}

AutomationLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM('email', 'voice_call'),
      allowNull: false,
    },
    related_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    related_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('success', 'failed'),
      allowNull: false,
    },
    provider_response: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'automation_logs',
    timestamps: false,
  }
);

export default AutomationLog;
