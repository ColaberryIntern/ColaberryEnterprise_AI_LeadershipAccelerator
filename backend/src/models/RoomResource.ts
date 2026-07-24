import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Links, files, recordings, recaps, notes, and pins attached to a room (or one
// of its bookings). Recaps/notes store their body inline; links/recordings
// store a url; files store mime_type/size_bytes/storage_key (the disk
// filename, resolved server-side — never trust a client-supplied path).
export type RoomResourceType = 'link' | 'file' | 'recording' | 'recap' | 'pin' | 'note';

export interface RoomResourceAttributes {
  id?: string;
  room_id: string;
  booking_id?: string | null;
  resource_type: RoomResourceType;
  title?: string | null;
  url?: string | null;
  body?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  storage_key?: string | null;
  created_by_enrollment_id?: string | null;
  is_pinned?: boolean;
  metadata?: Record<string, unknown>;
  created_at?: Date;
  updated_at?: Date;
}

class RoomResource extends Model<RoomResourceAttributes> implements RoomResourceAttributes {
  declare id: string;
  declare room_id: string;
  declare booking_id: string | null;
  declare resource_type: RoomResourceType;
  declare title: string | null;
  declare url: string | null;
  declare body: string | null;
  declare mime_type: string | null;
  declare size_bytes: number | null;
  declare storage_key: string | null;
  declare created_by_enrollment_id: string | null;
  declare is_pinned: boolean;
  declare metadata: Record<string, unknown>;
  declare created_at: Date;
  declare updated_at: Date;
}

RoomResource.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    room_id: { type: DataTypes.UUID, allowNull: false },
    booking_id: { type: DataTypes.UUID, allowNull: true },
    resource_type: { type: DataTypes.STRING(20), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: true },
    url: { type: DataTypes.STRING(1000), allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: true },
    mime_type: { type: DataTypes.STRING(120), allowNull: true },
    size_bytes: { type: DataTypes.INTEGER, allowNull: true },
    storage_key: { type: DataTypes.STRING(255), allowNull: true },
    created_by_enrollment_id: { type: DataTypes.UUID, allowNull: true },
    is_pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'room_resources',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['room_id', 'resource_type'], name: 'idx_room_resources_room' },
    ],
  }
);

export default RoomResource;
