import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { COMMITMENT_SOURCES, COMMITMENT_STATUSES, CommitmentSource, CommitmentStatus } from '../types/inboxCase';

// /inbox-zero commitment ledger (T8): a promise ALI made — to whom, by when,
// and whether it has been kept. The mirror image of the WAITING ledger
// (what others owe Ali). Rows are written by commitmentLedgerService from
// the assessment's commitments_made (and, behind a default-OFF flag, from
// Ali's sent mail); (case_id, statement_hash) is unique so re-planning
// never duplicates a promise. Columns must match db/ensureInboxCommitmentSchema.ts.

interface InboxCommitmentAttributes {
  id?: string;
  case_id: string;
  statement: string;
  statement_hash: string;
  owed_to: string | null;
  due_at: Date | null;
  status: CommitmentStatus;
  source: CommitmentSource;
  source_item_id: string | null;
  fulfilled_at: Date | null;
  correlation_id: string;
  created_at?: Date;
  updated_at?: Date;
}

class InboxCommitment extends Model<InboxCommitmentAttributes> implements InboxCommitmentAttributes {
  declare id: string;
  declare case_id: string;
  declare statement: string;
  declare statement_hash: string;
  declare owed_to: string | null;
  declare due_at: Date | null;
  declare status: CommitmentStatus;
  declare source: CommitmentSource;
  declare source_item_id: string | null;
  declare fulfilled_at: Date | null;
  declare correlation_id: string;
  declare created_at: Date;
  declare updated_at: Date;
}

InboxCommitment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_id: { type: DataTypes.UUID, allowNull: false },
    statement: { type: DataTypes.TEXT, allowNull: false },
    statement_hash: { type: DataTypes.STRING(64), allowNull: false },
    owed_to: { type: DataTypes.STRING(255), allowNull: true },
    due_at: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'OPEN', validate: { isIn: [[...COMMITMENT_STATUSES]] } },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'assessment', validate: { isIn: [[...COMMITMENT_SOURCES]] } },
    source_item_id: { type: DataTypes.UUID, allowNull: true },
    fulfilled_at: { type: DataTypes.DATE, allowNull: true },
    correlation_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'inbox_commitments',
    timestamps: false,
    indexes: [
      { fields: ['case_id', 'statement_hash'], name: 'uq_inbox_commitments_case_statement', unique: true },
      { fields: ['status', 'due_at'], name: 'idx_inbox_commitments_status_due' },
      { fields: ['case_id'], name: 'idx_inbox_commitments_case_id' },
    ],
  }
);

export default InboxCommitment;
