import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type InboxProvider = 'gmail_colaberry' | 'gmail_personal' | 'hotmail';

interface InboxEmailAttributes {
  id?: string;
  provider: InboxProvider;
  provider_message_id: string;
  provider_thread_id?: string | null;
  from_address: string;
  from_name?: string | null;
  to_addresses: any;
  cc_addresses: any;
  subject: string;
  body_text?: string | null;
  body_html?: string | null;
  headers?: any | null;
  received_at: Date;
  synced_at: Date;
  has_attachments?: boolean;
}

class InboxEmail extends Model<InboxEmailAttributes> implements InboxEmailAttributes {
  declare id: string;
  declare provider: InboxProvider;
  declare provider_message_id: string;
  declare provider_thread_id: string | null;
  declare from_address: string;
  declare from_name: string | null;
  declare to_addresses: any;
  declare cc_addresses: any;
  declare subject: string;
  declare body_text: string | null;
  declare body_html: string | null;
  declare headers: any | null;
  declare received_at: Date;
  declare synced_at: Date;
  declare has_attachments: boolean;
}

InboxEmail.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    provider: {
      type: DataTypes.ENUM('gmail_colaberry', 'gmail_personal', 'hotmail'),
      allowNull: false,
    },
    provider_message_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provider_thread_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    from_address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    from_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    to_addresses: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    cc_addresses: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    body_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    body_html: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    headers: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    received_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    synced_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    has_attachments: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'inbox_emails',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['provider', 'provider_message_id'],
        name: 'idx_inbox_emails_provider_msg',
      },
      {
        fields: ['received_at'],
        name: 'idx_inbox_emails_received_at',
      },
      {
        fields: ['from_address'],
        name: 'idx_inbox_emails_from_address',
      },
    ],
  }
);

export default InboxEmail;
