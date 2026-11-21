import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * EnterpriseIntake - one prospect's intake, from "Book a demo pilot" to signed (W28).
 *
 * Ali, 2026-11-20: an intake process "that starts from the moment they decide to fill out
 * the form", with an AI interview right after it, and every client tracked in Basecamp
 * until they become a customer.
 *
 * This row is what ties the pieces together: the lead the form created, the answers in a
 * structured form (the lead row only has a free-text message), the interview's write-up,
 * the call, and later the client's Basecamp list. The `id` is a random UUID and doubles as
 * the visitor's token for the interview, so a lead's numeric id is never exposed and a
 * token cannot be guessed from another one.
 *
 * Status ladder (Phase 1 writes the first three):
 *   form -> call_requested -> interviewed -> (Phase 2+) researched, proposal, signed, lost
 */
export type EnterpriseIntakeStatus =
  | 'form'
  | 'call_requested'
  | 'interviewed'
  | 'signed'
  | 'lost';

export interface EnterpriseIntakeAttributes {
  id?: string;
  lead_id: number | null;
  status: EnterpriseIntakeStatus;
  full_name: string;
  email: string;
  company: string;
  role: string;
  phone: string;
  /** The explicit "the AI may call me" tick. A number without it is never dialled. */
  call_consent: boolean;
  website: string;
  service: string;
  department: string;
  process: string;
  people_count: number | null;
  hours_per_week: number | null;
  required_return: string;
  start_timing: string;
  other_deciders: string;
  call_id: string | null;
  call_requested_at: Date | null;
  understanding_id: string | null;
  interviewed_via: 'chat' | 'call' | null;
  interviewed_at: Date | null;
  /** Phase 2: the client's to-do list in the Basecamp "Colaberry Enterprise Intake" project. */
  bc_todolist_id: string | null;
  /** Phase 2: the interview as text (typed turns, or the call transcript), for the client's list. */
  transcript: string | null;
  /** Phase 2: when the write-up and transcript were posted on the list. Null = still to post. */
  bc_writeup_posted_at: Date | null;
  /** Phase 2: the whole checklist is on the list. Null = still to build or repair. */
  bc_checklist_ready_at?: Date | null;
  /** Phase 2: the interview to-do is ticked. */
  bc_interview_ticked_at?: Date | null;
  /** Phase 3: the company research brief and the draft pilot options (JSON). */
  research?: unknown | null;
  pilot_options?: unknown | null;
  researched_at?: Date | null;
  research_attempts?: number;
  /** Phase 3: once the research and options are posted on the client's list. */
  bc_research_posted_at?: Date | null;
  bc_research_ticked_at?: Date | null;
  /** Phase 3: the follow-up email with their options. Drafted by AI, sent only on Ali's approval. */
  options_email_subject?: string | null;
  options_email_body?: string | null;
  options_email_sent_at?: Date | null;
  /** Phase 4: how far the client's emails and calls have been copied onto their list. */
  comms_email_synced_through?: Date | null;
  comms_calls_synced_through?: Date | null;
  /** Phase 4: call ids already posted, and when this client was last checked (fair rotation). */
  comms_calls_posted?: string[] | null;
  comms_checked_at?: Date | null;
  /** Phase 4: the stage shown in the list's name, so it is renamed only when it changes. */
  bc_list_stage?: string | null;
  /** Phase 4: the proposal. Drafted by AI from everything on the list, sent only by Ali. */
  proposal_subject?: string | null;
  proposal_body?: string | null;
  proposal_drafted_at?: Date | null;
  proposal_sent_at?: Date | null;
  /** Phase 5: the end of the intake. Signed opens the client's own Basecamp project. */
  signed_at?: Date | null;
  lost_at?: Date | null;
  lost_reason?: string | null;
  bc_project_id?: string | null;
  /**
   * v2 (2026-11-21): the client plans the rest in the same visit. The AI interview now or
   * later, the human meeting on Ali's calendar (at least 1 business day after the interview),
   * their own research files, and Ali's brief once the homework is done.
   */
  interview_mode?: 'now' | 'later' | null;
  interview_via_pref?: 'chat' | 'call' | null;
  interview_scheduled_for?: Date | null;
  interview_reminder_sent_at?: Date | null;
  interview_reminder_attempts?: number;
  meeting_start?: Date | null;
  meeting_end?: Date | null;
  meeting_event_id?: string | null;
  meeting_link?: string | null;
  /** Claim held while a booking is in flight, so a double click books once. */
  meeting_booking_at?: Date | null;
  bc_meeting_posted_at?: Date | null;
  bc_meeting_attempts?: number;
  /** [{id,name,size,mime,ext,chars,uploaded_at,bc_posted,bc_attempts}] */
  client_files?: ClientFile[] | null;
  /** Text extracted from their files, capped, for the interview and the research. */
  client_research?: string | null;
  ali_brief_claimed_at?: Date | null;
  ali_brief_sent_at?: Date | null;
  ali_brief_attempts?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ClientFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  ext: string;
  chars: number;
  uploaded_at: string;
  bc_posted: boolean;
  bc_attempts: number;
}

