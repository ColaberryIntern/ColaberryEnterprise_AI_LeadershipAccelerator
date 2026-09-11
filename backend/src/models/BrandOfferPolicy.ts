import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { OfferFamilySlug } from './OfferFamily';

/**
 * BrandOfferPolicy — §4's brand-offer eligibility mapping (T202).
 *
 * One row per brand per offer family, carrying all eight attributes §4:278
 * requires: status, effective dates, approved landing pages, approved claims,
 * content collections, CTAs, conversion events and required approvals.
 *
 * ─── WHY `decision` EXISTS, AND WHY DENY OUTRANKS ALLOW ─────────────────────
 *
 * The resolver fails closed, so the ABSENCE of a row already denies. An `allow`
 * row is therefore a grant, and a `deny` row is not redundant with absence: it
 * records that someone decided no, and it OUTRANKS a later `allow`.
 *
 * That ordering is what makes §4:287 enforceable rather than incidental. AI
 * Flotation must never be offered business training or any learner programme
 * "even when the classifier, content tags or caller request are wrong" — and the
 * likeliest way that goes wrong is not a missing grant, it is somebody adding
 * one. Absence protects against silence; an explicit deny protects against a
 * mistake.
 *
 * A DENY IS UNCONDITIONAL. `status` and the effective window soften an allow,
 * never a deny — you lift a deny by deleting the row, deliberately, not by
 * pausing it or letting it expire. Any other reading gives a policy an
 * expiry-driven path to permitting exactly what §4 forbids.
 *
 * ─── ELIGIBILITY IS NOT CONTENT APPROVAL ────────────────────────────────────
 *
 * `allow` answers "may this brand offer this family at all". It does not say any
 * particular page, claim or CTA is approved — those are the JSONB lists, and the
 * seed ships them EMPTY on purpose (see `offerPolicyDefinitions.ts`). A content
 * lookup must check both, which is why the resolver returns
 * `approved_content_ready` separately instead of folding it into `allowed`.
 */

/** `allow` grants; `deny` forbids and outranks any allow. */
export type PolicyDecision = 'allow' | 'deny';

/** Operator-owned. Never written by the seed on update. */
export type PolicyStatus = 'active' | 'paused' | 'retired';

export interface BrandOfferPolicyAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  offer_family: OfferFamilySlug;
  decision: PolicyDecision;
  status?: PolicyStatus;
  effective_from?: Date;
  /** `null` means open-ended. */
  effective_to?: Date | null;
  approved_landing_pages?: string[];
  approved_claims?: string[];
  content_collections?: string[];
  approved_ctas?: string[];
  conversion_events?: string[];
  required_approvals?: string[];
  notes?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export class BrandOfferPolicy
  extends Model<BrandOfferPolicyAttributes>
  implements BrandOfferPolicyAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare offer_family: OfferFamilySlug;
  declare decision: PolicyDecision;
  declare status: PolicyStatus;
  declare effective_from: Date;
  declare effective_to: Date | null;
  declare approved_landing_pages: string[];
  declare approved_claims: string[];
  declare content_collections: string[];
  declare approved_ctas: string[];
  declare conversion_events: string[];
  declare required_approvals: string[];
  declare notes: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

BrandOfferPolicy.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    brand_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'brands', key: 'id' },
    },
    offer_family: { type: DataTypes.STRING(64), allowNull: false },
    decision: { type: DataTypes.STRING(10), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    effective_from: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    effective_to: { type: DataTypes.DATE, allowNull: true },
    // Default to [] rather than null so a caller reading the list never has to
    // distinguish "no approved pages" from "column not set" — one of those two
    // readings would eventually be treated as "unrestricted".
    approved_landing_pages: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    approved_claims: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    content_collections: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    approved_ctas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    conversion_events: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    required_approvals: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'brand_offer_policies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        // One policy per brand per family, enforced by the database so a
        // concurrent seed cannot create a second contradictory row.
        unique: true,
        name: 'brand_offer_policies_brand_family_unique',
        fields: ['brand_id', 'offer_family'],
      },
    ],
  },
);

export default BrandOfferPolicy;
