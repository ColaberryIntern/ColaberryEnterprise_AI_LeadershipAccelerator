import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * StudentSkillEvidence — append-only CAPE skill-evidence ledger (design doc §6,
 * §13). Every row is one scored evidence event: a source, an evidence band
 * (claim/knowledge/application/judgment), a credit amount, and an idempotency key
 * so retries/replays never double-count. `student_architecture_skill` is always
 * FULLY RECOMPUTED from this table (see capeProficiencyService.ts) — this table
 * has NO update or delete code path anywhere in the codebase (see
 * capeEvidenceLedgerService.ts, which exposes only `recordSkillEvidence`, an
 * insert-only `findOrCreate`).
 *
 * idempotency_key formats (design doc §13):
 *   timeline:<enrollment_id>:<card_id>:<skill_id>
 *   classroom:<submission_id>:<skill_id>
 *   diagnostic:<attempt_id>:<skill_id>
 *   resume:<profile_version>:<skill_id>
 * Only the `timeline:` writer is wired to a real signal in Phase 0-1; the others
 * are builder functions only (Phase 2/3 will call them).
 */
export type EvidenceBand = 'claim' | 'knowledge' | 'application' | 'judgment';

export interface StudentSkillEvidenceAttributes {
  id?: string;
  enrollment_id: string;
  skill_id: string;
  band: EvidenceBand;
  credit: number;
  source: string;
  source_ref?: string | null;
  idempotency_key: string;
  mapping_version?: number | null;
  metadata?: Record<string, unknown>;
  created_at?: Date;
}

class StudentSkillEvidence extends Model<StudentSkillEvidenceAttributes>
  implements StudentSkillEvidenceAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare skill_id: string;
  declare band: EvidenceBand;
  declare credit: number;
  declare source: string;
  declare source_ref: string | null;
  declare idempotency_key: string;
  declare mapping_version: number | null;
  declare metadata: Record<string, unknown>;
  declare created_at: Date;
}

StudentSkillEvidence.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    skill_id: { type: DataTypes.STRING(40), allowNull: false },
    band: { type: DataTypes.STRING(20), allowNull: false },
    credit: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    source: { type: DataTypes.STRING(40), allowNull: false },
    source_ref: { type: DataTypes.STRING(255), allowNull: true },
    idempotency_key: { type: DataTypes.STRING(300), allowNull: false, unique: true },
    mapping_version: { type: DataTypes.INTEGER, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'student_skill_evidence',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['idempotency_key'] },
      { fields: ['enrollment_id', 'skill_id'] },
      { fields: ['band'] },
    ],
  }
);

export default StudentSkillEvidence;