class EnterpriseIntake extends Model<EnterpriseIntakeAttributes> implements EnterpriseIntakeAttributes {
  declare id: string;
  declare lead_id: number | null;
  declare status: EnterpriseIntakeStatus;
  declare full_name: string;
  declare email: string;
  declare company: string;
  declare role: string;
  declare phone: string;
  declare call_consent: boolean;
  declare website: string;
  declare service: string;
  declare department: string;
  declare process: string;
  declare people_count: number | null;
  declare hours_per_week: number | null;
  declare required_return: string;
  declare start_timing: string;
  declare other_deciders: string;
  declare call_id: string | null;
  declare call_requested_at: Date | null;
  declare understanding_id: string | null;
  declare interviewed_via: 'chat' | 'call' | null;
  declare interviewed_at: Date | null;
  declare bc_todolist_id: string | null;
  declare transcript: string | null;
  declare bc_writeup_posted_at: Date | null;
  declare bc_checklist_ready_at: Date | null;
  declare bc_interview_ticked_at: Date | null;
  declare research: unknown | null;
  declare pilot_options: unknown | null;
  declare researched_at: Date | null;
  declare research_attempts: number;
  declare bc_research_posted_at: Date | null;
  declare bc_research_ticked_at: Date | null;
  declare options_email_subject: string | null;
  declare options_email_body: string | null;
  declare options_email_sent_at: Date | null;
  declare comms_email_synced_through: Date | null;
  declare comms_calls_synced_through: Date | null;
  declare comms_calls_posted: string[] | null;
  declare comms_checked_at: Date | null;
  declare bc_list_stage: string | null;
  declare proposal_subject: string | null;
  declare proposal_body: string | null;
  declare proposal_drafted_at: Date | null;
  declare proposal_sent_at: Date | null;
  declare signed_at: Date | null;
  declare lost_at: Date | null;
  declare lost_reason: string | null;
  declare bc_project_id: string | null;
  declare interview_mode: 'now' | 'later' | null;
  declare interview_via_pref: 'chat' | 'call' | null;
  declare interview_scheduled_for: Date | null;
  declare interview_reminder_sent_at: Date | null;
  declare interview_reminder_attempts: number;
  declare meeting_start: Date | null;
  declare meeting_end: Date | null;
  declare meeting_event_id: string | null;
  declare meeting_link: string | null;
  declare meeting_booking_at: Date | null;
  declare bc_meeting_posted_at: Date | null;
  declare bc_meeting_attempts: number;
  declare client_files: ClientFile[] | null;
  declare client_research: string | null;
  declare ali_brief_claimed_at: Date | null;
  declare ali_brief_sent_at: Date | null;
  declare ali_brief_attempts: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

EnterpriseIntake.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'form' },
    full_name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false },
    company: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
    role: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    phone: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '' },
    call_consent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    website: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
    service: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '' },
    department: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    process: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    people_count: { type: DataTypes.INTEGER, allowNull: true },
    hours_per_week: { type: DataTypes.DECIMAL(8, 1), allowNull: true },
    required_return: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    start_timing: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '' },
    other_deciders: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    call_id: { type: DataTypes.STRING(128), allowNull: true },
    call_requested_at: { type: DataTypes.DATE, allowNull: true },
    understanding_id: { type: DataTypes.UUID, allowNull: true },
    interviewed_via: { type: DataTypes.STRING(10), allowNull: true },
    interviewed_at: { type: DataTypes.DATE, allowNull: true },
    bc_todolist_id: { type: DataTypes.STRING(32), allowNull: true },
    transcript: { type: DataTypes.TEXT, allowNull: true },
    bc_writeup_posted_at: { type: DataTypes.DATE, allowNull: true },
    bc_checklist_ready_at: { type: DataTypes.DATE, allowNull: true },
    bc_interview_ticked_at: { type: DataTypes.DATE, allowNull: true },
    research: { type: DataTypes.JSONB, allowNull: true },
    pilot_options: { type: DataTypes.JSONB, allowNull: true },
    researched_at: { type: DataTypes.DATE, allowNull: true },
    research_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bc_research_posted_at: { type: DataTypes.DATE, allowNull: true },
    bc_research_ticked_at: { type: DataTypes.DATE, allowNull: true },
    options_email_subject: { type: DataTypes.STRING(255), allowNull: true },
    options_email_body: { type: DataTypes.TEXT, allowNull: true },
    options_email_sent_at: { type: DataTypes.DATE, allowNull: true },
    comms_email_synced_through: { type: DataTypes.DATE, allowNull: true },
    comms_calls_synced_through: { type: DataTypes.DATE, allowNull: true },
    comms_calls_posted: { type: DataTypes.JSONB, allowNull: true },
    comms_checked_at: { type: DataTypes.DATE, allowNull: true },
    bc_list_stage: { type: DataTypes.STRING(30), allowNull: true },
    proposal_subject: { type: DataTypes.STRING(255), allowNull: true },
    proposal_body: { type: DataTypes.TEXT, allowNull: true },
    proposal_drafted_at: { type: DataTypes.DATE, allowNull: true },
    proposal_sent_at: { type: DataTypes.DATE, allowNull: true },
    signed_at: { type: DataTypes.DATE, allowNull: true },
    lost_at: { type: DataTypes.DATE, allowNull: true },
    lost_reason: { type: DataTypes.STRING(500), allowNull: true },
    bc_project_id: { type: DataTypes.STRING(32), allowNull: true },
    interview_mode: { type: DataTypes.STRING(10), allowNull: true },
    interview_via_pref: { type: DataTypes.STRING(10), allowNull: true },
    interview_scheduled_for: { type: DataTypes.DATE, allowNull: true },
    interview_reminder_sent_at: { type: DataTypes.DATE, allowNull: true },
    interview_reminder_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    meeting_start: { type: DataTypes.DATE, allowNull: true },
    meeting_end: { type: DataTypes.DATE, allowNull: true },
    meeting_event_id: { type: DataTypes.STRING(255), allowNull: true },
    meeting_link: { type: DataTypes.STRING(500), allowNull: true },
    meeting_booking_at: { type: DataTypes.DATE, allowNull: true },
    bc_meeting_posted_at: { type: DataTypes.DATE, allowNull: true },
    bc_meeting_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    client_files: { type: DataTypes.JSONB, allowNull: true },
    client_research: { type: DataTypes.TEXT, allowNull: true },
    ali_brief_claimed_at: { type: DataTypes.DATE, allowNull: true },
    ali_brief_sent_at: { type: DataTypes.DATE, allowNull: true },
    ali_brief_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    tableName: 'enterprise_intakes',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['lead_id'] }, { fields: ['call_id'] }, { fields: ['email'] }],
  },
);

export default EnterpriseIntake;
