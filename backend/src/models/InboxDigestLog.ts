import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface InboxDigestLogAttributes {
  id?: string;
  email_ids: any;
  digest_html?: string | null;
  sent_to?: string | null;
  sent_at?: Date | null;
  actions_taken?: any;
}

class InboxDigestLog extends Model<InboxDigestLogAttributes> implements InboxDigestLogAttributes {
  declare id: string;
  declare email_ids: any;
  declare digest_html: string | null;
  declare sent_to: string | null;
  declare sent_at: Date | null;
  declare actions_taken: any;
}

InboxDigestLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email_ids: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    digest_html: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sent_to: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    actions_taken: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    sequelize,
    tableName: 'inbox_digest_logs',
    timestamps: false,
  }
);

export default InboxDigestLog;
