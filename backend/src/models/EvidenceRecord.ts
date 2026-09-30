import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * EvidenceRecord — the currency of progression. Each validated piece of
 * evidence (prompt lab, GitHub commit/PR, artifact, review, deliverable)
 * awards Builder XP and contributes weighted competency signal.
 *
 * `idempotency_key` (unique) makes recording replay-safe: the same evidence
 * from the same source is never counted twice.
 */
export type EvidenceSource =
  | 'prompt_lab' | 'github_commit' | 'github_pr' | 'artifact' | 'peer_review'
  | 'instructor_review' | 'deliverable' | 'implementation' | 'portfolio';

export interface EvidenceRecordAttributes {
  id?: string;
  enrollment_id: string;
  card_id?: string | null;
  source_type: EvidenceSource;
  source_ref?: string | null;
  competency_weights?: any;   // [{domain_id, weight}]
  builder_xp?: number;
  validated?: boolean;
  idempotency_key: string;
  created_at?: Date;
}

class EvidenceRecord extends Model<EvidenceRecordAttributes> implements EvidenceRecordAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare card_id: string | null;
  declare source_type: EvidenceSource;
  declare source_ref: string | null;
  declare competency_weights: any;
  declare builder_xp: number;
  declare validated: boolean;
  declare idempotency_key: string;
  declare created_at: Date;
}

EvidenceRecord.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    card_id: { type: DataTypes.UUID, allowNull: true },
    source_type: { type: DataTypes.STRING(30), allowNull: false },
    source_ref: { type: DataTypes.STRING(255), allowNull: true },
    competency_weights: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    builder_xp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    validated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    idempotency_key: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'evidence_records',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['idempotency_key'] },
      { fields: ['enrollment_id'] },
      { fields: ['card_id'] },
      { fields: ['source_type'] },
    ],
  }
);

export default EvidenceRecord;
