import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface SystemSettingAttributes {
  id: string;
  key: string;
  value: any;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

class SystemSetting extends Model<SystemSettingAttributes> implements SystemSettingAttributes {
  declare id: string;
  declare key: string;
  declare value: any;
  declare updated_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

SystemSetting.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    updated_by: {
      type: DataTypes.UUID,
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
    tableName: 'system_settings',
    timestamps: false,
  }
);

export default SystemSetting;
