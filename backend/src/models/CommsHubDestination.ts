import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubDestination: Who a message goes to, per channel (CH6.1): a cohort feed or an in-app audience. target_id is the
 * cohort id or the audience key; label is what the organizer saw when choosing it.
 * Columns match ensureCommsHubSchema.ts exactly (modelParity test).
 */
// CH9.6 'event_registrants': target_id is the hub event id of a managed Eventbrite event (in-app only).
export type CommsHubDestinationType = 'cohort_feed' | 'in_app_audience' | 'event_registrants' | 'whatsapp_group';

export interface CommsHubDestinationAttributes {
  id?: string;
  message_id: string;
  channel: 'community_post' | 'in_app' | 'whatsapp';
  target_type: CommsHubDestinationType;
  target_id: string;
  label?: string | null;
  created_at?: Date;
}

class CommsHubDestination extends Model<CommsHubDestinationAttributes> implements CommsHubDestinationAttributes {
  declare id: string;
  declare message_id: string;
  declare channel: 'community_post' | 'in_app' | 'whatsapp';
  declare target_type: CommsHubDestinationType;
  declare target_id: string;
  declare label: string | null;
  declare created_at: Date;
}

CommsHubDestination.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    message_id: { type: DataTypes.UUID, allowNull: false },
    channel: { type: DataTypes.STRING(24), allowNull: false },
    target_type: { type: DataTypes.STRING(32), allowNull: false },
    target_id: { type: DataTypes.STRING(64), allowNull: false },
    label: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_destinations', timestamps: true, createdAt: 'created_at', updatedAt: false },
);

export default CommsHubDestination;
