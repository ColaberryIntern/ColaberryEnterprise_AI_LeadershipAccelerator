import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class DepartmentKpi extends Model {
  declare id: string;
  declare company_id: string;
  declare department_name: string;
  declare kpi_name: string;
  declare target_value: number;
  declare current_value: number;
  declare measurement_unit: string;
  declare trend: string;
  declare last_evaluated_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DepartmentKpi.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    department_name: { type: DataTypes.STRING(100), allowNull: false },
    kpi_name: { type: DataTypes.STRING(200), allowNull: false },
    target_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    current_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    measurement_unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '%' },
    trend: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unknown' },
    last_evaluated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'department_kpis', timestamps: true, underscored: true }
);

export default DepartmentKpi;
