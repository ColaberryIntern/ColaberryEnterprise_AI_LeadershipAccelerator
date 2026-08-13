import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import type { INTERNSHIP_APPLICATION_STATUSES } from '../db/ensureInternshipSchema';

/**
 * AI Internship application. Schema and rationale: db/ensureInternshipSchema.ts.
 *
 * `status === 'accepted'` is one of the three disjuncts that make a learner
 * CONVERTED in the Explorer journey state machine (plan §8.1 line 763) — which
 * is why this table had to exist before that rule could be computed at all.
 *
 * IDENTITY: `email_normalized` is NOT NULL and is the only identity guaranteed
 * present. `enrollment_id` and `lead_id` are both nullable and unconstrained by
 * design — an applicant may be neither an enrolled learner nor a captured lead,
 * which is precisely who a never-before-marketed product attracts first.
 * Always write email_normalized lowercased and trimmed; the UNIQUE index on
 * (offering_id, email_normalized) is the duplicate-application guarantee and a
 * mixed-case write would silently defeat it.
 */

export type InternshipApplicationStatus = (typeof INTERNSHIP_APPLICATION_STATUSES)[number];

export interface InternshipApplicationAttributes {
  id: string;
  offering_id: string;
  enrollment_id: string | null;
  lead_id: number | null;
  email_normalized: string;
  full_name: string | null;
  status: InternshipApplicationStatus;
  source: string | null;
  motivation: string | null;
  portfolio_url: string | null;
  resume_text: string | null;
  submitted_at: Date | null;
  decided_at: Date | null;
  decision_note: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

type CreationAttrs = Optional<
  InternshipApplicationAttributes,
  | 'id'
  | 'enrollment_id'
  | 'lead_id'
  | 'full_name'
  | 'status'
  | 'source'
  | 'motivation'
  | 'portfolio_url'
  | 'resume_text'
  | 'submitted_at'
  | 'decided_at'
  | 'decision_note'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
>;

export class InternshipApplication
  extends Model<InternshipApplicationAttributes, CreationAttrs>
  implements InternshipApplicationAttributes
{
  public id!: string;
  public offering_id!: string;
  public enrollment_id!: string | null;
  public lead_id!: number | null;
  public email_normalized!: string;
  public full_name!: string | null;
  public status!: InternshipApplicationStatus;
  public source!: string | null;
  public motivation!: string | null;
  public portfolio_url!: string | null;
  public resume_text!: string | null;
  public submitted_at!: Date | null;
  public decided_at!: Date | null;
  public decision_note!: string | null;
  public metadata!: Record<string, unknown>;
  public created_at!: Date;
  public updated_at!: Date;
}

InternshipApplication.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    offering_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    email_normalized: { type: DataTypes.STRING(320), allowNull: false },
    full_name: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'started' },
    source: { type: DataTypes.STRING(60), allowNull: true },
    motivation: { type: DataTypes.TEXT, allowNull: true },
    portfolio_url: { type: DataTypes.STRING(500), allowNull: true },
    resume_text: { type: DataTypes.TEXT, allowNull: true },
    submitted_at: { type: DataTypes.DATE, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    decision_note: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
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
