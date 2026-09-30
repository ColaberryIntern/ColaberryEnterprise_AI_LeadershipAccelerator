import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyConversationOwnership — who is talking to this person right now
 * (§7.3 "human conversation status"; §11 the pause; Phase 4 T402).
 *
 * ─── THE SOURCE `human_conversation` NEVER HAD ──────────────────────────────
 *
 * Since T304 every decision has carried `human_conversation: 'unknown'`, with
 * the reason that nothing in this codebase ties a thread to a lead. This row
 * is that source. It is opened when a human accepts a handoff (T405), when a
 * human's own activity on the lead is seen (`activities` with a human author),
 * or when Ali's personal outreach went out (`communication_logs` outbound with
 * that trigger) — and cleared when the human releases or dispositions. One
 * OPEN row per lead per brand: `cleared_at IS NULL` is the partial unique's
 * predicate, so "who has this person" has exactly one answer while a cleared
 * row stays as history.
 *
 * ─── MUTABLE, AND OUTSIDE THE APPEND-ONLY GUARD ─────────────────────────────
 *
 * Clearing is an update (`cleared_at`, `cleared_by`, `cleared_reason`), so this
 * model maintains `updated_at` and is not in the append-only guard's pattern.
 * The two writers are `openHumanConversation` and `clearHumanConversation`
 * in `services/growthJourney/conversationOwnershipService.ts`, nothing else.
 *
 * ─── WHAT IT DOES NOT SAY ───────────────────────────────────────────────────
 *
 * Whether the person may be contacted. That is `contactEvidence.ts`'s
 * composition of the existing evaluators; this row only answers whether a
 * human already owns the thread, which pauses the AI's commercial outreach.
 */

export type ConversationOwnerType = 'human' | 'ai';

export type ConversationOwnershipSource =
  | 'handoff_accepted'
  | 'human_activity'
  | 'ali_personal_outreach'
  | 'manual_claim';

export interface GrowthJourneyConversationOwnershipAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  lead_id: number;
  owner_type: ConversationOwnerType;
  owner_id?: string | null;
  channel?: string | null;
  source: ConversationOwnershipSource;
  since_at?: Date;
  cleared_at?: Date | null;
  cleared_by?: string | null;
  cleared_reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class GrowthJourneyConversationOwnership
  extends Model<GrowthJourneyConversationOwnershipAttributes>
  implements GrowthJourneyConversationOwnershipAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare lead_id: number;
  declare owner_type: ConversationOwnerType;
  declare owner_id: string | null;
  declare channel: string | null;
  declare source: ConversationOwnershipSource;
  declare since_at: Date;
  declare cleared_at: Date | null;
  declare cleared_by: string | null;
  declare cleared_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GrowthJourneyConversationOwnership.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    lead_id: { type: DataTypes.INTEGER, allowNull: false },
    owner_type: { type: DataTypes.STRING(8), allowNull: false },
    owner_id: { type: DataTypes.STRING(255), allowNull: true },
    channel: { type: DataTypes.STRING(16), allowNull: true },
    source: { type: DataTypes.STRING(32), allowNull: false },
    since_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    cleared_at: { type: DataTypes.DATE, allowNull: true },
    cleared_by: { type: DataTypes.STRING(128), allowNull: true },
    cleared_reason: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    sequelize,
    tableName: 'growth_journey_conversation_ownership',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default GrowthJourneyConversationOwnership;
