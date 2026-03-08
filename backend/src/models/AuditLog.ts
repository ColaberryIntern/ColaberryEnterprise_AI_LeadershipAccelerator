import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class AuditLog extends Model {
  declare id: string;
  declare admin_user_id: string | null;
  declare action: string;
  declare entity_type: string;
  declare entity_id: string | null;
  declare old_values: any;
  declare new_values: any;
  declare ip_address: string | null;
  declare created_at: Date;
}

AuditLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    admin_user_id: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING(50), allowNull: false },
    entity_type: { type: DataTypes.STRING(100), allowNull: false },
    entity_id: { type: DataTypes.UUID, allowNull: true },
    old_values: { type: DataTypes.JSONB, allowNull: true },
    new_values: { type: DataTypes.JSONB, allowNull: true },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'audit_logs',
    timestamps: false,
  }
);

export default AuditLog;
