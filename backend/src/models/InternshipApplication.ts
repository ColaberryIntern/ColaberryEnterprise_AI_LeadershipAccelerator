import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { InternshipState } from '../services/internship/internshipStateMachine';

/**
 * One person's application to the AI Internship.
 *
 * `state` is the ONLY authority on where the application sits, and it may only
 * be moved through `services/internship/internshipStateMachine.ts` — which is
 * also what decides whether the caller is allowed to move it. Writing this
 * column directly bypasses the human approval gate, so don't.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
 *
 * - No interview answers. Those live in `internship_interview_responses`, keyed
 *   `(application_id, question_key)`, so the guided form and the phone call
 *   write the SAME row and "ask once" is a property of the schema.
 * - No `intake_data_json` catch-all. The contract is explicit: "Do not put the
 *   entire process into Enrollment.intake_data_json."
 * - No score, rank or personality field. The AI's recommendation is recorded on
 *   `InternshipDecision` beside the human's decision, never on the application
 *   as though it were a property of the applicant.
 * - No API key, password or token column, anywhere.
 *
 * ── THE TWO ATTESTATIONS ───────────────────────────────────────────────────
 *
 * `attests_not_employed_fulltime` and `commitment_acknowledged_at` are carried
 * here rather than folded into the interview because AI_INTERNSHIP_SPEC.md
 * records them as "the two things the current email intake actually collects.
 * A form that drops them collects less than the email it replaces." They are
 * surfaced to the reviewer as a blocking flag, never as an automatic rejection.
 */
class InternshipApplication extends Model {
  declare id: string;
  declare enrollment_id: string;
  /** The internship cohort this application is for. Null until one is assigned. */
  declare cohort_id: string | null;
  declare state: InternshipState;
  declare question_set_version: number | null;
  declare interview_channel: 'form' | 'phone' | null;
  declare submitted_at: Date | null;
  declare decided_at: Date | null;
  declare activated_at: Date | null;
  declare attests_not_employed_fulltime: boolean;
  declare commitment_acknowledged_at: Date | null;
  /**
   * Rolling weekly starts: the concrete start is the Monday FOLLOWING the
   * application, computed per applicant. Never read off a fixed cohort field —
   * the internship is a standing programme, not a dated cohort.
   */
  declare desired_start_on: string | null;
  declare converted_from_existing_intern: boolean;
  declare correlation_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InternshipApplication.init(
  {
    id:                            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id:                 { type: DataTypes.UUID, allowNull: false },
    cohort_id:                     { type: DataTypes.UUID, allowNull: true },
    state:                         { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'started' },
    question_set_version:          { type: DataTypes.INTEGER, allowNull: true },
    interview_channel:             { type: DataTypes.STRING(20), allowNull: true },
    submitted_at:                  { type: DataTypes.DATE, allowNull: true },
    decided_at:                    { type: DataTypes.DATE, allowNull: true },
    activated_at:                  { type: DataTypes.DATE, allowNull: true },
    attests_not_employed_fulltime: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    commitment_acknowledged_at:    { type: DataTypes.DATE, allowNull: true },
    desired_start_on:              { type: DataTypes.DATEONLY, allowNull: true },
    converted_from_existing_intern:{ type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    correlation_id:                { type: DataTypes.UUID, allowNull: true },
    created_at:                    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:                    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_applications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default InternshipApplication;
