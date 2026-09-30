import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * OfferFamily — the governed offer catalog (§4, T202).
 *
 * §4 opens with "Offers are not free-text AI inventions." This table is what
 * makes that a constraint rather than an intention: a family has to exist here
 * before a `brand_offer_policies` row or a `journey_paths` row can name it.
 *
 * THE CANONICAL LIST LIVES HERE, and nowhere else. T201 put it in
 * `JourneyPath.ts` because that was the first file that needed it; that copy is
 * gone and `JourneyPath.ts` now imports from this module. Two lists of eleven
 * strings drift silently — the drift shows up as a family that resolves in one
 * place and not another, which reads as a policy bug rather than a duplicate
 * constant.
 *
 * THE SLUG IS UNIQUE GLOBALLY, not per tenant. `brands.slug` is per-tenant, so
 * this is a deliberate difference: the vocabulary is shared, because §4's whole
 * purpose is comparing what different brands may offer, and a per-tenant
 * catalog would make `ai_consulting` a different thing for each tenant and the
 * comparison meaningless.
 */

/** §4's eleven offer families (`request.md:264-276`). */
export type OfferFamilySlug =
  | 'learner_free_training'
  | 'learner_paid_training'
  | 'learner_community_subscription'
  | 'learner_certification'
  | 'learner_internship'
  | 'business_training'
  | 'ai_consulting'
  | 'workflow_automation'
  | 'application_build'
  | 'ai_project'
  | 'paid_discovery';

export const OFFER_FAMILIES: readonly OfferFamilySlug[] = [
  'learner_free_training',
  'learner_paid_training',
  'learner_community_subscription',
  'learner_certification',
  'learner_internship',
  'business_training',
  'ai_consulting',
  'workflow_automation',
  'application_build',
  'ai_project',
  'paid_discovery',
];

/**
 * The five learner families, derived from the `learner_` prefix rather than
 * listed a second time.
 *
 * With `business_training` these are the six §4:287 denies to AI Flotation. An
 * earlier draft of the plan named four, which would have let AI Flotation
 * resolve `learner_community_subscription` while the test stayed green.
 */
export const LEARNER_OFFER_FAMILIES: readonly OfferFamilySlug[] = OFFER_FAMILIES.filter(
  (f) => f.startsWith('learner_'),
);

/**
 * Every family AI Flotation is denied (§4:287) — "explicitly deny business
 * training and learner programs".
 *
 * Exported so the seed and its contract test share one list. If they each
 * carried a copy, a family dropped from the seed would also be dropped from the
 * assertion and the test would pass over the gap.
 */
export const AI_FLOTATION_DENIED_FAMILIES: readonly OfferFamilySlug[] = [
  ...LEARNER_OFFER_FAMILIES,
  'business_training',
];

export function isOfferFamilySlug(value: unknown): value is OfferFamilySlug {
  return typeof value === 'string' && (OFFER_FAMILIES as readonly string[]).includes(value);
}

export type OfferFamilyStatus = 'active' | 'paused' | 'retired';

export interface OfferFamilyAttributes {
  id?: string;
  slug: OfferFamilySlug;
  name: string;
  status?: OfferFamilyStatus;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: Date;
  updated_at?: Date;
}

export class OfferFamily extends Model<OfferFamilyAttributes> implements OfferFamilyAttributes {
  declare id: string;
  declare slug: OfferFamilySlug;
  declare name: string;
  declare status: OfferFamilyStatus;
  declare description: string | null;
  declare metadata: Record<string, unknown> | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

OfferFamily.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // NOT `unique: true` at column level. That form mints an index Sequelize
    // names itself, so if `sync({ alter: true })` ever ran it would create a
    // SECOND unique index beside the DDL's `offer_families_slug_unique`. No
    // global sync runs at boot today, which makes it latent rather than a bug —
    // and latent is exactly how this repo has acquired duplicate indexes before.
    // Declared in `indexes` below with the DDL's own name instead.
    slug: { type: DataTypes.STRING(64), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    description: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'offer_families',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        name: 'offer_families_slug_unique',
        fields: ['slug'],
      },
    ],
  },
);

export default OfferFamily;
