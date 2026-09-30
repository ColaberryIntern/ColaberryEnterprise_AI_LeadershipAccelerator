import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CertQuestionRevision — the CONTENT of a practice item at one revision.
 *
 * THIS IS THE ONLY TABLE THAT HOLDS ANSWER DATA. `correct_keys`,
 * `distractor_rationales` and `rationale` must never reach a client before that
 * item has been submitted — the serving path selects an explicit safe column list
 * rather than the whole row, and the schema contract test asserts no other table
 * carries `correct_keys`. If you add an answer-bearing column, add it here and
 * nowhere else.
 *
 * Revisions are append-only in practice: editing an approved question inserts a
 * new revision rather than rewriting this one, so an attempt answered last month
 * still resolves to the exact wording and key the student actually saw.
 * `cert_responses.question_revision` is what makes that resolvable.
 *
 * `review_status` is the publication gate. ONLY 'approved' may be served. AI may
 * draft an item, but a draft has never been read by a human and a wrong answer key
 * is worse than no practice at all, so nothing leaves 'draft' without a reviewer.
 *
 * `select_count` states how many options to pick, mirroring the real exam's
 * multi-response items which always tell the candidate the number.
 *
 * Columns must match backend/src/db/ensureCertPrepSchema.ts EXACTLY.
 */

export type CertReviewStatus = 'draft' | 'in_review' | 'approved' | 'retired';
export type CertDifficulty = 'easy' | 'medium' | 'hard';

export interface CertQuestionOption {
  key: string;   // 'A' | 'B' | ...
  text: string;
}

export interface CertQuestionRevisionAttributes {
  id?: string;
  question_key: string;
  revision: number;
  blueprint_version: string;
  domain_id: string;
  objective_id?: string | null;
  stem: string;
  options?: CertQuestionOption[];
  correct_keys?: string[];
  select_count?: number;
  rationale: string;
  distractor_rationales?: Record<string, string>;
  difficulty?: CertDifficulty;
  variant_template?: any;
  author?: string | null;
  reviewer?: string | null;
  review_status?: CertReviewStatus;
  reviewed_at?: Date | null;
  active_from?: Date | null;
  active_to?: Date | null;
  exposure_count?: number;
  correct_count?: number;
  created_at?: Date;
  updated_at?: Date;
}

class CertQuestionRevision
  extends Model<CertQuestionRevisionAttributes>
  implements CertQuestionRevisionAttributes {
  declare id: string;
  declare question_key: string;
  declare revision: number;
  declare blueprint_version: string;
  declare domain_id: string;
  declare objective_id: string | null;
  declare stem: string;
  declare options: CertQuestionOption[];
  declare correct_keys: string[];
  declare select_count: number;
  declare rationale: string;
  declare distractor_rationales: Record<string, string>;
  declare difficulty: CertDifficulty;
  declare variant_template: any;
  declare author: string | null;
  declare reviewer: string | null;
  declare review_status: CertReviewStatus;
  declare reviewed_at: Date | null;
  declare active_from: Date | null;
  declare active_to: Date | null;
  declare exposure_count: number;
  declare correct_count: number;
  declare created_at: Date;
  declare updated_at: Date;
}

/**
 * The columns that are safe to send to a student BEFORE they submit. Import this
 * rather than hand-listing attributes at each call site — a serving path that
 * forgets one omission leaks the answer key, and that failure is silent.
 */
export const CERT_QUESTION_SAFE_ATTRIBUTES = [
  'question_key',
  'revision',
  'blueprint_version',
  'domain_id',
  'objective_id',
  'stem',
  'options',
  'select_count',
  'difficulty',
] as const;

/** Answer-bearing columns. Never include these in a pre-submission payload. */
export const CERT_QUESTION_ANSWER_ATTRIBUTES = [
  'correct_keys',
  'rationale',
  'distractor_rationales',
] as const;

CertQuestionRevision.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    question_key: { type: DataTypes.STRING(60), allowNull: false },
    revision: { type: DataTypes.INTEGER, allowNull: false },
    blueprint_version: { type: DataTypes.STRING(40), allowNull: false },
    domain_id: { type: DataTypes.STRING(40), allowNull: false },
    objective_id: { type: DataTypes.STRING(60), allowNull: true },
    stem: { type: DataTypes.TEXT, allowNull: false },
    options: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    correct_keys: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    select_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    rationale: { type: DataTypes.TEXT, allowNull: false },
    distractor_rationales: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    difficulty: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'medium' },
    variant_template: { type: DataTypes.JSONB, allowNull: true },
    author: { type: DataTypes.STRING(255), allowNull: true },
    reviewer: { type: DataTypes.STRING(255), allowNull: true },
    review_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    active_from: { type: DataTypes.DATE, allowNull: true },
    active_to: { type: DataTypes.DATE, allowNull: true },
    exposure_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    correct_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    tableName: 'cert_question_revisions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default CertQuestionRevision;
