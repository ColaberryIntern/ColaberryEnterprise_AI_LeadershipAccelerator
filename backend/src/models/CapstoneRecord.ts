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

/**
 * Idempotent CREATE ... IF NOT EXISTS, safe on every boot, each statement
 * guarded so a partial failure logs and continues. This repo does not run a
 * global `sync()` at boot — an ungated one previously generated tens of
 * thousands of duplicate constraints and exhausted the database.
 */
export async function ensureCapstoneRecordSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS capstone_records (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       project_id UUID NOT NULL,
       enrollment_id UUID NOT NULL,
       slug VARCHAR(160) NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'draft',
       visibility VARCHAR(20) NOT NULL DEFAULT 'unlisted',
       content_json JSONB,
       version INTEGER NOT NULL DEFAULT 1,
       published_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // The slug IS the public URL, so a collision would hand two students the
    // same address. Unique at the database, not by convention.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_capstone_records_slug ON capstone_records (slug)`,
    // One record per project: two URLs telling different stories about one body
    // of work, with no way to know which was sent to whom, is the failure this
    // prevents.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_capstone_records_project ON capstone_records (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_capstone_records_enrollment ON capstone_records (enrollment_id)`,
    `CREATE TABLE IF NOT EXISTS capstone_record_versions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       record_id UUID NOT NULL,
       version INTEGER NOT NULL,
       content_json JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // Re-compiling an unchanged record must not append a duplicate version row.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_capstone_versions_record_version ON capstone_record_versions (record_id, version)`,
  ];
  for (const sql of statements) {
    try { await sequelize.query(sql); }
    catch (err: any) { console.warn('[DB] capstone_records schema statement failed:', err.message?.split('\n')[0]); }
  }
  console.log('[DB] capstone_records schema ensured');
}

export default CapstoneRecord;
