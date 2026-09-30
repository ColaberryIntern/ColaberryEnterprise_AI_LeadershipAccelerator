import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ExternalPublication - proof that something actually landed on a provider.
 *
 * Unique on (provider, external_id). That is the reconciliation guard: when a publish times
 * out ambiguously and we later discover the post DID land, recording it a second time would
 * double-count every metric attached to it. The provider's own id is the only identifier
 * both sides agree on.
 *
 * `current_status` and `removed_at` exist because a published post does not stay published -
 * a provider can remove it, and a system that cannot represent that will keep reporting
 * engagement on a post that no longer exists.
 */
export interface ExternalPublicationAttributes {
  id?: string;
  publishing_job_id?: string | null;
  tenant_id: string;
  brand_id?: string | null;
  content_item_id?: string | null;
  provider: string;
  external_id: string;
  permalink?: string | null;
  published_at?: Date | null;
  current_status?: string;
  last_checked_at?: Date | null;
  removed_at?: Date | null;
  removed_reason?: string | null;
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class ExternalPublication
  extends Model<ExternalPublicationAttributes>
  implements ExternalPublicationAttributes {
  declare id: string;
  declare publishing_job_id: string | null;
  declare tenant_id: string;
  declare brand_id: string | null;
  declare content_item_id: string | null;
  declare provider: string;
  declare external_id: string;
  declare permalink: string | null;
  declare published_at: Date | null;
  declare current_status: string;
  declare last_checked_at: Date | null;
  declare removed_at: Date | null;
  declare removed_reason: string | null;
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

ExternalPublication.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    publishing_job_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'publishing_jobs', key: 'id' },
    },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    content_item_id: { type: DataTypes.UUID, allowNull: true },
    provider: { type: DataTypes.STRING(40), allowNull: false },
    external_id: { type: DataTypes.STRING(300), allowNull: false },
    permalink: { type: DataTypes.TEXT, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    current_status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'live' },
    last_checked_at: { type: DataTypes.DATE, allowNull: true },
    removed_at: { type: DataTypes.DATE, allowNull: true },
    removed_reason: { type: DataTypes.STRING(200), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  { sequelize, tableName: 'external_publications', timestamps: true, underscored: true },
);

export default ExternalPublication;
