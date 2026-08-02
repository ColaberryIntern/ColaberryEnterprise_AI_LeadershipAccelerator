import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { TicketActorType } from './Ticket';

// ProofDesk Milestone 2. Spec section 10 "human comment model" — a decision record is
// a durable, typed note about a ticket (approve/reject/override/note) distinct from
// the free-text TicketActivity comment stream. `linked_evidence_ids` lets a decision
// cite the specific evidence_artifacts rows that justified it, without a join table,
// since decisions cite evidence far less often than evidence attaches to tickets.

export type DecisionType = 'approve' | 'reject' | 'override' | 'note';

interface DecisionRecordAttributes {
  id?: string;
  ticket_id: string;
  decision_type: DecisionType;
  actor_type: TicketActorType;
  actor_id: string;
  rationale?: string | null;
  linked_evidence_ids?: string[] | null;
  created_at?: Date;
}

class DecisionRecord extends Model<DecisionRecordAttributes> implements DecisionRecordAttributes {
  declare id: string;
  declare ticket_id: string;
  declare decision_type: DecisionType;
  declare actor_type: TicketActorType;
  declare actor_id: string;
  declare rationale: string | null;
  declare linked_evidence_ids: string[] | null;
  declare created_at: Date;
}

DecisionRecord.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ticket_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'tickets', key: 'id' } },
    decision_type: { type: DataTypes.STRING(20), allowNull: false },
    actor_type: { type: DataTypes.STRING(20), allowNull: false },
    actor_id: { type: DataTypes.STRING(255), allowNull: false },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    linked_evidence_ids: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'decision_records',
    timestamps: false,
    indexes: [
      { fields: ['ticket_id'] },
      { fields: ['decision_type'] },
    ],
  }
);

export default DecisionRecord;
