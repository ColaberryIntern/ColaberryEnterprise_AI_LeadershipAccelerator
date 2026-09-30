import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A file a student handed to an agent (Cory, Reese) — a screenshot, a diagram,
 * a PDF — so the agent can look at it alongside their message.
 *
 * Ownership lives here rather than in the chat payload: the chat request only
 * carries an id, so "is this yours" is a row lookup, not a trust decision about
 * a request body. `sha256` + the unique index on (enrollment_id, sha256) make
 * re-uploading the same bytes idempotent.
 *
 * Bytes live on the persistent `uploads` volume (stored_name), not in the DB —
 * these are chat attachments, potentially many per student, and a Postgres row
 * per screenshot is the wrong place for megabytes.
 */
export interface AgentAttachmentAttributes {
  id?: string;
  enrollment_id: string;
  sha256: string;
  mime: string;
  byte_size: number;
  /** Original name as the student's browser reported it (display only). */
  filename: string;
  /** Opaque on-disk name (uuid + ext) inside AGENT_ATTACHMENT_DIR. */
  stored_name: string;
  created_at?: Date;
}

class AgentAttachment extends Model<AgentAttachmentAttributes> implements AgentAttachmentAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare sha256: string;
  declare mime: string;
  declare byte_size: number;
  declare filename: string;
  declare stored_name: string;
  declare created_at: Date;
}

AgentAttachment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    sha256: { type: DataTypes.STRING(64), allowNull: false },
    mime: { type: DataTypes.STRING(100), allowNull: false },
    byte_size: { type: DataTypes.INTEGER, allowNull: false },
    filename: { type: DataTypes.STRING(255), allowNull: false },
    stored_name: { type: DataTypes.STRING(255), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'AgentAttachment',
    tableName: 'agent_attachments',
    timestamps: false,
    indexes: [{ unique: true, fields: ['enrollment_id', 'sha256'] }],
  },
);

export default AgentAttachment;
