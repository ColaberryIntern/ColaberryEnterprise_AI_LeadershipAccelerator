import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CommsHubMessage: One message (CH6.1): about an event or a subject, its status and send time. CH6.2 owns the status
 * transitions. A promotion-plan message (plan_kind) is unique per event + kind + occurrence.
 * Columns match ensureCommsHubSchema.ts exactly (modelParity test).
 */
export type CommsHubMessageStatus = 'draft' | 'needs_approval' | 'approved' | 'scheduled' | 'sending' | 'sent' | 'partially_failed' | 'failed' | 'cancelled';
export type CommsHubMessageKind = 'announcement' | 'reminder' | 'starting_soon' | 'recording_thanks' | 'time_change' | 'cancellation' | 'update' | 'other';
/** CH6.5: what the message carries from the event (Compose "Include"). */
export interface CommsHubInclude { thumbnail: boolean; join_link: boolean; registration_link: boolean }
export type CommsHubPlanKind = 'announcement' | 'reminder' | 'starting_soon' | 'recording_thanks';

export interface CommsHubMessageAttributes {
  id?: string;
  event_id?: string | null;
  occurrence_starts_at?: Date | null;
  plan_kind?: CommsHubPlanKind | null;
  subject?: string | null;
  kind?: CommsHubMessageKind;
  tone?: string | null;
  notes?: string | null;
  include?: CommsHubInclude;
  status?: CommsHubMessageStatus;
  send_at?: Date | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class CommsHubMessage extends Model<CommsHubMessageAttributes> implements CommsHubMessageAttributes {
  declare id: string;
  declare event_id: string | null;
  declare occurrence_starts_at: Date | null;
  declare plan_kind: CommsHubPlanKind | null;
  declare subject: string | null;
  declare kind: CommsHubMessageKind;
  declare tone: string | null;
  declare notes: string | null;
  declare include: CommsHubInclude;
  declare status: CommsHubMessageStatus;
  declare send_at: Date | null;
  declare created_by: string | null;
  declare updated_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CommsHubMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    event_id: { type: DataTypes.UUID, allowNull: true },
    occurrence_starts_at: { type: DataTypes.DATE, allowNull: true },
    plan_kind: { type: DataTypes.STRING(32), allowNull: true },
    subject: { type: DataTypes.TEXT, allowNull: true },
    kind: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'other' },
    tone: { type: DataTypes.STRING(32), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    include: { type: DataTypes.JSONB, allowNull: false, defaultValue: { thumbnail: true, join_link: true, registration_link: true } },
    status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'draft' },
    send_at: { type: DataTypes.DATE, allowNull: true },
    created_by: { type: DataTypes.STRING(64), allowNull: true },
    updated_by: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'comms_hub_messages', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' },
);

export default CommsHubMessage;
