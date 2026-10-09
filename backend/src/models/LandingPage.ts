import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * `external_path` is what every row here was until 2026-10-01: a marketing-enabled path on a site
 * that exists somewhere else, so a campaign could point at it. `hosted` is a page this platform
 * builds, stores and serves at /lp/:brand/:slug, which is the only kind that can be tracked end to
 * end. Both live in one table because the campaign destination dropdown reads both.
 */
export type LandingPageKind = 'external_path' | 'hosted';

export type LandingPageStatus = 'draft' | 'published' | 'archived';

/** Structured sections, never raw HTML - a renderer that accepts markup is a way onto our origin. */
export interface LandingPageContent {
  sections?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface LandingPageAttributes {
  id?: string;
  name: string;
  path: string;
  is_marketing_enabled?: boolean;
  conversion_event?: string;
  /** Null on the legacy rows, which belong to nobody in particular. */
  tenant_id?: string | null;
  brand_id?: string | null;
  /**
   * The web property, at the grain the analytics group by. Not derivable from `brand_id`: five
   * properties share one brand today and worldoftaxonomy alone is over half the event volume.
   */
  site_slug?: string | null;
  kind?: LandingPageKind;
  /** Addresses a hosted page under its brand. Null for an external path. */
  slug?: string | null;
  status?: LandingPageStatus;
  content?: LandingPageContent;
  published_at?: Date | null;
  created_by?: string | null;
  /** Where the master copy lives in the brand's repo, and the commit this row was built from. */
  repo_path?: string | null;
  repo_commit?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class LandingPage extends Model<LandingPageAttributes> implements LandingPageAttributes {
  declare id: string;
  declare name: string;
  declare path: string;
  declare is_marketing_enabled: boolean;
  declare conversion_event: string;
  declare tenant_id: string | null;
  declare brand_id: string | null;
  declare site_slug: string | null;
  declare kind: LandingPageKind;
  declare slug: string | null;
  declare status: LandingPageStatus;
  declare content: LandingPageContent;
  declare published_at: Date | null;
  declare created_by: string | null;
  declare repo_path: string | null;
  declare repo_commit: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

LandingPage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    path: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    is_marketing_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    conversion_event: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // Nullable: seventeen rows predate ownership and inventing an owner for them would be worse
    // than recording that it is unknown.
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    site_slug: { type: DataTypes.STRING(64), allowNull: true },
    kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'external_path' },
    slug: { type: DataTypes.STRING(160), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    content: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    published_at: { type: DataTypes.DATE, allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    repo_path: { type: DataTypes.STRING(500), allowNull: true },
    repo_commit: { type: DataTypes.STRING(64), allowNull: true },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'landing_pages',
    timestamps: true,
    underscored: true,
  },
);

export default LandingPage;
