import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyInAppNudge — the in-app channel's delivery: the row a learner's
 * portal reads (§8 Layer 1 `SHOW_IN_APP_NUDGE`; Phase 5 T503).
 *
 * ─── WHY A NEW TABLE, WHEN THE RULE IS TO REUSE ─────────────────────────────
 *
 * There is no per-learner nudge surface in this codebase to reuse. Timeline
 * card pins are global; the community notification bell is keyed on
 * `community_members`, its types are CHECK-constrained to community events, and
 * its digest SENDS EMAIL — writing a journey nudge there would mail people.
 * So the surface is this table, and it is deliberately thin.
 *
 * ─── NO BODY, NO ADDRESS ────────────────────────────────────────────────────
 *
 * `title` and `href` are copied at execution time from the decision's APPROVED
 * content asset, so nothing a model wrote without a human's approval can reach
 * a learner through this table. `shown_at` and `dismissed_at` are the learner's
 * own two actions, and `execution_id` is unique, so one execution is one nudge.
 */

export interface GrowthJourneyInAppNudgeAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  program_id?: string | null;
  enrollment_id: string;
  execution_id: string;
  title: string;
  href?: string | null;
  purpose?: string | null;
  created_at?: Date;
  shown_at?: Date | null;
  dismissed_at?: Date | null;
  expires_at?: Date | null;
}

class GrowthJourneyInAppNudge
  extends Model<GrowthJourneyInAppNudgeAttributes>
  implements GrowthJourneyInAppNudgeAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare program_id: string | null;
  declare enrollment_id: string;
  declare execution_id: string;
  declare title: string;
  declare href: string | null;
  declare purpose: string | null;
  declare created_at: Date;
  declare shown_at: Date | null;
  declare dismissed_at: Date | null;
  declare expires_at: Date | null;
}

GrowthJourneyInAppNudge.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    program_id: { type: DataTypes.UUID, allowNull: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    execution_id: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.TEXT, allowNull: false },
    href: { type: DataTypes.TEXT, allowNull: true },
    purpose: { type: DataTypes.STRING(32), allowNull: true },
    shown_at: { type: DataTypes.DATE, allowNull: true },
    dismissed_at: { type: DataTypes.DATE, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'growth_journey_in_app_nudges',
    // Written once, then stamped by the learner's own two actions; no `updated_at`.
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);

export default GrowthJourneyInAppNudge;
