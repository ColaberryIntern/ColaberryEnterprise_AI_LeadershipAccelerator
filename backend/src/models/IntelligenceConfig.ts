import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface IntelligenceConfigAttributes {
  id?: number;
  config_key: string;
  config_value?: Record<string, any>;
  updated_at?: Date;
}

class IntelligenceConfig extends Model<IntelligenceConfigAttributes> implements IntelligenceConfigAttributes {
  declare id: number;
  declare config_key: string;
  declare config_value: Record<string, any>;
  declare updated_at: Date;
}

IntelligenceConfig.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    config_key: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true,
    },
    config_value: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'intelligence_config',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['config_key'] },
    ],
  }
);

export default IntelligenceConfig;
