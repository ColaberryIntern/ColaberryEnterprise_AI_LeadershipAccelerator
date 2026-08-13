import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * TodayPlanFeedback — CAPE Phase 5 learner feedback-control ledger (design
 * doc §11, §16 Phase 5). One row per distinct `(enrollment_id, ref, action)`
 * — a repeat of the same action on the same card is idempotent (see
 * `capeTodayPlanFeedbackService.ts`, the ONLY write path onto this table, via
 * `findOrCreate` keyed on `idempotency_key`).
 *
 * Ranking/personalization signal ONLY — this table is never read by
 * `capeProficiencyService`/`capeEvidenceLedgerService`, and nothing here ever
 * writes to `student_skill_evidence`. "Already know this" alone must never
 * award Architecture Skill evidence (design doc §11, §17).
 *
 * `action` values: `more_like_this` | `less_like_this` | `already_know` |
 * `too_easy` | `too_advanced` | `not_interested`. "Test out" is deliberately
 * NOT a value here — it routes through the existing `diagnostic_attempts`
 * table via `capeDiagnosticService.startDiagnostic(skillId, 'test_out')`.
 *
 * idempotency_key format: today_plan_feedback:<enrollment_id>:<ref>:<action>
 */
export type TodayPlanFeedbackAction =
  | 'more_like_this'
  | 'less_like_this'
  | 'already_know'
  | 'too_easy'
  | 'too_advanced'
  | 'not_interested';

export interface TodayPlanFeedbackAttributes {
  id?: string;
  enrollment_id: string;
  ref: string;
  skill_id?: string | null;
  action: TodayPlanFeedbackAction;
  idempotency_key: string;
  created_at?: Date;
  updated_at?: Date;
}

class TodayPlanFeedback extends Model<TodayPlanFeedbackAttributes>
  implements TodayPlanFeedbackAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare ref: string;
  declare skill_id: string | null;
  declare action: TodayPlanFeedbackAction;
  declare idempotency_key: string;
  declare created_at: Date;
  declare updated_at: Date;
}

TodayPlanFeedback.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    ref: { type: DataTypes.STRING(255), allowNull: false },
    skill_id: { type: DataTypes.STRING(40), allowNull: true },
    action: { type: DataTypes.STRING(30), allowNull: false },
    idempotency_key: { type: DataTypes.STRING(300), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'today_plan_feedback',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['idempotency_key'] },
      { fields: ['enrollment_id', 'ref'] },
      { fields: ['action'] },
    ],
  }
);

export default TodayPlanFeedback;
