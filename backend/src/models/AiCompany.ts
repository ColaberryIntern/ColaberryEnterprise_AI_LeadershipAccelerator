import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class AiCompany extends Model {
  declare id: string;
  declare name: string;
  declare industry: string | null;
  declare target_mode: string;
  declare status: string;
  declare settings: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

AiCompany.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    industry: { type: DataTypes.STRING(100), allowNull: true },
    target_mode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'production' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  { sequelize, tableName: 'ai_companies', timestamps: true, underscored: true }
);

export default AiCompany;
