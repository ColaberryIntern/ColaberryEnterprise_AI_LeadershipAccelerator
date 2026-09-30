import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Group A — the administrative intake. Identity, contact, files, consent and
 * routing. One row per application.
 *
 * ── WHAT MUST NOT BE HERE ──────────────────────────────────────────────────
 *
 * No qualification questions. The contract's non-negotiable rule is "the
 * application form and the AI interview must not ask the same questions", and
 * the enforcement is structural: motivation, availability, commitment,
 * tool-readiness and behavioural answers have no column on this table, so a
 * well-meaning form addition has nowhere to write. Those live in
 * `internship_interview_responses`, keyed by question, written by whichever
 * channel got there first.
 *
 * No API key, password or token. There is no column for one.
 *
 * ── WHY THE TWO CONSENTS ARE SEPARATE ──────────────────────────────────────
 *
 * `permission_ai_interviewer` and `consent_recording` are distinct booleans
 * because they are distinct decisions. Agreeing to be interviewed by an AI is
 * not agreeing to be recorded, and collapsing them would mean a student who
 * accepted the first had the second taken from them silently. The call flow must
 * stop if recording consent is withheld or withdrawn, which is only possible if
 * the two are stored apart.
 */
export type WorkAuthCategory =
  | 'none' | 'cpt' | 'opt' | 'ead' | 'university_placement' | 'other' | 'unsure';

class InternshipAdministrativeIntake extends Model {
  declare id: string;
  declare application_id: string;
  declare legal_name: string | null;
  declare preferred_name: string | null;
  declare phone: string | null;
  declare time_zone: string | null;
  declare country: string | null;
  declare state_region: string | null;
  declare preferred_language: string | null;
  /** Points at an InternshipDocument row, never a filesystem path. */
  declare resume_document_id: string | null;
  declare linkedin_url: string | null;
  declare github_url: string | null;
  declare portfolio_url: string | null;
  declare work_auth_category: WorkAuthCategory | null;
  declare permission_to_call: boolean;
  declare permission_ai_interviewer: boolean;
  declare consent_recording: boolean;
  declare accommodation_request: string | null;
  declare preferred_interview_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InternshipAdministrativeIntake.init(
  {
    id:                        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    application_id:            { type: DataTypes.UUID, allowNull: false },
    legal_name:                { type: DataTypes.STRING(255), allowNull: true },
    preferred_name:            { type: DataTypes.STRING(255), allowNull: true },
    phone:                     { type: DataTypes.STRING(50), allowNull: true },
    time_zone:                 { type: DataTypes.STRING(64), allowNull: true },
    country:                   { type: DataTypes.STRING(80), allowNull: true },
    state_region:              { type: DataTypes.STRING(80), allowNull: true },
    preferred_language:        { type: DataTypes.STRING(40), allowNull: true },
    resume_document_id:        { type: DataTypes.UUID, allowNull: true },
    linkedin_url:              { type: DataTypes.TEXT, allowNull: true },
    github_url:                { type: DataTypes.TEXT, allowNull: true },
    portfolio_url:             { type: DataTypes.TEXT, allowNull: true },
    work_auth_category:        { type: DataTypes.STRING(40), allowNull: true },
    permission_to_call:        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    permission_ai_interviewer: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    consent_recording:         { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    accommodation_request:     { type: DataTypes.TEXT, allowNull: true },
    preferred_interview_at:    { type: DataTypes.DATE, allowNull: true },
    created_at:                { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:                { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_administrative_intakes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default InternshipAdministrativeIntake;
