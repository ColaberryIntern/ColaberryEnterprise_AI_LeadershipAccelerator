import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyEnrollment — a subject's governed participation in one program
 * (§6.1, T205).
 *
 * ─── `subject_ref` IS THE PRICE OF AD-2 ─────────────────────────────────────
 *
 * There is no `subjects` table: AD-2 settled that a fifth identity beside
 * `leads`, `enrollments`, `visitors` and `org_members` would have to be kept in
 * sync with all four, and the drift would be invisible. So a participation row
 * cannot point at a subject id, because none exists.
 *
 * It carries a DERIVED key instead — `enrollment:<uuid>` or `lead:<id>`, built
 * from the strongest anchor available — with the raw anchors stored beside it.
 * `subjectRef()` below is the single place that key is built, so the backfill
 * and any future writer cannot disagree about what identifies a subject. Two
 * spellings of the same person would each get their own participation row, and
 * the unique index would be satisfied by both.
 *
 * ─── WHY THE IDEMPOTENCY KEY IS A DATABASE INDEX ────────────────────────────
 *
 * `(program_id, subject_ref)` is unique in the DDL. A backfill over 217 rows
 * that checked "have we done this already?" in application code would lose to a
 * concurrent run — two boots, or a boot and a manual invocation — and produce
 * duplicate participations that every subsequent count would report as real.
 * The index cannot lose that race.
 */

export type GrowthJourneyEnrollmentStatus = 'active' | 'paused' | 'completed' | 'withdrawn';

/**
 * Build the derived subject key.
 *
 * ENROLLMENT WINS OVER LEAD when both are present, and that ordering is
 * load-bearing rather than arbitrary: a learner's enrollment id is stable for
 * the life of the enrollment, whereas the lead a profile resolves to can change
 * as identities merge. Keying on the less stable anchor would let the same
 * person acquire a second participation row after a merge.
 */
export function subjectRef(anchor: {
  enrollmentId?: string | null;
  leadId?: number | null;
}): string | null {
  if (anchor.enrollmentId) return `enrollment:${anchor.enrollmentId}`;
  if (anchor.leadId !== null && anchor.leadId !== undefined) return `lead:${anchor.leadId}`;
  // §6.2 requires at least one anchor. Returning null rather than a placeholder
  // means a caller cannot accidentally write a row keyed on nothing — which
  // would collide with every other anchorless row under the unique index.
  return null;
}

export interface GrowthJourneyEnrollmentAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  program_id: string;
  path_id?: string | null;
  subject_ref: string;
  lead_id?: number | null;
  enrollment_id?: string | null;
  status?: GrowthJourneyEnrollmentStatus;
  /** Which process created this row, e.g. `explorer_backfill`. */
  source: string;
  enrolled_at?: Date;
  metadata?: Record<string, unknown> | null;
  created_at?: Date;
  updated_at?: Date;
}

export class GrowthJourneyEnrollment
  extends Model<GrowthJourneyEnrollmentAttributes>
  implements GrowthJourneyEnrollmentAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare program_id: string;
  declare path_id: string | null;
  declare subject_ref: string;
  declare lead_id: number | null;
  declare enrollment_id: string | null;
  declare status: GrowthJourneyEnrollmentStatus;
  declare source: string;
  declare enrolled_at: Date;
  declare metadata: Record<string, unknown> | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

GrowthJourneyEnrollment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    brand_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'brands', key: 'id' },
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'journey_programs', key: 'id' },
    },
    path_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'journey_paths', key: 'id' },
    },
    subject_ref: { type: DataTypes.STRING(128), allowNull: false },
    // NOT foreign keys, deliberately. Explorer profiles are keyed on the
    // enrollment id and this table must not make its integrity depend on a row
    // another system may archive — and under AD-2 no single identity table is
    // privileged, so a hard FK to either would let an archive in `enrollments`
    // cascade into, or block, a participation record. The DDL comment in
    // `ensureGrowthJourneySchema.ts` says the same; a test asserts the absence.
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    source: { type: DataTypes.STRING(64), allowNull: false },
    enrolled_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'growth_journey_enrollments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        name: 'growth_journey_enrollments_program_subject_unique',
        fields: ['program_id', 'subject_ref'],
      },
    ],
  },
);

export default GrowthJourneyEnrollment;
