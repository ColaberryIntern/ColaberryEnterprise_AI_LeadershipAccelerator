import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * growth_journey_content_rules - the section 10 content declaration. T305.
 *
 * One row per asset (or named collection) per brand. `explorer_content_assets`
 * answers "may this brand use this asset"; this answers "and under exactly what
 * conditions, with which claims, citing what evidence".
 *
 * MUTABLE, deliberately, unlike the decision and snapshot tables: a declaration
 * is edited as content is reviewed, and `version` plus the unique index on
 * (brand_id, asset_id, version) is how a superseded declaration stays readable.
 *
 * NO ROWS SHIP IN PHASE 3. Declaring the existing assets is a human review job
 * (Phase 4). `growthJourney/contentEligibility` reads this table and treats the
 * absence of a rule as "fall back to the asset's own columns", never as a
 * denial - a denial would have taken every Explorer learner's content away on
 * the day this shipped.
 */
interface GrowthJourneyContentRuleAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  asset_id?: string | null;
  collection_key?: string | null;
  eligible_programs?: string[];
  eligible_paths?: string[];
  audience_personas?: string[];
  lifecycle_states?: string[];
  overlays?: string[];
  offer_family?: string | null;
  channels?: string[];
  content_purpose?: string | null;
  approved_claims?: Record<string, unknown>[];
  source_evidence?: Record<string, unknown>[];
  approved_urls?: string[];
  approved_ctas?: string[];
  effective_from?: Date | null;
  expires_at?: Date | null;
  access_tier?: string | null;
  sender_profile_id?: string | null;
  version?: number;
  owner?: string | null;
  approval_status?: string;
  approved_by?: string | null;
  approved_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class GrowthJourneyContentRule
  extends Model<GrowthJourneyContentRuleAttributes>
  implements GrowthJourneyContentRuleAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare asset_id: string | null;
  declare collection_key: string | null;
  declare eligible_programs: string[];
  declare eligible_paths: string[];
  declare audience_personas: string[];
  declare lifecycle_states: string[];
  declare overlays: string[];
  declare offer_family: string | null;
  declare channels: string[];
  declare content_purpose: string | null;
  declare approved_claims: Record<string, unknown>[];
  declare source_evidence: Record<string, unknown>[];
  declare approved_urls: string[];
  declare approved_ctas: string[];
  declare effective_from: Date | null;
  declare expires_at: Date | null;
  declare access_tier: string | null;
  declare sender_profile_id: string | null;
  declare version: number;
  declare owner: string | null;
  declare approval_status: string;
  declare approved_by: string | null;
  declare approved_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

const jsonbList = { type: DataTypes.JSONB, allowNull: false, defaultValue: [] };

GrowthJourneyContentRule.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    asset_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'explorer_content_assets.id. Null when the rule covers a named collection.',
    },
    collection_key: { type: DataTypes.STRING(64), allowNull: true },
    eligible_programs: jsonbList,
    eligible_paths: jsonbList,
    audience_personas: jsonbList,
    lifecycle_states: jsonbList,
    overlays: jsonbList,
    offer_family: { type: DataTypes.STRING(48), allowNull: true },
    channels: jsonbList,
    content_purpose: { type: DataTypes.STRING(32), allowNull: true },
    approved_claims: {
      ...jsonbList,
      comment: 'Each claim carries its own evidence pointer - AI may cite, never invent.',
    },
    source_evidence: jsonbList,
    approved_urls: jsonbList,
    approved_ctas: jsonbList,
    effective_from: { type: DataTypes.DATE, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    access_tier: {
      type: DataTypes.STRING(16),
      allowNull: true,
      comment: "free | restricted. 'restricted' refuses a free-preview subject; NULL = not declared.",
    },
    sender_profile_id: { type: DataTypes.UUID, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    owner: { type: DataTypes.STRING(128), allowNull: true },
    approval_status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
    approved_by: { type: DataTypes.STRING(128), allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'growth_journey_content_rules',
    // MUTABLE, so Sequelize must actually maintain `updated_at` - the same
    // configuration `GrowthJourneyProfile` uses, and the reason it is spelled out
    // rather than left at the file's original `timestamps: false`: this table
    // declares itself editable and `phase3.test.ts` asserts that on both sides,
    // while a `false` here meant the column would never have advanced on an edit.
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default GrowthJourneyContentRule;
