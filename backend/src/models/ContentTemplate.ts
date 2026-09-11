import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ContentTemplate - a reusable, VERSIONED brand/channel template.
 *
 * Versioned rather than edited in place, and unique on (tenant, brand, name, version). A
 * template edit must not retroactively change what already-published content was generated
 * from - the same reasoning that makes a published TrackedLink immutable.
 */
export interface ContentTemplateAttributes {
  id?: string;
  tenant_id: string;
  brand_id?: string | null;
  name: string;
  provider?: string | null;
  body_template: string;
  version?: number;
  is_active?: boolean;
  created_by?: string | null;
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class ContentTemplate extends Model<ContentTemplateAttributes> implements ContentTemplateAttributes {
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string | null;
  declare name: string;
  declare provider: string | null;
  declare body_template: string;
  declare version: number;
  declare is_active: boolean;
  declare created_by: string | null;
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

ContentTemplate.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    provider: { type: DataTypes.STRING(40), allowNull: true },
    body_template: { type: DataTypes.TEXT, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  { sequelize, tableName: 'content_templates', timestamps: true, underscored: true },
);

export default ContentTemplate;
