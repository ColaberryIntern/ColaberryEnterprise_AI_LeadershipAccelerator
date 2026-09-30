import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CertReadinessSnapshot — append-only readiness history for one enrollment.
 *
 * Append-only matters. A change to the scoring policy inserts new snapshots and
 * never rewrites old ones, so an instructor sees genuine progress over time rather
 * than a curve retroactively restated by a formula change. Every row carries the
 * `blueprint_version` and `readiness_policy_version` it was computed under.
 *
 * The components are stored SEPARATELY from the headline number on purpose. A
 * single opaque score cannot be explained to a student who asks why it moved, and
 * an unexplainable score is not a credential anyone should trust:
 *   - knowledge_scaled       what practice performance says
 *   - evidence_coverage_pct  how much of the blueprint their real builds cover
 *   - sample_confidence      how much practice actually backs the number
 *   - weights_available      whether official domain weights were known at all
 *
 * `weights_available=false` means the blueprint weights were still unverified when
 * this was computed, so the number is a coverage estimate rather than an
 * exam-weighted one. The UI must say so rather than present false precision.
 *
 * `overall_state` is the honest, coarse answer — prefer it over the number in copy.
 *
 * Columns must match backend/src/db/ensureCertPrepSchema.ts EXACTLY.
 */

export type CertReadinessState = 'not_measured' | 'building' | 'approaching' | 'sustained';

export interface CertDomainReadiness {
  domain_id: string;
  knowledge_pct: number | null;
  answered: number;
  evidence_verified: number;
  objectives_total: number;
  objectives_evidenced: number;
}

export interface CertReadinessSnapshotAttributes {
  id?: string;
  enrollment_id: string;
  track_id: string;
  blueprint_version: string;
  readiness_policy_version: string;
  knowledge_scaled?: number | null;
  evidence_coverage_pct?: number | null;
  sample_confidence?: number | null;
  overall_scaled?: number | null;
  overall_state?: CertReadinessState;
  weights_available?: boolean;
  domain_breakdown?: CertDomainReadiness[];
  computed_at?: Date;
}

class CertReadinessSnapshot
  extends Model<CertReadinessSnapshotAttributes>
  implements CertReadinessSnapshotAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare track_id: string;
  declare blueprint_version: string;
  declare readiness_policy_version: string;
  declare knowledge_scaled: number | null;
  declare evidence_coverage_pct: number | null;
  declare sample_confidence: number | null;
  declare overall_scaled: number | null;
  declare overall_state: CertReadinessState;
  declare weights_available: boolean;
  declare domain_breakdown: CertDomainReadiness[];
  declare computed_at: Date;
}

CertReadinessSnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'enrollments', key: 'id' } },
    track_id: { type: DataTypes.STRING(40), allowNull: false },
    blueprint_version: { type: DataTypes.STRING(40), allowNull: false },
    readiness_policy_version: { type: DataTypes.STRING(40), allowNull: false },
    knowledge_scaled: { type: DataTypes.INTEGER, allowNull: true },
    evidence_coverage_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    sample_confidence: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    overall_scaled: { type: DataTypes.INTEGER, allowNull: true },
    overall_state: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'not_measured' },
    weights_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    domain_breakdown: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    computed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cert_readiness_snapshots',
    timestamps: false,
  },
);

export default CertReadinessSnapshot;
