import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import type { INTERNSHIP_OFFERING_STATUSES } from '../db/ensureInternshipSchema';

/**
 * AI Internship offering — one cohort/session of the internship product.
 * Schema and rationale: db/ensureInternshipSchema.ts. Plan §22.
 *
 * Only an offering in `open` status with an unexpired `application_deadline`
 * accepts applications; that rule lives in the service layer, not here, so the
 * model stays a contract rather than a policy.
 */

export type InternshipOfferingStatus = (typeof INTERNSHIP_OFFERING_STATUSES)[number];

export interface InternshipOfferingAttributes {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  track: string;
  status: InternshipOfferingStatus;
  starts_on: string | null;
  ends_on: string | null;
  application_opens_on: string | null;
  application_deadline: string | null;
  capacity: number | null;
  is_paid: boolean;
  stipend_cents: number | null;
  commitment_hours_per_week: number | null;
  is_remote: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

type CreationAttrs = Optional<
  InternshipOfferingAttributes,
  | 'id'
  | 'summary'
  | 'track'
  | 'status'
  | 'starts_on'
  | 'ends_on'
  | 'application_opens_on'
  | 'application_deadline'
  | 'capacity'
  | 'is_paid'
  | 'stipend_cents'
  | 'commitment_hours_per_week'
  | 'is_remote'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
>;

export class InternshipOffering
  extends Model<InternshipOfferingAttributes, CreationAttrs>
  implements InternshipOfferingAttributes
{
  public id!: string;
  public slug!: string;
  public title!: string;
  public summary!: string | null;
  public track!: string;
  public status!: InternshipOfferingStatus;
  public starts_on!: string | null;
  public ends_on!: string | null;
  public application_opens_on!: string | null;
  public application_deadline!: string | null;
  public capacity!: number | null;
  public is_paid!: boolean;
  public stipend_cents!: number | null;
  public commitment_hours_per_week!: number | null;
  public is_remote!: boolean;
  public metadata!: Record<string, unknown>;
  public created_at!: Date;
  public updated_at!: Date;
}

InternshipOffering.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    slug: { type: DataTypes.STRING(120), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: true },
    track: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'ai' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'draft' },
    starts_on: { type: DataTypes.DATEONLY, allowNull: true },
    ends_on: { type: DataTypes.DATEONLY, allowNull: true },
    application_opens_on: { type: DataTypes.DATEONLY, allowNull: true },
    application_deadline: { type: DataTypes.DATEONLY, allowNull: true },
    capacity: { type: DataTypes.INTEGER, allowNull: true },
    is_paid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    stipend_cents: { type: DataTypes.INTEGER, allowNull: true },
    commitment_hours_per_week: { type: DataTypes.INTEGER, allowNull: true },
    is_remote: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_offerings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default InternshipOffering;
