import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The saved result of the automatic AI checks on one solicitation ZIP. One row per (tenant, qualification, ZIP sha256),
 * deliberately OUTSIDE the versioned gov_qualifications record: a background write there would fork a version and turn
 * the next save in any open workspace tab into a 409. Advisory only; no gate reads this table.
 * Schema: db/ensureGovAiVettingSchema.ts. The model is imported directly, the same way as GovExtractionJob.
 */
export type GovAiVettingStatus = 'queued' | 'running' | 'completed';
export type GovAiVerdict = 'pursue' | 'pass' | 'inconclusive';

export interface GovAiVettingAttributes {
  id?: string;
  tenant_id: string;
  qualification_key: string;
  sha256: string;
  status?: GovAiVettingStatus;
  attempts?: number;
  verdict?: GovAiVerdict | null;
  reason?: string | null;
  reason_quote?: string | null;
  coverage_pct?: number | null;
  fit_json?: unknown;
  summary_json?: unknown;
  questions_json?: unknown;
  opportunity_json?: unknown;
  error_class?: string | null;
  last_uploaded_at?: Date;
  created_at?: Date;
  updated_at?: Date;
  completed_at?: Date | null;
}

class GovAiVetting extends Model<GovAiVettingAttributes> implements GovAiVettingAttributes {
  declare id: string;
  declare tenant_id: string;
  declare qualification_key: string;
  declare sha256: string;
  declare status: GovAiVettingStatus;
  declare attempts: number;
  declare verdict: GovAiVerdict | null;
  declare reason: string | null;
  declare reason_quote: string | null;
  declare coverage_pct: number | null;
  declare fit_json: unknown;
  declare summary_json: unknown;
  declare questions_json: unknown;
  declare opportunity_json: unknown;
  declare error_class: string | null;
  declare last_uploaded_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
  declare completed_at: Date | null;
}

GovAiVetting.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    qualification_key: { type: DataTypes.STRING(80), allowNull: false },
    sha256: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'queued' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    verdict: { type: DataTypes.STRING(16) },
    reason: { type: DataTypes.TEXT },
    reason_quote: { type: DataTypes.TEXT },
    coverage_pct: { type: DataTypes.INTEGER },
    fit_json: { type: DataTypes.JSONB },
    summary_json: { type: DataTypes.JSONB },
    questions_json: { type: DataTypes.JSONB },
    opportunity_json: { type: DataTypes.JSONB },
    error_class: { type: DataTypes.STRING(60) },
    last_uploaded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    completed_at: { type: DataTypes.DATE },
  },
  {
    sequelize,
    tableName: 'gov_ai_vettings',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['tenant_id', 'qualification_key', 'sha256'] },
      { fields: ['status'] },
    ],
  },
);

export default GovAiVetting;
