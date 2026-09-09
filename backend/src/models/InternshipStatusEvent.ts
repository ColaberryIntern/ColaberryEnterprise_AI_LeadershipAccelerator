import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { InternshipActor, InternshipState } from '../services/internship/internshipStateMachine';

/**
 * One append-only record per lifecycle transition.
 *
 * The contract: "Every transition must record previous state, new state, actor,
 * reason, evidence/source, timestamp, and correlation ID." This table is that
 * record, and it is the backbone of the admin surface's requirement for "a
 * chronological audit trail from Today-card impression through application,
 * interview, decision, offer letter, uploaded signature, verification, cohort
 * membership, projects, curriculum, certification, and exit."
 *
 * APPEND ONLY. Nothing updates or deletes a row here. An application's history
 * is the sequence of these events; if a transition was wrong, the correction is
 * another event, not an edit. That is what makes the trail evidence rather than
 * a summary — a mutable audit log tells you what someone last believed, not what
 * happened.
 *
 * `actor_type` mirrors the state machine's actor union, so reading the log
 * answers "did a human approve this, or did something automated?" directly. It
 * is the field an auditor looks at first.
 */
class InternshipStatusEvent extends Model {
  declare id: string;
  declare application_id: string;
  /** Null only for the very first event, which has no previous state. */
  declare from_state: InternshipState | null;
  declare to_state: InternshipState;
  declare actor_type: InternshipActor;
  /** Admin id, enrollment id, or a system component name. Never a token. */
  declare actor_id: string | null;
  declare reason: string | null;
  /** Where the fact came from: 'reviewer_ui', 'synthflow_webhook', 'paysimple', … */
  declare evidence_source: string | null;
  declare correlation_id: string | null;
  declare created_at: Date;
}

InternshipStatusEvent.init(
  {
    id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    application_id:  { type: DataTypes.UUID, allowNull: false },
    from_state:      { type: DataTypes.STRING(40), allowNull: true },
    to_state:        { type: DataTypes.STRING(40), allowNull: false },
    actor_type:      { type: DataTypes.STRING(20), allowNull: false },
    actor_id:        { type: DataTypes.STRING(255), allowNull: true },
    reason:          { type: DataTypes.TEXT, allowNull: true },
    evidence_source: { type: DataTypes.STRING(120), allowNull: true },
    correlation_id:  { type: DataTypes.UUID, allowNull: true },
    created_at:      { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_status_events',
    timestamps: false,
  },
);

export default InternshipStatusEvent;
