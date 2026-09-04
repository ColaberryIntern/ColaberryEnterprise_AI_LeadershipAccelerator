import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CertEvidenceMapping — "this artifact the student already built demonstrates this
 * blueprint objective".
 *
 * THIS TABLE HOLDS NO ARTIFACT. The artifact stays in its canonical home —
 * evidence_records, portfolio_artifacts, project_artifacts, a timeline card — and
 * this row carries only the certification-specific metadata: which objective it
 * satisfies, why, and who confirmed it. Copying artifacts in here would create a
 * second source of truth that silently rots the moment the original changes.
 *
 * A STUDENT CANNOT SELF-VERIFY. Auto-matched candidates land as 'pending' and only
 * an instructor path moves a row to 'verified'. Readiness counts verified evidence,
 * so self-verification would let a student inflate the number the badge rests on.
 *
 * `source_id` is a VARCHAR rather than a UUID because the canonical sources do not
 * all key the same way (timeline cards are string ids). It carries no foreign key
 * for the same reason, so a mapping must tolerate its artifact having been deleted
 * — resolve defensively and treat an unresolvable source as missing evidence, not
 * as a crash.
 *
 * Columns must match backend/src/db/ensureCertPrepSchema.ts EXACTLY.
 */

export type CertEvidenceSourceType =
  | 'evidence_record'
  | 'portfolio_artifact'
  | 'project_artifact'
  | 'timeline_card'
  | 'capability';

export type CertMappingState = 'pending' | 'verified' | 'rejected';

export interface CertEvidenceMappingAttributes {
  id?: string;
  enrollment_id: string;
  track_id: string;
  blueprint_version: string;
  domain_id: string;
  objective_id?: string | null;
  source_type: CertEvidenceSourceType;
  source_id: string;
  mapping_state?: CertMappingState;
  mapping_rationale?: string | null;
  auto_matched?: boolean;
  verified_by?: string | null;
  verified_at?: Date | null;
  rejected_reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class CertEvidenceMapping
  extends Model<CertEvidenceMappingAttributes>
  implements CertEvidenceMappingAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare track_id: string;
  declare blueprint_version: string;
  declare domain_id: string;
  declare objective_id: string | null;
  declare source_type: CertEvidenceSourceType;
  declare source_id: string;
  declare mapping_state: CertMappingState;
  declare mapping_rationale: string | null;
  declare auto_matched: boolean;
  declare verified_by: string | null;
  declare verified_at: Date | null;
  declare rejected_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CertEvidenceMapping.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'enrollments', key: 'id' } },
    track_id: { type: DataTypes.STRING(40), allowNull: false },
    blueprint_version: { type: DataTypes.STRING(40), allowNull: false },
    domain_id: { type: DataTypes.STRING(40), allowNull: false },
    objective_id: { type: DataTypes.STRING(60), allowNull: true },
    source_type: { type: DataTypes.STRING(40), allowNull: false },
    // Intentionally not a UUID and intentionally unconstrained — see the header.
    source_id: { type: DataTypes.STRING(64), allowNull: false },
    mapping_state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    mapping_rationale: { type: DataTypes.TEXT, allowNull: true },
    auto_matched: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    verified_by: { type: DataTypes.STRING(255), allowNull: true },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    rejected_reason: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'cert_evidence_mappings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default CertEvidenceMapping;
