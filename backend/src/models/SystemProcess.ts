import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface SystemProcessAttributes {
  id?: string;
  process_name: string;
  source_module?: string;
  event_type?: string;
  execution_time_ms?: number;
  status?: string;
  metadata?: Record<string, any>;
  error_message?: string;
  created_at?: Date;
}

class SystemProcess extends Model<SystemProcessAttributes> implements SystemProcessAttributes {
  declare id: string;
  declare process_name: string;
  declare source_module: string;
  declare event_type: string;
  declare execution_time_ms: number;
  declare status: string;
  declare metadata: Record<string, any>;
  declare error_message: string;
  declare created_at: Date;
}

SystemProcess.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    process_name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    source_module: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    event_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    execution_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'completed',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    error_message: {
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
    tableName: 'system_processes',
    timestamps: false,
    indexes: [
      { fields: ['process_name'] },
      { fields: ['source_module'] },
      { fields: ['event_type'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  }
);

export default SystemProcess;
