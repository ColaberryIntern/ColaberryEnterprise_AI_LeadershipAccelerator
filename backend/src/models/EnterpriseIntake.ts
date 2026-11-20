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
  | 'interviewed';

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
  /** Phase 3: the follow-up email with their options. Drafted by AI, sent only on Ali's approval. */
  options_email_subject?: string | null;
  options_email_body?: string | null;
  options_email_sent_at?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
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
  declare options_email_subject: string | null;
  declare options_email_body: string | null;
  declare options_email_sent_at: Date | null;
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
    options_email_subject: { type: DataTypes.STRING(255), allowNull: true },
    options_email_body: { type: DataTypes.TEXT, allowNull: true },
    options_email_sent_at: { type: DataTypes.DATE, allowNull: true },
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
