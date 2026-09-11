import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ContentApprovalRequest - a REAL approval gate for content.
 *
 * Deliberately NOT `models/ApprovalRequest.ts`, whose own header states it is SHADOW MODE
 * ONLY - "nothing reads `status` to gate a real action" - and whose table FKs to tickets,
 * agent_runs and work_ledger_events, a different domain. Reusing it would mean building a
 * gate on top of something documented as not gating anything.
 *
 * `revision_at_decision` is what makes an approval expire. contentWorkflowService (T021, NOT
 * YET BUILT) will compare it against the item's current `revision`; if the content moved on after approval, the
 * approval no longer authorises a publish (spec 8.3). Storing the revision rather than a
 * boolean means the audit trail says WHICH version was approved, not merely that something
 * once was.
 */
export type ContentApprovalStatus =
  | 'pending' | 'approved' | 'changes_requested' | 'rejected' | 'invalidated' | 'withdrawn';

export const CONTENT_APPROVAL_STATUSES: readonly ContentApprovalStatus[] = [
  'pending', 'approved', 'changes_requested', 'rejected', 'invalidated', 'withdrawn',
];

export interface ContentApprovalRequestAttributes {
  id?: string;
  content_item_id: string;
  tenant_id: string;
  brand_id?: string | null;
  status?: ContentApprovalStatus;
  requested_by?: string | null;
  requested_at?: Date;
  required_approver_id?: string | null;
  decided_by?: string | null;
  decided_at?: Date | null;
  decision_note?: string | null;
  revision_at_request?: number;
  revision_at_decision?: number | null;
  invalidated_at?: Date | null;
  invalidated_reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class ContentApprovalRequest
  extends Model<ContentApprovalRequestAttributes>
  implements ContentApprovalRequestAttributes {
  declare id: string;
  declare content_item_id: string;
  declare tenant_id: string;
  declare brand_id: string | null;
  declare status: ContentApprovalStatus;
  declare requested_by: string | null;
  declare requested_at: Date;
  declare required_approver_id: string | null;
  declare decided_by: string | null;
  declare decided_at: Date | null;
  declare decision_note: string | null;
  declare revision_at_request: number;
  declare revision_at_decision: number | null;
  declare invalidated_at: Date | null;
  declare invalidated_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ContentApprovalRequest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    content_item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'content_items', key: 'id' },
    },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
    requested_by: { type: DataTypes.UUID, allowNull: true },
    requested_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    required_approver_id: { type: DataTypes.UUID, allowNull: true },
    decided_by: { type: DataTypes.UUID, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    decision_note: { type: DataTypes.TEXT, allowNull: true },
    revision_at_request: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    revision_at_decision: { type: DataTypes.INTEGER, allowNull: true },
    invalidated_at: { type: DataTypes.DATE, allowNull: true },
    invalidated_reason: { type: DataTypes.STRING(200), allowNull: true },
  },
  { sequelize, tableName: 'content_approval_requests', timestamps: true, underscored: true },
);

export default ContentApprovalRequest;
