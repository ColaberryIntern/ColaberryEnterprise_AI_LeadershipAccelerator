/**
 * CapstoneRecord — the stored, shareable snapshot of a student's whole cohort.
 *
 * ── WHY A SNAPSHOT AND NOT A LIVE JOIN ──────────────────────────────────────
 *
 * The record is compiled once and stored whole in `content_json`. A link a
 * student sent a hiring manager in October must render in March exactly as it
 * did when they sent it — not "whatever five tables happen to hold now". A
 * portfolio that silently changes under a URL already in someone's inbox is
 * worse than a slightly stale one.
 *
 * This is the shape Repo2Reputation (github.com/KesetebirhanDelele/portfolio)
 * arrived at independently for the same problem: `content_json` plus a versions
 * table. Copied rather than re-derived.
 *
 * ── STATUS AND VISIBILITY ARE SEPARATE AXES ─────────────────────────────────
 *
 * `status` is where the record is in its life (draft / published / archived).
 * `visibility` is who may read it. They are NOT the same question, and folding
 * them into one field is how "published" silently comes to mean "public".
 *
 * `unlisted` is the intended default and the important one: a student shares a
 * link with one hiring manager long before they want the page indexed.
 *
 * ── ONE RECORD PER PROJECT ──────────────────────────────────────────────────
 *
 * Enforced by a unique index, not by convention. A second record for the same
 * project would mean two URLs telling different stories about one body of work,
 * and no way to know which one was sent to whom.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CapstoneRecordStatus = 'draft' | 'published' | 'archived';
export type CapstoneRecordVisibility = 'private' | 'unlisted' | 'public';

export interface CapstoneRecordAttributes {
  id?: string;
  project_id: string;
  enrollment_id: string;
  /** URL segment. Stable once published — a shared link must not rot. */
  slug: string;
  status?: CapstoneRecordStatus;
  visibility?: CapstoneRecordVisibility;
  /** The compiled record. Rendered as-is; never re-derived at read time. */
  content_json?: unknown;
  /** Bumped on every stored compile, so versions can be ordered without a clock. */
  version?: number;
  published_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class CapstoneRecord extends Model<CapstoneRecordAttributes> implements CapstoneRecordAttributes {
  declare id: string;
  declare project_id: string;
  declare enrollment_id: string;
  declare slug: string;
  declare status: CapstoneRecordStatus;
  declare visibility: CapstoneRecordVisibility;
  declare content_json: unknown;
  declare version: number;
  declare published_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CapstoneRecord.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    slug: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    visibility: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unlisted' },
    content_json: { type: DataTypes.JSONB, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    published_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'capstone_records', timestamps: false },
);

/** One immutable copy per stored compile. Never updated, only inserted. */
export interface CapstoneRecordVersionAttributes {
  id?: string;
  record_id: string;
  version: number;
  content_json?: unknown;
  created_at?: Date;
}

export class CapstoneRecordVersion extends Model<CapstoneRecordVersionAttributes> {
  declare id: string;
  declare record_id: string;
  declare version: number;
  declare content_json: unknown;
  declare created_at: Date;
}

CapstoneRecordVersion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    record_id: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    content_json: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'capstone_record_versions', timestamps: false },
);

export default CapstoneRecord;
