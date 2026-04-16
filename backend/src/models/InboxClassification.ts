import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ClassificationState = 'INBOX' | 'AUTOMATION' | 'SILENT_HOLD' | 'ASK_USER';

interface InboxClassificationAttributes {
  id?: string;
  email_id: string;
  state: ClassificationState;
  confidence?: number;
  classified_by?: string;
  rule_id?: string | null;
  reasoning?: string | null;
  reply_needed?: boolean;
  classified_at: Date;
  overridden_at?: Date | null;
  previous_state?: string | null;
}

class InboxClassification extends Model<InboxClassificationAttributes> implements InboxClassificationAttributes {
  declare id: string;
  declare email_id: string;
  declare state: ClassificationState;
  declare confidence: number;
  declare classified_by: string;
  declare rule_id: string | null;
  declare reasoning: string | null;
  declare reply_needed: boolean;
  declare classified_at: Date;
  declare overridden_at: Date | null;
  declare previous_state: string | null;
}

InboxClassification.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inbox_emails', key: 'id' },
    },
    state: {
      type: DataTypes.ENUM('INBOX', 'AUTOMATION', 'SILENT_HOLD', 'ASK_USER'),
      allowNull: false,
    },
    confidence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    classified_by: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    rule_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reply_needed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    classified_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    overridden_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    previous_state: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'inbox_classifications',
    timestamps: false,
    indexes: [
      {
        fields: ['state'],
        name: 'idx_inbox_classifications_state',
      },
      {
        fields: ['email_id'],
        name: 'idx_inbox_classifications_email_id',
      },
      {
        fields: ['classified_at'],
        name: 'idx_inbox_classifications_classified_at',
      },
    ],
  }
);

export default InboxClassification;
