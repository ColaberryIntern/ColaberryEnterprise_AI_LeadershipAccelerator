import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyQuote — the highest-risk asset in the Case Study OS.
 *
 * This repository actually shipped invented client quotations; the remediation
 * is named in `frontend/src/config/v2Proof.ts`. So the row is shaped to make
 * that incident unrepresentable rather than merely forbidden.
 *
 * `attribution_mode` + `display_name` + `consent_recorded_at` carry the
 * `CaseStudyContributor` consent union. The DDL's CHECK constraint
 * (`cs_quotes_named_requires_consent`) is that union expressed in SQL: a
 * `named` quote lacking either a display name or a consent timestamp cannot be
 * stored — including through the direct SQL that promoted this record's
 * artifacts, which is the path that bypassed every application rule last time.
 *
 * `approved` defaults FALSE and `verification_class` defaults `'pending'`, so a
 * newly created quote is publishable on no axis at all. Nothing here is a
 * ladder: a quote can be approved and still refused for a pending class.
 *
 * AI NEVER WRITES `quote_text`. Three independent refusals stand in the way:
 * the draft generator screens the `quote` forbidden class before a model is
 * reached, `ruleQuotes` refuses `ai_draft` OR `unknown` provenance at any
 * quote-classified path, and the Studio's quote form has no generate button.
 */
export interface CaseStudyQuoteAttributes {
  id?: string;
  case_study_id: string;
  quote_text: string;
  /** named | role_only | anonymous */
  attribution_mode: string;
  display_name?: string | null;
  attribution_role?: string | null;
  /** colaberry_team | client_team | joint | individual — CaseStudyBuiltByType */
  attribution_kind: string;
  consent_recorded_at?: Date | null;
  /** client_confirmation | recorded_interview | written_statement | public_statement */
  quote_source: string;
  /** verified | anonymized | illustrative | pending */
  verification_class?: string;
  approved?: boolean;
  reviewed_by?: string | null;
  reviewed_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class CaseStudyQuote
  extends Model<CaseStudyQuoteAttributes>
  implements CaseStudyQuoteAttributes
{
  declare id: string;
  declare case_study_id: string;
  declare quote_text: string;
  declare attribution_mode: string;
  declare display_name: string | null;
  declare attribution_role: string | null;
  declare attribution_kind: string;
  declare consent_recorded_at: Date | null;
  declare quote_source: string;
  declare verification_class: string;
  declare approved: boolean;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyQuote.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    quote_text: { type: DataTypes.TEXT, allowNull: false },
    attribution_mode: { type: DataTypes.STRING(20), allowNull: false },
    display_name: { type: DataTypes.STRING(255), allowNull: true },
    attribution_role: { type: DataTypes.STRING(255), allowNull: true },
    attribution_kind: { type: DataTypes.STRING(40), allowNull: false },
    consent_recorded_at: { type: DataTypes.DATE, allowNull: true },
    quote_source: { type: DataTypes.STRING(40), allowNull: false },
    verification_class: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reviewed_by: { type: DataTypes.STRING(255), allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'case_study_quotes',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ fields: ['case_study_id', 'approved'], name: 'cs_quotes_by_case_study' }],
  }
);

export default CaseStudyQuote;
