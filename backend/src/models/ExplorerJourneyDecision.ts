import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type {
  ExplorerPrimaryState,
  ExplorerOverlay,
  ExplorerDecisionMode,
  ExplorerActionType,
  ExplorerCandidateAction,
  ExplorerSuppressedAction,
} from '../types/explorerGrowth';

/**
 * explorer_journey_decisions — APPEND-ONLY audit spine.
 * Plan: docs/EXPLORER_GROWTH_OS_PLAN.md §5.4 T2, §17.
 *
 * Answers, for any learner on any day: "why did they receive this — and why did
 * they NOT receive the other four things they qualified for?" Hence
 * `candidate_actions` and `suppressed_actions` alongside the winner; a log that
 * records only what was sent cannot explain a suppression, which is most of what
 * this system does.
 *
 * A row is written in EVERY mode, including observe/shadow where nothing runs
 * (`executed=false`). A WAIT is a decision and is recorded as one.
 *
 * UNIQUE (enrollment_id, decision_date), created by ensureExplorerGrowthSchema(),
 * IS the idempotency guarantee — a worker running twice in a day cannot produce a
 * duplicate communication. Enforced at the DB, not here, because an
 * application-level check loses to a race.
 *
 * Never mutate a row except to back-fill `outcome`/`outcome_at`.
 */
interface ExplorerJourneyDecisionAttributes {
  id?: string;
  enrollment_id: string;
  lead_id?: number | null;
  decision_date: string;
  mode: ExplorerDecisionMode;
  primary_state?: ExplorerPrimaryState | null;
  overlays?: ExplorerOverlay[];
  e_score?: number | null;
  i_score?: number | null;
  f_score?: number | null;
  triggering_signals?: Record<string, any>[];
  candidate_actions?: ExplorerCandidateAction[];
  suppressed_actions?: ExplorerSuppressedAction[];
  selected_action?: ExplorerActionType | null;
  selected_campaign_id?: string | null;
  selected_sequence_step?: number | null;
  selected_content_assets?: Record<string, any>[];
  channel?: string | null;
  reason: string;
  deferred_actions?: Record<string, any>[];
  ai_involved?: boolean;
  ai_rationale?: string | null;
  ruleset_version: string;
  holdout_group?: string | null;
  experiment_key?: string | null;
  executed?: boolean;
  scheduled_email_id?: string | null;
  outcome?: string | null;
  outcome_at?: Date | null;
  created_at?: Date;
}

class ExplorerJourneyDecision
  extends Model<ExplorerJourneyDecisionAttributes>
  implements ExplorerJourneyDecisionAttributes
{
  declare id: string;
  declare enrollment_id: string;
  declare lead_id: number | null;
  declare decision_date: string;
  declare mode: ExplorerDecisionMode;
  declare primary_state: ExplorerPrimaryState | null;
  declare overlays: ExplorerOverlay[];
  declare e_score: number | null;
  declare i_score: number | null;
  declare f_score: number | null;
  declare triggering_signals: Record<string, any>[];
  declare candidate_actions: ExplorerCandidateAction[];
  declare suppressed_actions: ExplorerSuppressedAction[];
  declare selected_action: ExplorerActionType | null;
  declare selected_campaign_id: string | null;
  declare selected_sequence_step: number | null;
  declare selected_content_assets: Record<string, any>[];
  declare channel: string | null;
  declare reason: string;
  declare deferred_actions: Record<string, any>[];
  declare ai_involved: boolean;
  declare ai_rationale: string | null;
  declare ruleset_version: string;
  declare holdout_group: string | null;
  declare experiment_key: string | null;
  declare executed: boolean;
  declare scheduled_email_id: string | null;
  declare outcome: string | null;
  declare outcome_at: Date | null;
  declare created_at: Date;
}

ExplorerJourneyDecision.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'enrollments', key: 'id' } },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    decision_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'UNIQUE with enrollment_id — one decision per learner per day.',
    },
    mode: { type: DataTypes.STRING(24), allowNull: false },
    primary_state: { type: DataTypes.STRING(32), allowNull: true },
    overlays: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
    e_score: { type: DataTypes.SMALLINT, allowNull: true },
    i_score: { type: DataTypes.SMALLINT, allowNull: true },
    f_score: { type: DataTypes.SMALLINT, allowNull: true },
    triggering_signals: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    candidate_actions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    // The "why NOT" record. Without it a suppression is unexplainable.
    suppressed_actions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    // Null means WAIT — still a recorded decision, not an absence of one.
    selected_action: { type: DataTypes.STRING(48), allowNull: true },
    selected_campaign_id: { type: DataTypes.UUID, allowNull: true },
    selected_sequence_step: { type: DataTypes.SMALLINT, allowNull: true },
    selected_content_assets: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    channel: { type: DataTypes.STRING(16), allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: false },
    deferred_actions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    ai_involved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ai_rationale: { type: DataTypes.TEXT, allowNull: true },
    // Stamped so a historical decision can be replayed against the rules that made it.
    ruleset_version: { type: DataTypes.STRING(16), allowNull: false },
    holdout_group: { type: DataTypes.STRING(24), allowNull: true },
    experiment_key: { type: DataTypes.STRING(64), allowNull: true },
    // False in observe/shadow. An executed=true row in those modes is a critical alarm.
    executed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    scheduled_email_id: { type: DataTypes.UUID, allowNull: true },
    outcome: { type: DataTypes.STRING(32), allowNull: true },
    outcome_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'explorer_journey_decisions',
    timestamps: false,
  },
);

export default ExplorerJourneyDecision;
