import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * BlueprintVisualContract — what Gate 9's visual diff compares an implementation against.
 *
 * §4.5 requires an approval record to reference the selected variant **and the visual contract
 * revision**. That is why `revision` is a column rather than an implicit "latest row": a
 * reference that can resolve to two rows is not a reference, and the unique index on
 * `(tenant_id, decision_id, revision)` is what makes it resolve to one.
 *
 * ## `acceptable_variance` is bounded in the database as well as in memory
 *
 * `validateVisualContract` in `deliveryDesignLoop` already refuses a variance outside 0..1, and
 * the DDL carries `ck_visual_contract_variance_fraction` too. That is not a duplicated rule —
 * 0..1 is the domain of a fraction, not a tunable policy — and the reason for defence in depth
 * is that this particular corruption is SILENT: outside the range the diff passes every screen
 * or fails every screen depending on which default someone picked, and nothing errors.
 *
 * Nullable, because a contract can exist before its threshold is agreed. `validateVisualContract`
 * is what refuses to let a null one gate anything; the column only refuses nonsense.
 *
 * ## No `indexes` block below
 *
 * Same reason as `BlueprintDesignDecision`: `ensureProjectLifecycleSchema` owns the DDL, and a
 * `sync()` acting on a model-declared index is how a schema the tests validate stops being the
 * schema that shipped.
 */
export interface BlueprintVisualContractAttributes {
  id?: string;
  tenant_id: string;
  /** The design decision this contract belongs to. */
  decision_id: string;
  /** The revision an approval record references. One row per (tenant, decision, revision). */
  revision: number;
  /** Regions a screen must have. An ARRAY at the database level. */
  required_regions?: string[];
  /** Actions a screen must offer. An ARRAY at the database level. */
  required_actions?: string[];
  hierarchy?: string | null;
  responsive_rules?: Record<string, unknown> | null;
  accessibility_rules?: Record<string, unknown> | null;
  /** What the diff compares against. Without it the contract cannot gate anything. */
  reference_snapshot_ref?: string | null;
  /** A fraction in 0..1, or null while the threshold is still unagreed. */
  acceptable_variance?: number | null;
  created_at?: Date;
}

class BlueprintVisualContract extends Model<BlueprintVisualContractAttributes>
  implements BlueprintVisualContractAttributes {
  declare id: string;
  declare tenant_id: string;
  declare decision_id: string;
  declare revision: number;
  declare required_regions: string[];
  declare required_actions: string[];
  declare hierarchy: string | null;
  declare responsive_rules: Record<string, unknown> | null;
  declare accessibility_rules: Record<string, unknown> | null;
  declare reference_snapshot_ref: string | null;
  declare acceptable_variance: number | null;
  declare created_at: Date;
}

BlueprintVisualContract.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    decision_id: { type: DataTypes.UUID, allowNull: false },
    revision: { type: DataTypes.INTEGER, allowNull: false },
    required_regions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    required_actions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    hierarchy: { type: DataTypes.TEXT, allowNull: true },
    responsive_rules: { type: DataTypes.JSONB, allowNull: true },
    accessibility_rules: { type: DataTypes.JSONB, allowNull: true },
    reference_snapshot_ref: { type: DataTypes.TEXT, allowNull: true },
    // NUMERIC in the DDL. Sequelize returns NUMERIC as a STRING by default to avoid silent
    // precision loss, which is why the integration suite reads it back with Number() rather
    // than asserting strict equality against a float literal.
    acceptable_variance: { type: DataTypes.DECIMAL, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'blueprint_visual_contracts',
    timestamps: false,
  },
);

export default BlueprintVisualContract;
