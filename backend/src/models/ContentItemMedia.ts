import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ContentItemMedia - join between a ContentItem and its MediaAssets, with ordering.
 *
 * BOTH sides carry a real FK. A join table has two immediate parents, not one, and both live
 * in the Content OS module — a row pointing at a deleted asset is not a degraded record, it
 * is a meaningless one. The parent-constrained / cross-domain-bare rule used throughout this
 * subsystem applies per EDGE, and neither edge here is cross-domain.
 *
 * timestamps: false with an explicit created_at - the row is never updated, only created or
 * deleted, and Sequelize's default handling would invent an updated_at the DDL does not have.
 */
export interface ContentItemMediaAttributes {
  id?: string;
  content_item_id: string;
  media_asset_id: string;
  position?: number;
  created_at?: Date;
}

class ContentItemMedia extends Model<ContentItemMediaAttributes> implements ContentItemMediaAttributes {
  declare id: string;
  declare content_item_id: string;
  declare media_asset_id: string;
  declare position: number;
  declare created_at: Date;
}

ContentItemMedia.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    content_item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'content_items', key: 'id' },
    },
    media_asset_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'media_assets', key: 'id' },
    },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'content_item_media', timestamps: false },
);

export default ContentItemMedia;
