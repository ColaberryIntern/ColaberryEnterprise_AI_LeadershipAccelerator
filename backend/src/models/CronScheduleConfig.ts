import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface CronScheduleConfigAttributes {
  id: string;
  agent_name: string;
  default_schedule: string;
  active_schedule: string;
  enabled: boolean;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

class CronScheduleConfig extends Model<CronScheduleConfigAttributes> implements CronScheduleConfigAttributes {
  declare id: string;
  declare agent_name: string;
  declare default_schedule: string;
  declare active_schedule: string;
  declare enabled: boolean;
  declare updated_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CronScheduleConfig.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    agent_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    default_schedule: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    active_schedule: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    updated_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'cron_schedule_configs',
    timestamps: false,
  }
);

export default CronScheduleConfig;
