import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface InboxAuditLogAttributes {
  id?: string;
  email_id?: string | null;
  action: string;
  old_state?: string | null;
  new_state?: string | null;
  confidence?: number | null;
  reasoning?: string | null;
  actor?: string;
  metadata?: any | null;
  created_at?: Date;
}

class InboxAuditLog extends Model<InboxAuditLogAttributes> implements InboxAuditLogAttributes {
  declare id: string;
  declare email_id: string | null;
  declare action: string;
  declare old_state: string | null;
  declare new_state: string | null;
  declare confidence: number | null;
  declare reasoning: string | null;
  declare actor: string;
  declare metadata: any | null;
  declare created_at: Date;
}

InboxAuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    old_state: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    new_state: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    confidence: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    actor: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'system',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'inbox_audit_logs',
    timestamps: false,
    indexes: [
      {
        fields: ['email_id'],
        name: 'idx_inbox_audit_logs_email_id',
      },
      {
        fields: ['action'],
        name: 'idx_inbox_audit_logs_action',
      },
      {
        fields: ['created_at'],
        name: 'idx_inbox_audit_logs_created_at',
      },
    ],
  }
);

export default InboxAuditLog;
