import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class CompanyGoal extends Model {
  declare id: string;
  declare company_id: string;
  declare goal_name: string;
  declare goal_type: string;
  declare target_value: number;
  declare current_value: number;
  declare measurement_unit: string;
  declare priority: string;
  declare status: string;
  declare deadline: Date | null;
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

CompanyGoal.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    goal_name: { type: DataTypes.STRING(300), allowNull: false },
    goal_type: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'custom' },
    target_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    current_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    measurement_unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '%' },
    priority: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'medium' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    deadline: { type: DataTypes.DATEONLY, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  { sequelize, tableName: 'company_goals', timestamps: true, underscored: true }
);

export default CompanyGoal;
