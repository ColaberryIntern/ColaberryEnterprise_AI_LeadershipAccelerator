import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class CompanyDirective extends Model {
  declare id: string;
  declare company_id: string;
  declare source: string;
  declare priority: string;
  declare target_department: string;
  declare objective: string;
  declare constraints: Record<string, any>;
  declare status: string;
  declare cory_decision_id: string | null;
  declare result_summary: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CompanyDirective.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    source: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'CEO_AGENT' },
    priority: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'medium' },
    target_department: { type: DataTypes.STRING(100), allowNull: false },
    objective: { type: DataTypes.TEXT, allowNull: false },
    constraints: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'proposed' },
    cory_decision_id: { type: DataTypes.UUID, allowNull: true },
    result_summary: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'company_directives',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['company_id', 'status'] },
      { fields: ['company_id', 'target_department'] },
    ],
  }
);

export default CompanyDirective;
