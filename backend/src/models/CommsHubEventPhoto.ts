import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubEventPhoto: a picture the organizer added to an event, as an input to its thumbnails (CH4.1).
 * The bytes are a media_assets row (EXIF stripped, content-addressed); this only links them.
 * Columns match ensureCommsHubSchema.ts exactly.
 */
export interface CommsHubEventPhotoAttributes {
  id?: string;
  event_id: string;
  media_asset_id: string;
  position?: number;
  created_by?: string | null;
  created_at?: Date;
}

class CommsHubEventPhoto extends Model<CommsHubEventPhotoAttributes> implements CommsHubEventPhotoAttributes {
  declare id: string;
  declare event_id: string;
  declare media_asset_id: string;
  declare position: number;
  declare created_by: string | null;
  declare created_at: Date;
}

CommsHubEventPhoto.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    event_id: { type: DataTypes.UUID, allowNull: false },
    media_asset_id: { type: DataTypes.UUID, allowNull: false },
    position: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    created_by: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_event_photos', timestamps: true, createdAt: 'created_at', updatedAt: false },
);

export default CommsHubEventPhoto;
