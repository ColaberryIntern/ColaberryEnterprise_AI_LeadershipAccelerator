import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * JourneyProgram — one brand's growth journey.
 *
 * The shared framework Explorer Growth becomes the first instance of. A program
 * belongs to exactly one brand, and its `kind` says what sort of journey it is;
 * its `journey_paths` say which offer families it may run.
 *
 * WHY A PROGRAM RATHER THAN A FLAG ON THE BRAND. The four brands do genuinely
 * different things — CPN and Colaberry Training run learner journeys only, while
 * Colaberry Enterprise sells training and consulting and builds, and AI
 * Flotation sells everything except training. That is not one journey with
 * per-brand switches; it is different journeys sharing one engine.
 *
 * `tenant_id` is carried alongside `brand_id`, denormalised deliberately and
 * matching `brand_domains`. `tenantScopeWhere` filters on a tenant column
 * directly, so without it every scoped read would have to join through brands.
 */

/**
 * What sort of journey this is.
 *
 * Not an exhaustive taxonomy of offers — that is `journey_paths.offer_family`.
 * This is the shape of the relationship: someone learning, someone buying for
 * their business, or someone commissioning work.
 */
export type JourneyProgramKind = 'learner' | 'business' | 'consulting';

export const JOURNEY_PROGRAM_KINDS: readonly JourneyProgramKind[] = [
  'learner',
  'business',
  'consulting',
];

/**
 * `draft` is the default, and that is the safety posture rather than an
 * oversight: a program seeded by mistake cannot be resolved as a brand's
 * default until someone activates it deliberately.
 */
export type JourneyProgramStatus = 'draft' | 'active' | 'paused' | 'retired';

export const JOURNEY_PROGRAM_STATUSES: readonly JourneyProgramStatus[] = [
  'draft',
  'active',
  'paused',
  'retired',
];

export interface JourneyProgramAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  /** Unique per BRAND, not per tenant — see the model definition below. */
  slug: string;
  name: string;
  kind: JourneyProgramKind;
  status?: JourneyProgramStatus;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: Date;
  updated_at?: Date;
}

export class JourneyProgram
  extends Model<JourneyProgramAttributes>
  implements JourneyProgramAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare slug: string;
  declare name: string;
  declare kind: JourneyProgramKind;
  declare status: JourneyProgramStatus;
  declare description: string | null;
  declare metadata: Record<string, unknown> | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

JourneyProgram.init(
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
    slug: { type: DataTypes.STRING(64), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    kind: { type: DataTypes.STRING(32), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    description: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'journey_programs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        // Per BRAND, not per tenant. The `colaberry` tenant holds both
        // `colaberry-training` and `colaberry-enterprise`, and each may
        // legitimately run a program called `learner`; a tenant-scoped unique
        // index would make those collide.
        unique: true,
        name: 'journey_programs_brand_slug_unique',
        fields: ['brand_id', 'slug'],
      },
    ],
  },
);

export default JourneyProgram;
