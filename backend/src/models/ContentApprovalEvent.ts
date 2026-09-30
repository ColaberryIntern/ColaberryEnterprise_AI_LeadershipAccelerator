import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ContentApprovalEvent - append-only audit of every approval decision.
 *
 * Separate from the request row because the request holds CURRENT state while this holds
 * WHAT HAPPENED. Overwriting a request's status loses the history of who asked for changes
 * and why, which is exactly what an approval trail exists to retain.
 *
 * `actor_email` is denormalized alongside `actor_admin_id` on purpose: the audit must stay
 * readable after an admin account is renamed or removed. Same reasoning as
 * TenantAccessAudit, which keeps actor_email and deliberately carries no FKs at all.
 *
 * timestamps: false - append-only, `occurred_at` only, no updated_at.
 */
export type ContentApprovalEventType =
  | 'requested' | 'approved' | 'changes_requested' | 'rejected'
  | 'withdrawn' | 'invalidated' | 'commented';

export const CONTENT_APPROVAL_EVENT_TYPES: readonly ContentApprovalEventType[] = [
  'requested', 'approved', 'changes_requested', 'rejected',
  'withdrawn', 'invalidated', 'commented',
];

export interface ContentApprovalEventAttributes {
  id?: string;
  approval_request_id: string;
  content_item_id: string;
  event_type: ContentApprovalEventType;
  actor_admin_id?: string | null;
  actor_email?: string | null;
  note?: string | null;
  payload?: Record<string, any>;
  occurred_at?: Date;
}

class ContentApprovalEvent
  extends Model<ContentApprovalEventAttributes>
  implements ContentApprovalEventAttributes {
  declare id: string;
  declare approval_request_id: string;
  declare content_item_id: string;
  declare event_type: ContentApprovalEventType;
  declare actor_admin_id: string | null;
  declare actor_email: string | null;
  declare note: string | null;
  declare payload: Record<string, any>;
  declare occurred_at: Date;
}

ContentApprovalEvent.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    approval_request_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'content_approval_requests', key: 'id' },
    },
    content_item_id: { type: DataTypes.UUID, allowNull: false },
    event_type: { type: DataTypes.STRING(40), allowNull: false },
    actor_admin_id: { type: DataTypes.UUID, allowNull: true },
    actor_email: { type: DataTypes.STRING(255), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'content_approval_events', timestamps: false },
);

export default ContentApprovalEvent;
