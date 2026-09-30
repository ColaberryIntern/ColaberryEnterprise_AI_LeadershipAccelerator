import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryProject — one thing being built for one engagement.
 *
 * DELIBERATELY NOT AN EXTENSION OF `Project`. The student `Project` model requires both
 * `enrollment_id` and `program_id` (NOT NULL, and `program_id` carries a foreign key to
 * `program_blueprints`), and 32 files read it assuming an enrollment exists. A commercial
 * client project has neither. Master plan §2.2 is explicit that those columns must not be
 * made nullable just to support client projects, and Gate 0 confirmed why: it would trade
 * one compile-time guarantee for 32 runtime null-checks, and the first one anybody forgot
 * would crash a student's Projects page.
 *
 * A student project can still be pulled into a delivery context — through
 * `DeliveryProjectSourceLink`, which is a separate table so that `projects` itself is
 * never altered.
 *
 * CARRIES ITS OWN tenant_id/brand_id. Along with `delivery_engagements` this is one of
 * the two delivery tables reachable without a parent: "my projects" starts here, and a
 * cross-tenant enumeration would target it. Every child table scopes by joining back to
 * this one.
 */
export type ProjectClass =
  | 'sandbox'
  | 'portfolio'
  | 'internal'
  | 'training'
  | 'delivery_residency'
  | 'commercial_client'
  | 'government_public_sector';

export const PROJECT_CLASSES: readonly ProjectClass[] = [
  'sandbox',
  'portfolio',
  'internal',
  'training',
  'delivery_residency',
  'commercial_client',
  'government_public_sector',
];

/** The five entry points from master plan §4. */
export type StartingPoint =
  | 'idea'
  | 'workflow_to_fix'
  | 'existing_system'
  | 'proven_blueprint'
  | 'not_sure';

export const STARTING_POINTS: readonly StartingPoint[] = [
  'idea',
  'workflow_to_fix',
  'existing_system',
  'proven_blueprint',
  'not_sure',
];

export type DeliveryProjectStatus =
  | 'discovery'
  | 'contracting'
  | 'architecture'
  | 'design'
  | 'building'
  | 'review'
  | 'operating'
  | 'closed';

export const DELIVERY_PROJECT_STATUSES: readonly DeliveryProjectStatus[] = [
  'discovery',
  'contracting',
  'architecture',
  'design',
  'building',
  'review',
  'operating',
  'closed',
];

export interface DeliveryProjectAttributes {
  id?: string;
  engagement_id: string;
  tenant_id: string;
  brand_id?: string | null;
  organization_id?: string | null;
  name: string;
  /** Unique per tenant, not globally — two tenants may both have `customer-portal`. */
  slug: string;
  project_class?: ProjectClass;
  starting_point?: StartingPoint | null;
  status?: DeliveryProjectStatus;
  industry?: string | null;
  business_problem?: string | null;
  product_idea?: string | null;
  workflow_summary?: string | null;
  existing_system_summary?: string | null;
  delivery_profile_key?: string | null;
  trust_profile_key?: string | null;
  current_release_id?: string | null;
  health_score?: number | null;
  created_by_identity_id?: string | null;
  archived_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryProject
  extends Model<DeliveryProjectAttributes>
  implements DeliveryProjectAttributes
{
  declare id: string;
  declare engagement_id: string;
  declare tenant_id: string;
  declare brand_id: string | null;
  declare organization_id: string | null;
  declare name: string;
  declare slug: string;
  declare project_class: ProjectClass;
  declare starting_point: StartingPoint | null;
  declare status: DeliveryProjectStatus;
  declare industry: string | null;
  declare business_problem: string | null;
  declare product_idea: string | null;
  declare workflow_summary: string | null;
  declare existing_system_summary: string | null;
  declare delivery_profile_key: string | null;
  declare trust_profile_key: string | null;
  declare current_release_id: string | null;
  declare health_score: number | null;
  declare created_by_identity_id: string | null;
  declare archived_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryProject.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    engagement_id: { type: DataTypes.UUID, allowNull: false },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    organization_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    slug: { type: DataTypes.STRING(120), allowNull: false },
    project_class: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'sandbox' },
    starting_point: { type: DataTypes.STRING(40), allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'discovery' },
    industry: { type: DataTypes.STRING(120), allowNull: true },
    business_problem: { type: DataTypes.TEXT, allowNull: true },
    product_idea: { type: DataTypes.TEXT, allowNull: true },
    workflow_summary: { type: DataTypes.TEXT, allowNull: true },
    existing_system_summary: { type: DataTypes.TEXT, allowNull: true },
    delivery_profile_key: { type: DataTypes.STRING(60), allowNull: true },
    trust_profile_key: { type: DataTypes.STRING(60), allowNull: true },
    current_release_id: { type: DataTypes.UUID, allowNull: true },
    health_score: { type: DataTypes.INTEGER, allowNull: true },
    created_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_projects',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'slug'],
        name: 'delivery_projects_tenant_slug_unique',
      },
      { fields: ['tenant_id', 'status'], name: 'idx_delivery_projects_tenant_status' },
      { fields: ['engagement_id'], name: 'idx_delivery_projects_engagement' },
    ],
  },
);

export default DeliveryProject;
