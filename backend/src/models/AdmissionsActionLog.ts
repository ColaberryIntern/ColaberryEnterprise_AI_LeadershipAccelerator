import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AdmissionsActionLogAttributes {
  id?: string;
  visitor_id: string;
  conversation_id?: string | null;
  action_type: string;
  action_details?: Record<string, any>;
  status?: string;
  agent_name: string;
  created_at?: Date;
}

class AdmissionsActionLog extends Model<AdmissionsActionLogAttributes> implements AdmissionsActionLogAttributes {
  declare id: string;
  declare visitor_id: string;
  declare conversation_id: string | null;
  declare action_type: string;
  declare action_details: Record<string, any>;
  declare status: string;
  declare agent_name: string;
  declare created_at: Date;
}

AdmissionsActionLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    visitor_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    conversation_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    action_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    action_details: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    agent_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'admissions_action_logs',
    timestamps: false,
    indexes: [
      { fields: ['visitor_id'] },
      { fields: ['action_type'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  }
);

export default AdmissionsActionLog;
