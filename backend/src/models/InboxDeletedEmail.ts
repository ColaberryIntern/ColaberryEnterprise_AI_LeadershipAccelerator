import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { InboxProvider } from './InboxEmail';

// Emails found in Trash/Spam (Gmail TRASH/SPAM, Hotmail Deleted Items/Junk).
// These never enter the Inbox COS classification pipeline, so they live in
// their own table. The Missed Opportunities Report scores them on read to power
// the "Deleted But Potentially Valuable" recovery section.

export type DeletedFolder = 'trash' | 'spam';

interface InboxDeletedEmailAttributes {
  id?: string;
  provider: InboxProvider;
  provider_message_id: string;
  folder: DeletedFolder;
  from_address: string;
  from_name?: string | null;
  to_addresses: any;
  subject: string;
  body_text?: string | null;
  body_html?: string | null;
  headers?: any | null;
  received_at: Date;
  discovered_at: Date;
  has_attachments?: boolean;
}

class InboxDeletedEmail extends Model<InboxDeletedEmailAttributes> implements InboxDeletedEmailAttributes {
  declare id: string;
  declare provider: InboxProvider;
  declare provider_message_id: string;
  declare folder: DeletedFolder;
  declare from_address: string;
  declare from_name: string | null;
  declare to_addresses: any;
  declare subject: string;
  declare body_text: string | null;
  declare body_html: string | null;
  declare headers: any | null;
  declare received_at: Date;
  declare discovered_at: Date;
  declare has_attachments: boolean;
}

InboxDeletedEmail.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    provider: { type: DataTypes.ENUM('gmail_colaberry', 'gmail_personal', 'hotmail'), allowNull: false },
    provider_message_id: { type: DataTypes.STRING, allowNull: false },
    folder: { type: DataTypes.ENUM('trash', 'spam'), allowNull: false },
    from_address: { type: DataTypes.STRING, allowNull: false },
    from_name: { type: DataTypes.STRING, allowNull: true },
    to_addresses: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    subject: { type: DataTypes.STRING, allowNull: false },
    body_text: { type: DataTypes.TEXT, allowNull: true },
    body_html: { type: DataTypes.TEXT, allowNull: true },
    headers: { type: DataTypes.JSONB, allowNull: true },
    received_at: { type: DataTypes.DATE, allowNull: false },
    discovered_at: { type: DataTypes.DATE, allowNull: false },
    has_attachments: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'inbox_deleted_emails',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['provider', 'provider_message_id'], name: 'idx_inbox_deleted_provider_msg' },
      { fields: ['received_at'], name: 'idx_inbox_deleted_received_at' },
      { fields: ['folder'], name: 'idx_inbox_deleted_folder' },
    ],
  }
);

export default InboxDeletedEmail;
