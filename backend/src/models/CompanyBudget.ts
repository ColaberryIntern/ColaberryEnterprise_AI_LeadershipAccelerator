import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class CompanyBudget extends Model {
  declare id: string;
  declare company_id: string;
  declare department_name: string;
  declare allocated_budget: number;
  declare spent_budget: number;
  declare roi_target: number;
  declare roi_actual: number;
  declare period: string;
  declare created_at: Date;
  declare updated_at: Date;
}

CompanyBudget.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    department_name: { type: DataTypes.STRING(100), allowNull: false },
    allocated_budget: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    spent_budget: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    roi_target: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    roi_actual: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    period: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'monthly' },
  },
  { sequelize, tableName: 'company_budgets', timestamps: true, underscored: true }
);

export default CompanyBudget;
