import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubWhatsAppGroup: a WhatsApp group the hub's connected number belongs to (CH10.2), synced from
 * the provider. Every group starts not enabled; Jackie switches on each one she wants to send to.
 * A group no longer listed keeps its row with left_at set. Columns match ensureCommsHubSchema.ts exactly.
 */
export interface CommsHubWhatsAppGroupAttributes {
  id?: string;
  provider_group_id: string;
  name: string;
  participants_count?: number;
  announcements?: boolean;
  our_rank?: string | null;
  suspended?: boolean;
  terminated?: boolean;
  left_at?: Date | null;
  enabled?: boolean;
  cant_send_reason?: string | null;
  last_synced_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

class CommsHubWhatsAppGroup extends Model<CommsHubWhatsAppGroupAttributes> implements CommsHubWhatsAppGroupAttributes {
  declare id: string;
  declare provider_group_id: string;
  declare name: string;
  declare participants_count: number;
  declare announcements: boolean;
  declare our_rank: string | null;
  declare suspended: boolean;
  declare terminated: boolean;
  declare left_at: Date | null;
  declare enabled: boolean;
  declare cant_send_reason: string | null;
  declare last_synced_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

CommsHubWhatsAppGroup.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    provider_group_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    participants_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    announcements: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    our_rank: { type: DataTypes.STRING(16), allowNull: true },
    suspended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    terminated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    left_at: { type: DataTypes.DATE, allowNull: true },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    cant_send_reason: { type: DataTypes.STRING(32), allowNull: true },
    last_synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_whatsapp_groups', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' },
);

export default CommsHubWhatsAppGroup;
