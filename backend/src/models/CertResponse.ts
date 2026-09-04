import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CertResponse — one answered item within a session.
 *
 * `is_correct` is computed SERVER-SIDE from the stored revision's answer key. The
 * client sends only which options were selected; it never sends correctness, a
 * score, or the revision it "thinks" it saw. Trusting any of those would let a
 * student mark their own paper and inflate a readiness score the badge depends on.
 *
 * The unique (session_id, question_key) index makes submission idempotent: a
 * duplicate or retried submit updates the one row rather than recording a second
 * answer and double-counting it in the score.
 *
 * `question_revision` is stored, not derived, so a later edit to the question
 * cannot retroactively change whether this answer was right.
 *
 * Columns must match backend/src/db/ensureCertPrepSchema.ts EXACTLY.
 */

export interface CertResponseAttributes {
  id?: string;
  session_id: string;
  enrollment_id: string;
  question_key: string;
  question_revision: number;
  domain_id: string;
  selected_keys?: string[];
  is_correct?: boolean | null;
  time_ms?: number | null;
  rationale_viewed?: boolean;
  answered_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

class CertResponse extends Model<CertResponseAttributes> implements CertResponseAttributes {
  declare id: string;
  declare session_id: string;
  declare enrollment_id: string;
  declare question_key: string;
  declare question_revision: number;
  declare domain_id: string;
  declare selected_keys: string[];
  declare is_correct: boolean | null;
  declare time_ms: number | null;
  declare rationale_viewed: boolean;
  declare answered_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

CertResponse.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'cert_sessions', key: 'id' } },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'enrollments', key: 'id' } },
    question_key: { type: DataTypes.STRING(60), allowNull: false },
    question_revision: { type: DataTypes.INTEGER, allowNull: false },
    domain_id: { type: DataTypes.STRING(40), allowNull: false },
    selected_keys: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    is_correct: { type: DataTypes.BOOLEAN, allowNull: true },
    time_ms: { type: DataTypes.INTEGER, allowNull: true },
    rationale_viewed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    answered_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cert_responses',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default CertResponse;
