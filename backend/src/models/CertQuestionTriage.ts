import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { TriageConcern, TriageSeverity, TriageVerdict } from '../services/certPrep/triageTypes';

/**
 * CertQuestionTriage — a machine's opinion of one question revision.
 *
 * THIS TABLE CANNOT MAKE A QUESTION SERVABLE, and that is the reason it is a
 * table rather than three columns on `cert_question_revisions`. The approval
 * gate is `review_status` on that model; nothing here is read by any serving
 * path. Keeping the machine's opinion in a different table from the human's
 * decision means the two can never be confused by a query, a migration, or
 * somebody skimming a row six months from now.
 *
 * `no_concerns` MEANS THE REVIEWER RAISED NO OBJECTION. It does not mean the
 * question is correct, and it does not mean a person has read it. The column is
 * called `verdict` rather than `result` or `status` for that reason: a verdict
 * belongs to whoever gave it.
 *
 * UNIQUENESS INCLUDES `prompt_version`. The adversarial prompt is the
 * load-bearing part of this process, so the same model over the same revision
 * with an improved prompt is a genuinely new opinion. Without that column in the
 * key, every re-run after a prompt change would have been silently discarded as
 * a duplicate.
 *
 * Columns must match backend/src/db/ensureCertPrepSchema.ts EXACTLY.
 */

export interface CertQuestionTriageAttributes {
  id?: string;
  /** Groups one pass over the bank, so a whole run can be undone by id. */
  run_id: string;
  question_key: string;
  revision: number;
  verdict: TriageVerdict;
  severity?: TriageSeverity | null;
  concerns?: TriageConcern[];
  reviewer_model: string;
  prompt_version: string;
  created_at?: Date;
  updated_at?: Date;
}

export class CertQuestionTriage
  extends Model<CertQuestionTriageAttributes>
  implements CertQuestionTriageAttributes {
  declare id: string;
  declare run_id: string;
  declare question_key: string;
  declare revision: number;
  declare verdict: TriageVerdict;
  declare severity: TriageSeverity | null;
  declare concerns: TriageConcern[];
  declare reviewer_model: string;
  declare prompt_version: string;
  declare created_at: Date;
  declare updated_at: Date;
}

CertQuestionTriage.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    run_id: { type: DataTypes.STRING(60), allowNull: false },
    question_key: { type: DataTypes.STRING(60), allowNull: false },
    revision: { type: DataTypes.INTEGER, allowNull: false },
    verdict: { type: DataTypes.STRING(20), allowNull: false },
    severity: { type: DataTypes.STRING(10), allowNull: true },
    concerns: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    reviewer_model: { type: DataTypes.STRING(60), allowNull: false },
    prompt_version: { type: DataTypes.STRING(20), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cert_question_triage',
    modelName: 'CertQuestionTriage',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default CertQuestionTriage;
