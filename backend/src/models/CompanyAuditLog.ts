import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class CompanyAuditLog extends Model {
  declare id: string;
  declare company_id: string;
  declare event_type: string;
  declare actor: string;
  declare detail: Record<string, any>;
  declare created_at: Date;
}

CompanyAuditLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    event_type: { type: DataTypes.STRING(50), allowNull: false },
    actor: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'CEO_AGENT' },
    detail: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'company_audit_log',
    timestamps: true,
    underscored: true,
    updatedAt: false,
    indexes: [{ fields: ['company_id', 'event_type'] }],
  }
);

export default CompanyAuditLog;
