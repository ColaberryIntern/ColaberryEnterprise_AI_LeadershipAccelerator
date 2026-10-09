import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { DesignDecisionStatus, DesignTier } from '../services/delivery/deliveryDesignLoop';

/**
 * BlueprintDesignDecision — one governed design decision, bound to the blueprint revision it
 * was taken against.
 *
 * §4.5: "Approval records reference the selected variant and visual contract revision."
 *
 * ## Why this model ships in the same change as its table
 *
 * `blueprint_role_map` is already in the carried-forward register as an open obligation for
 * exactly one reason: **a table with no model has no reader**. Shipping two more tables without
 * models would repeat a known obligation rather than discharge it, so the models are here.
 *
 * ## The vocabulary is IMPORTED, not redeclared
 *
 * `tier` and `status` are typed against `DesignTier` and `DesignDecisionStatus` in
 * `services/delivery/deliveryDesignLoop`, which is also why the DDL carries no `CHECK (tier IN
 * (...))`. One definition of the vocabulary, in the module that reasons about it. A CHECK list in
 * DDL plus a union in TypeScript is two definitions that a future change silently splits.
 *
 * ## `manifest_content_hash` is RECORDED, not acted on
 *
 * The hash is computed today at `blueprintApproval.ts:104-116` over `manifest.refs_json`. But
 * **nothing in production writes `refs_json`**, and no material-vs-cosmetic classifier exists
 * anywhere in `backend/src` — so the rule "a design change invalidates the right approvals"
 * cannot be implemented here, and it is deferred with its three parts named in the register.
 * Storing the hash now is what lets that classifier arrive later without a backfill. It is not a
 * claim that invalidation works.
 *
 * ## Supersession, never silent overwrite
 *
 * `supersedes_decision_id` is a self-reference, and the uniqueness index on the table is PARTIAL
 * (`WHERE status = 'approved'`). Many rows per tier over time is correct; many APPROVED rows at
 * one tier is not, because then nothing can say what was agreed.
 *
 * ## No `indexes` block below, deliberately
 *
 * `ensureProjectLifecycleSchema` owns the DDL, including the partial index that `sync()` cannot
 * express. Declaring indexes here would invite a `sync()` to create a DIFFERENT, non-partial one
 * — and this repo has already been bitten by a `sync()` running ahead of an `ensure*Schema` and
 * producing a schema the tests then validated instead of the real one.
 */
export interface BlueprintDesignDecisionAttributes {
  id?: string;
  tenant_id: string;
  /** The blueprint revision this decision was taken against. */
  manifest_id: string;
  /** The manifest hash at the time of the decision. Recorded; see the header. */
  manifest_content_hash: string;
  tier: DesignTier;
  title?: string | null;
  status: DesignDecisionStatus;
  /** 0 for tiers where variants are not meaningful. No upper bound here: `MAX_VARIANTS` lives
   *  in `deliveryDesignLoop` and a second bound would be a second rule. */
  variant_count?: number;
  approved_variant_id?: string | null;
  /** `<alternativeId>@vc<revision>` from `designSelection.selectDesign`. */
  selected_design_ref?: string | null;
  rationale?: string | null;
  approved_by_identity_id?: string | null;
  supersedes_decision_id?: string | null;
  /** Which Design DNA facets this decision addresses. An ARRAY at the database level. */
  dna_facets?: string[];
  created_at?: Date;
}

class BlueprintDesignDecision extends Model<BlueprintDesignDecisionAttributes>
  implements BlueprintDesignDecisionAttributes {
  declare id: string;
  declare tenant_id: string;
  declare manifest_id: string;
  declare manifest_content_hash: string;
  declare tier: DesignTier;
  declare title: string | null;
  declare status: DesignDecisionStatus;
  declare variant_count: number;
  declare approved_variant_id: string | null;
  declare selected_design_ref: string | null;
  declare rationale: string | null;
  declare approved_by_identity_id: string | null;
  declare supersedes_decision_id: string | null;
  declare dna_facets: string[];
  declare created_at: Date;
}

BlueprintDesignDecision.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    manifest_id: { type: DataTypes.UUID, allowNull: false },
    manifest_content_hash: { type: DataTypes.TEXT, allowNull: false },
    tier: { type: DataTypes.TEXT, allowNull: false },
    title: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.TEXT, allowNull: false },
    variant_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    approved_variant_id: { type: DataTypes.TEXT, allowNull: true },
    selected_design_ref: { type: DataTypes.TEXT, allowNull: true },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    approved_by_identity_id: { type: DataTypes.TEXT, allowNull: true },
    supersedes_decision_id: { type: DataTypes.UUID, allowNull: true },
    dna_facets: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'blueprint_design_decisions',
    timestamps: false,
  },
);

export default BlueprintDesignDecision;
