import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One try at delivering an assignment.
 *
 * A student may rehearse many times; each attempt is its own row with its own
 * booking, recording and feedback. Retrying must never overwrite the evidence of a
 * previous try, which is why `attempt_no` is part of the unique key rather than a
 * mutable "latest" pointer.
 *
 * `occurrence_uuid` is the PROVIDER's immutable id for one meeting occurrence. A Zoom
 * meeting id is reused across recurrences, so matching a recording on meeting id
 * alone attaches part of Tuesday's session to Thursday's attempt.
 *
 * ATTEMPT STATE AND RECORDING STATE ARE SEPARATE on purpose. "A recording is
 * processing" and "the student has presented" are different facts, and one badge
 * cannot carry both without lying about one of them.
 */
export type PresentationAttemptMode =
  | 'practice_solo' | 'practice_peer' | 'cohort_live';
export type PresentationAttemptState =
  | 'draft' | 'scheduled' | 'live' | 'recorded' | 'reviewed' | 'final_selected';
export type PresentationRecordingState =
  | 'expected' | 'processing' | 'ready' | 'missing' | 'failed' | 'review' | 'superseded';

export interface PresentationAttemptAttributes {
  id?: string;
  assignment_id: string;
  attempt_no: number;
  mode?: PresentationAttemptMode;
  booking_id?: string | null;
  room_id?: string | null;
  occurrence_uuid?: string | null;
  audience?: string | null;
  checklist_snapshot_json?: Record<string, unknown>;
  selected_material_ids?: string[];
  attempt_state?: PresentationAttemptState;
  recording_state?: PresentationRecordingState;
  is_final_take?: boolean;
  join_intent_at?: Date | null;
  started_at?: Date | null;
  ended_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class PresentationAttempt
  extends Model<PresentationAttemptAttributes>
  implements PresentationAttemptAttributes {
  declare id: string;
  declare assignment_id: string;
  declare attempt_no: number;
  declare mode: PresentationAttemptMode;
  declare booking_id: string | null;
  declare room_id: string | null;
  declare occurrence_uuid: string | null;
  declare audience: string | null;
  declare checklist_snapshot_json: Record<string, unknown>;
  declare selected_material_ids: string[];
  declare attempt_state: PresentationAttemptState;
  declare recording_state: PresentationRecordingState;
  declare is_final_take: boolean;
  declare join_intent_at: Date | null;
  declare started_at: Date | null;
  declare ended_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

PresentationAttempt.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    assignment_id: { type: DataTypes.UUID, allowNull: false },
    attempt_no: { type: DataTypes.INTEGER, allowNull: false },
    mode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'practice_solo' },
    booking_id: { type: DataTypes.UUID, allowNull: true },
    room_id: { type: DataTypes.UUID, allowNull: true },
    occurrence_uuid: { type: DataTypes.STRING(120), allowNull: true },
    audience: { type: DataTypes.STRING(60), allowNull: true },
    // A SNAPSHOT: what this student confirmed for THIS attempt, frozen, so a later
    // checklist edit cannot rewrite what they agreed to.
    checklist_snapshot_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    selected_material_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    attempt_state: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'draft' },
    // 'expected' is the honest starting point: a session scheduled to record has not
    // yet produced anything playable.
    recording_state: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'expected' },
    is_final_take: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Join intent is NOT attendance and NOT a verified presentation. Three separate facts.
    join_intent_at: { type: DataTypes.DATE, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    ended_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'presentation_attempts',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['assignment_id', 'attempt_no'], name: 'presentation_attempts_unique_try' },
      { fields: ['booking_id'], name: 'presentation_attempts_booking' },
      { fields: ['occurrence_uuid'], name: 'presentation_attempts_occurrence' },
    ],
  },
);

export default PresentationAttempt;
