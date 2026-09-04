import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CertQuestion — the STABLE IDENTITY of a practice item. Content lives in
 * CertQuestionRevision; this row is what a response points at across edits.
 *
 * `provenance` exists so a Colaberry-authored bank can always be told apart from
 * anything else. 'colaberry_authored' is the only value the serving path will
 * release to a student: third-party question content is never imported into this
 * table, and an item whose provenance says otherwise is a bug to investigate, not
 * a row to serve. `scenario_family` groups items under one of the exam's published
 * scenario contexts so a practice form can mirror the real four-of-six draw.
 *
 * Columns must match backend/src/db/ensureCertPrepSchema.ts EXACTLY.
 */

export type CertQuestionProvenance = 'colaberry_authored' | 'imported' | 'unknown';

export interface CertQuestionAttributes {
  id?: string;
  question_key: string;
  track_id: string;
  scenario_family?: string | null;
  provenance?: CertQuestionProvenance;
  provenance_note?: string | null;
  created_by?: string | null;
  is_retired?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class CertQuestion extends Model<CertQuestionAttributes> implements CertQuestionAttributes {
  declare id: string;
  declare question_key: string;
  declare track_id: string;
  declare scenario_family: string | null;
  declare provenance: CertQuestionProvenance;
  declare provenance_note: string | null;
  declare created_by: string | null;
  declare is_retired: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

CertQuestion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    question_key: { type: DataTypes.STRING(60), allowNull: false },
    track_id: { type: DataTypes.STRING(40), allowNull: false },
    scenario_family: { type: DataTypes.STRING(80), allowNull: true },
    provenance: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'colaberry_authored' },
    provenance_note: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.STRING(255), allowNull: true },
    is_retired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'cert_questions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default CertQuestion;
