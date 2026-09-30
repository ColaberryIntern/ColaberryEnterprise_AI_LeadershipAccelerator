import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryCapacityOverride — a signed, time-bounded exception to a builder's parallel cap.
 *
 * The table has existed in `ensureRefactoredDeliverySchema` since Gate 12 and **had no
 * model**, so nothing could read it. `effectiveMaxParallelProjects` took an
 * `ActiveOverride | null` that no code path was able to supply, which meant the override
 * mechanism was unreachable rather than merely unused.
 *
 * ## Expiry is the point, not a nicety
 *
 * `expires_at` is NOT NULL, and `effectiveMaxParallelProjects` falls back to the profile
 * cap the moment it passes. Nobody has to remember to revoke anything — which is the
 * whole reason the expiry is mandatory. An override that had to be manually withdrawn
 * would quietly become permanent, and "we raised his cap once in March" is how a capacity
 * model stops meaning anything.
 *
 * `revoked_at` exists for the early withdrawal case and is deliberately separate from
 * expiry: revoking early is a decision someone made, and expiring is a decision nobody
 * had to.
 *
 * ## Rows are never updated in place
 *
 * A granted override is a record of what someone signed. Editing it would rewrite that,
 * so a change is a new row and a revocation stamps `revoked_at`.
 */
export interface DeliveryCapacityOverrideAttributes {
  id: string;
  builder_identity_id: string;
  granted_by_identity_id: string;
  base_max_parallel_projects: number;
  override_max_parallel_projects: number;
  reason: string;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_by_identity_id: string | null;
  created_at: Date;
}

class DeliveryCapacityOverride
  extends Model<DeliveryCapacityOverrideAttributes>
  implements DeliveryCapacityOverrideAttributes
{
  declare id: string;
  declare builder_identity_id: string;
  declare granted_by_identity_id: string;
  declare base_max_parallel_projects: number;
  declare override_max_parallel_projects: number;
  declare reason: string;
  declare expires_at: Date;
  declare revoked_at: Date | null;
  declare revoked_by_identity_id: string | null;
  declare created_at: Date;
}

DeliveryCapacityOverride.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    builder_identity_id: { type: DataTypes.UUID, allowNull: false },
    // Who signed it. An exception with no signatory is an accident, not a decision.
    granted_by_identity_id: { type: DataTypes.UUID, allowNull: false },
    // The cap at the moment of granting, kept so the record still reads correctly after
    // the builder's profile cap changes underneath it.
    base_max_parallel_projects: { type: DataTypes.INTEGER, allowNull: false },
    override_max_parallel_projects: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    revoked_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'delivery_capacity_overrides',
    timestamps: false,
    indexes: [
      {
        fields: ['builder_identity_id', 'expires_at'],
        name: 'idx_delivery_capacity_overrides_active',
      },
    ],
  },
);

export default DeliveryCapacityOverride;
