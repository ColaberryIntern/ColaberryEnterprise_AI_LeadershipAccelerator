import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { InternshipReasonCode } from '../services/internship/internshipReasonCodes';

/**
 * One human decision on one application. Append-only.
 *
 * A second decision on the same application is a NEW row, not an edit. An
 * application that was waitlisted and later approved has both, in order, with who
 * made each and when — which is what makes the admin surface's "decision history"
 * an actual history rather than a current value with a timestamp.
 *
 * ── THE THREE TEXT FIELDS ARE NOT INTERCHANGEABLE ──────────────────────────
 *
 *   `student_message`  — written TO the applicant. Emailed verbatim.
 *   `reviewer_notes`   — internal. NEVER emailed, never returned to a participant
 *                        endpoint. `buildStudentFacingReason` does not even take
 *                        it as a parameter, so it cannot leak through that path.
 *   `conditions`       — for "approve with conditions": what the applicant must
 *                        do. Emailed, because they cannot meet a condition nobody
 *                        told them about.
 *
 * ── WHAT THE AI'S OPINION IS DOING HERE ────────────────────────────────────
 *
 * `ai_recommendation` and `ai_factors` sit BESIDE the human's decision rather than
 * on the application, so the two can be compared afterwards ("what did the model
 * suggest, and what did the reviewer actually do?"). Storing the model's reading on
 * the application would make it look like a property of the applicant.
 *
 * `reason_code` is NOT NULL at the database level. A rejection without a
 * student-safe reason is refused by the storage engine, not by a check somebody
 * has to remember to write.
 */
export type DecisionKind =
  | 'approved' | 'approved_with_conditions' | 'rejected'
  | 'waitlisted' | 'information_requested' | 'human_follow_up_scheduled';

class InternshipDecision extends Model {
  declare id: string;
  declare application_id: string;
  declare decision: DecisionKind;
  declare reason_code: InternshipReasonCode;
  declare student_message: string | null;
  declare reviewer_notes: string | null;
  declare conditions: string | null;
  declare reapply_after: string | null;
  declare decided_by: string;
  declare decided_at: Date;
  declare ai_recommendation: string | null;
  declare ai_factors: any;
  declare created_at: Date;
}

InternshipDecision.init(
  {
    id:                { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    application_id:    { type: DataTypes.UUID, allowNull: false },
    decision:          { type: DataTypes.STRING(40), allowNull: false },
    reason_code:       { type: DataTypes.STRING(60), allowNull: false },
    student_message:   { type: DataTypes.TEXT, allowNull: true },
    reviewer_notes:    { type: DataTypes.TEXT, allowNull: true },
    conditions:        { type: DataTypes.TEXT, allowNull: true },
    reapply_after:     { type: DataTypes.DATEONLY, allowNull: true },
    decided_by:        { type: DataTypes.STRING(255), allowNull: false },
    decided_at:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ai_recommendation: { type: DataTypes.STRING(40), allowNull: true },
    ai_factors:        { type: DataTypes.JSONB, allowNull: true },
    created_at:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_decisions',
    timestamps: false,
  },
);

export default InternshipDecision;
