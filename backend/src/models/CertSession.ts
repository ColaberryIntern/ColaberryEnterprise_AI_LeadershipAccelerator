import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CertSession — one diagnostic, practice or mock sitting.
 *
 * `question_keys` stores the ORDERED SERVED FORM as [{ question_key, revision }],
 * not just the keys. That is what lets a resumed session show the same items in
 * the same order, and a re-score resolve to the exact wording and answer key the
 * student saw even if the question has since been revised.
 *
 * `idempotency_key` makes a retried "start" return the existing session rather
 * than minting a second one — a double-tapped Start button, or a client retry
 * after a timeout, must not create two attempts or two point awards. The unique
 * partial index in ensureCertPrepSchema enforces it.
 *
 * `scaled_score` is computed server-side only and is a COLABERRY READINESS
 * ESTIMATE presented on the same 0–1000 scale as the real exam. It is not an
 * Anthropic score and no copy may present it as one.
 *
 * Columns must match backend/src/db/ensureCertPrepSchema.ts EXACTLY.
 */

export type CertSessionMode = 'diagnostic' | 'practice' | 'mock';
export type CertSessionStatus = 'in_progress' | 'completed' | 'expired' | 'abandoned';

/** One served item: the key plus the revision the student was actually shown. */
export interface CertServedItem {
  question_key: string;
  revision: number;
}

/** Per-domain roll-up written at completion. */
export interface CertDomainResult {
  domain_id: string;
  correct: number;
  total: number;
  pct: number; // 0..1
}

export interface CertSessionAttributes {
  id?: string;
  enrollment_id: string;
  cohort_id?: string | null;
  track_id: string;
  mode: CertSessionMode;
  form_version: string;
  blueprint_version: string;
  scoring_policy_version?: string;
  question_keys?: CertServedItem[];
  status?: CertSessionStatus;
  time_limit_seconds?: number | null;
  started_at?: Date;
  expires_at?: Date | null;
  completed_at?: Date | null;
  scaled_score?: number | null;
  correct_count?: number | null;
  total_count?: number | null;
  domain_results?: CertDomainResult[] | null;
  idempotency_key?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class CertSession extends Model<CertSessionAttributes> implements CertSessionAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare cohort_id: string | null;
  declare track_id: string;
  declare mode: CertSessionMode;
  declare form_version: string;
  declare blueprint_version: string;
  declare scoring_policy_version: string;
  declare question_keys: CertServedItem[];
  declare status: CertSessionStatus;
  declare time_limit_seconds: number | null;
  declare started_at: Date;
  declare expires_at: Date | null;
  declare completed_at: Date | null;
  declare scaled_score: number | null;
  declare correct_count: number | null;
  declare total_count: number | null;
  declare domain_results: CertDomainResult[] | null;
  declare idempotency_key: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CertSession.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'enrollments', key: 'id' } },
    cohort_id: { type: DataTypes.UUID, allowNull: true },
    track_id: { type: DataTypes.STRING(40), allowNull: false },
    mode: { type: DataTypes.STRING(20), allowNull: false },
    form_version: { type: DataTypes.STRING(60), allowNull: false },
    blueprint_version: { type: DataTypes.STRING(40), allowNull: false },
    scoring_policy_version: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'v1' },
    question_keys: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'in_progress' },
    time_limit_seconds: { type: DataTypes.INTEGER, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    scaled_score: { type: DataTypes.INTEGER, allowNull: true },
    correct_count: { type: DataTypes.INTEGER, allowNull: true },
    total_count: { type: DataTypes.INTEGER, allowNull: true },
    domain_results: { type: DataTypes.JSONB, allowNull: true },
    idempotency_key: { type: DataTypes.STRING(160), allowNull: true },
  },
  {
    sequelize,
    tableName: 'cert_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default CertSession;
