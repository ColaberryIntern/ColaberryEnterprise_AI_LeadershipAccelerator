import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Milestone 2. Join table: which ticket(s) a given evidence_artifacts row is
// attached to. Kept as its own table (rather than a single ticket_id on
// evidence_artifacts alone) so one artifact can later back multiple related tickets
// without duplication, mirroring ticket_action_links' role in Milestone 1. Unique on
// (evidence_id, ticket_id) so re-linking the same artifact to the same ticket is a
// no-op, not a duplicate row (CLAUDE.md Idempotency & Replayability).

export type EvidenceLinkRole = 'primary' | 'related';

interface EvidenceLinkAttributes {
  id?: string;
  evidence_id: string;
  ticket_id: string;
  link_role?: EvidenceLinkRole;
  created_at?: Date;
}

class EvidenceLink extends Model<EvidenceLinkAttributes> implements EvidenceLinkAttributes {
  declare id: string;
  declare evidence_id: string;
  declare ticket_id: string;
  declare link_role: EvidenceLinkRole;
  declare created_at: Date;
}

EvidenceLink.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    evidence_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'evidence_artifacts', key: 'id' } },
    ticket_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'tickets', key: 'id' } },
    link_role: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'primary' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'evidence_links',
    timestamps: false,
    indexes: [
      { fields: ['evidence_id', 'ticket_id'], unique: true },
      { fields: ['ticket_id'] },
      { fields: ['evidence_id'] },
    ],
  }
);

export default EvidenceLink;
