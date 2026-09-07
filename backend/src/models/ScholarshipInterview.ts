import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One scholarship interview: a person's own account of what they want to build,
 * captured so a HUMAN can read it.
 *
 * It is not an application and not a decision. See
 * `db/ensureScholarshipInterviewSchema.ts` for why this record carries no score,
 * no rank and no eligibility field, and why it holds no financial, hardship,
 * immigration or health data.
 */
export type ScholarshipInterviewStatus = 'in_progress' | 'complete' | 'abandoned';

export const SCHOLARSHIP_INTERVIEW_STATUSES: readonly ScholarshipInterviewStatus[] = [
  'in_progress',
  'complete',
  'abandoned',
];

export interface ScholarshipInterviewAttributes {
  id?: string;
  /** The canonical lead this conversation belongs to. */
  lead_id: number;
  /**
   * The `raw_payload_id` the ingest endpoint handed the browser. It is the
   * idempotency key: a reload or a double submit continues this interview rather
   * than opening a second one for the same person.
   */
  raw_payload_id?: string | null;
  status?: ScholarshipInterviewStatus;
  /** The conversation as it was said, in their words. Never edited by us. */
  transcript?: string;
  /**
   * A short written brief for the reviewer, produced only when the interview
   * completes. Deliberately prose rather than fields: a reviewer reading six
   * sentences forms a picture, and a reviewer reading six scored attributes
   * starts ranking people against criteria nobody has agreed yet.
   */
  summary?: string | null;
  exchanges?: number;
  completed_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class ScholarshipInterview
  extends Model<ScholarshipInterviewAttributes>
  implements ScholarshipInterviewAttributes
{
  declare id: string;
  declare lead_id: number;
  declare raw_payload_id: string | null;
  declare status: ScholarshipInterviewStatus;
  declare transcript: string;
  declare summary: string | null;
  declare exchanges: number;
  declare completed_at: Date | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

ScholarshipInterview.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    raw_payload_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'in_progress',
      validate: { isIn: [SCHOLARSHIP_INTERVIEW_STATUSES as unknown as string[]] },
    },
    transcript: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    exchanges: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'ScholarshipInterview',
    tableName: 'scholarship_interviews',
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default ScholarshipInterview;
