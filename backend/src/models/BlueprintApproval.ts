import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * An immutable approval of one exact blueprint revision.
 *
 * WHAT AN APPROVAL BINDS, and why each field is here rather than inferred:
 *   - `approved_by` + `approved_by_role` — the actor AND the role that authorized them. Read
 *     from the authenticated session, NEVER from a request body (the pattern factoryRoutes
 *     already follows). An AI identity never populates this: building the mechanism is not
 *     authorization to use it on a customer's behalf.
 *   - `tenant_id` — so an approval cannot be made to resolve across tenants.
 *   - `manifest_id` + `revision` + `content_sha256` — the exact thing approved. A stale
 *     approval (the revision moved) and a superseded revision are both refused server-side.
 *   - `scope` — 'documented' | 'full', reusing the Factory's existing ApprovalLevel vocabulary
 *     rather than inventing a parallel one.
 *   - `selected_design_ref` — the design variant and visual-contract revision the owner chose,
 *     because approving a blueprint without recording which design was selected approves nothing
 *     in particular.
 *   - `rationale` — why. Especially load-bearing for a below-target automation share, where the
 *     owner is accepting a tradeoff rather than rubber-stamping a number.
 *
 * NO ROW IS EVER UPDATED. `uq_blueprint_approval_revision` makes an approval of a given revision
 * happen at most once, which is what lets a retried approval return the ORIGINAL approver and
 * timestamp instead of quietly re-stamping who approved what, and when — the reasoning
 * deliveryContractService.ts:178-179 already records. There is no `updated_at` for the same
 * reason.
 *
 * Separation of duty is enforced in the service against the manifest's `proposed_by`, not here:
 * a constraint cannot express "approver differs from proposer" across two tables.
 *
 * Schema: db/ensureProjectLifecycleSchema.ts. Policy: docs/project-lifecycle/approval-and-change-policy.md.
 */
export interface BlueprintApprovalAttributes {
  id?: string;
  tenant_id: string;
  manifest_id: string;
  revision: number;
  content_sha256: string;
  scope: string;
  approved_by: string;
  approved_by_role?: string | null;
  rationale?: string | null;
  selected_design_ref?: string | null;
  approved_at?: Date;
}

class BlueprintApproval extends Model<BlueprintApprovalAttributes> implements BlueprintApprovalAttributes {
  declare id: string;
  declare tenant_id: string;
  declare manifest_id: string;
  declare revision: number;
  declare content_sha256: string;
  declare scope: string;
  declare approved_by: string;
  declare approved_by_role: string | null;
  declare rationale: string | null;
  declare selected_design_ref: string | null;
  declare approved_at: Date;
}

BlueprintApproval.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    manifest_id: { type: DataTypes.UUID, allowNull: false },
    revision: { type: DataTypes.INTEGER, allowNull: false },
    content_sha256: { type: DataTypes.STRING(64), allowNull: false },
    scope: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'documented' },
    approved_by: { type: DataTypes.TEXT, allowNull: false },
    approved_by_role: { type: DataTypes.TEXT, allowNull: true },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    selected_design_ref: { type: DataTypes.TEXT, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'blueprint_approvals',
    // createdAt maps to approved_at; there is no updated_at because an approval is never edited.
    timestamps: false,
    underscored: true,
  },
);

export default BlueprintApproval;
