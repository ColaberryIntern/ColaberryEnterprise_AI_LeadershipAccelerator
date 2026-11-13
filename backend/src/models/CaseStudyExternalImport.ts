/**
 * CaseStudyExternalImport - one imported outside document: its content hash (the idempotency key), where it came
 * from (upload or Drive), where the original is stored, and what the AI analysis produced or why it failed.
 *
 * Every column the DDL creates is declared three times (attributes interface, `init()`, `declare`) per
 * backend/CLAUDE.md "Models specifically"; `db/__tests__/ensureCaseStudyExternalImportSchema.test.ts` asserts the
 * DDL and this model name exactly the same columns.
 *
 * Schema: db/ensureCaseStudyExternalImportSchema.ts.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/** `analyzed` - the AI analysis filled the draft; `failed` - fail-soft draft, see `analysis_error`. */
export const EXTERNAL_IMPORT_ANALYSIS_STATUSES = ['pending', 'analyzed', 'failed'] as const;
export type ExternalImportAnalysisStatus = typeof EXTERNAL_IMPORT_ANALYSIS_STATUSES[number];

export interface CaseStudyExternalImportAttributes {
  id?: string;
  case_study_id: string;
  content_hash: string;
  /** external_document (upload) | external_drive (Drive import) - the same value written to case_studies.source_type */
  source_kind: string;
  drive_file_id?: string | null;
  drive_modified_time?: Date | null;
  original_filename: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  storage_key?: string | null;
  analysis_status?: ExternalImportAnalysisStatus;
  analysis_error?: string | null;
  /** The sanitized OutsideCaseStudyAnalysis (services/caseStudy/caseStudyOutsideAnalysis.ts), or null on failure. */
  analysis?: Record<string, unknown> | null;
  imported_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export class CaseStudyExternalImport
  extends Model<CaseStudyExternalImportAttributes>
  implements CaseStudyExternalImportAttributes
{
  declare id: string;
  declare case_study_id: string;
  declare content_hash: string;
  declare source_kind: string;
  declare drive_file_id: string | null;
  declare drive_modified_time: Date | null;
  declare original_filename: string;
  declare mime_type: string | null;
  declare size_bytes: number | null;
  declare storage_key: string | null;
  declare analysis_status: ExternalImportAnalysisStatus;
  declare analysis_error: string | null;
  declare analysis: Record<string, unknown> | null;
  declare imported_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyExternalImport.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    content_hash: { type: DataTypes.STRING(64), allowNull: false },
    source_kind: { type: DataTypes.TEXT, allowNull: false },
    drive_file_id: { type: DataTypes.TEXT, allowNull: true },
    drive_modified_time: { type: DataTypes.DATE, allowNull: true },
    original_filename: { type: DataTypes.TEXT, allowNull: false },
    mime_type: { type: DataTypes.TEXT, allowNull: true },
    size_bytes: { type: DataTypes.INTEGER, allowNull: true },
    storage_key: { type: DataTypes.TEXT, allowNull: true },
    analysis_status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'pending' },
    analysis_error: { type: DataTypes.TEXT, allowNull: true },
    analysis: { type: DataTypes.JSONB, allowNull: true },
    imported_by: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'CaseStudyExternalImport',
    tableName: 'case_study_external_imports',
    timestamps: false,
  },
);

export default CaseStudyExternalImport;
