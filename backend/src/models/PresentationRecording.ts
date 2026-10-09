import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One PART of an attempt's recording.
 *
 * ONE ATTEMPT CAN HAVE MANY PARTS. Zoom splits a recording when a host stops and
 * restarts, so "does a recording exist for this attempt?" is the exact check that
 * permanently hides the second half of a session — the booking ingestion path has
 * that bug today (`sessionRecordingService.ts:428-435`). A row here is a part, and
 * the unique key is the part's own identity, so a duplicate delivery is a conflict
 * and a late delivery is just another part.
 *
 * The dedupe key `(occurrence_uuid, provider_file_id)` is backed by a REAL UNIQUE
 * INDEX. The existing pipeline dedupes by reading `metadata @> {zoom_uuid}` and then
 * inserting, which is a read-then-write race: a webhook and the 30-minute cron sweep
 * both see "absent" and both ingest. A constraint cannot race.
 *
 * `ingest_status` is not a success flag. A webhook receipt proves an event arrived,
 * never that a playable file exists.
 */
export type PresentationIngestStatus =
  | 'expected' | 'processing' | 'ready' | 'missing' | 'failed' | 'review' | 'superseded';
export type PresentationIngestProvenance =
  | 'webhook' | 'cron_sweep' | 'manual_upload' | 'staff_rematch';

export interface PresentationRecordingAttributes {
  id?: string;
  attempt_id: string;
  resource_id?: string | null;
  occurrence_uuid: string;
  provider_file_id: string;
  part_no?: number;
  parts_total?: number | null;
  recording_type?: string | null;
  starts_at?: Date | null;
  ends_at?: Date | null;
  duration_seconds?: number | null;
  ingest_status?: PresentationIngestStatus;
  ingest_provenance?: PresentationIngestProvenance | null;
  has_audio?: boolean | null;
  has_shared_screen?: boolean | null;
  review_reason?: string | null;
  recovery_url?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class PresentationRecording
  extends Model<PresentationRecordingAttributes>
  implements PresentationRecordingAttributes {
  declare id: string;
  declare attempt_id: string;
  declare resource_id: string | null;
  declare occurrence_uuid: string;
  declare provider_file_id: string;
  declare part_no: number;
  declare parts_total: number | null;
  declare recording_type: string | null;
  declare starts_at: Date | null;
  declare ends_at: Date | null;
  declare duration_seconds: number | null;
  declare ingest_status: PresentationIngestStatus;
  declare ingest_provenance: PresentationIngestProvenance | null;
  declare has_audio: boolean | null;
  declare has_shared_screen: boolean | null;
  declare review_reason: string | null;
  declare recovery_url: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

PresentationRecording.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    attempt_id: { type: DataTypes.UUID, allowNull: false },
    resource_id: { type: DataTypes.UUID, allowNull: true },
    occurrence_uuid: { type: DataTypes.STRING(120), allowNull: false },
    provider_file_id: { type: DataTypes.STRING(160), allowNull: false },
    part_no: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    parts_total: { type: DataTypes.INTEGER, allowNull: true },
    recording_type: { type: DataTypes.STRING(60), allowNull: true },
    starts_at: { type: DataTypes.DATE, allowNull: true },
    ends_at: { type: DataTypes.DATE, allowNull: true },
    duration_seconds: { type: DataTypes.INTEGER, allowNull: true },
    ingest_status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'expected' },
    ingest_provenance: { type: DataTypes.STRING(30), allowNull: true },
    // NULL means "not determined", which is different from false. A transcript-only
    // analysis must not be able to claim the screen was not shared.
    has_audio: { type: DataTypes.BOOLEAN, allowNull: true },
    has_shared_screen: { type: DataTypes.BOOLEAN, allowNull: true },
    review_reason: { type: DataTypes.TEXT, allowNull: true },
    // Set ONLY on a student recovery row. A recording we actually ingested has
    // no URL here, so a non-null value is itself the marker that nobody verified
    // what is on the other end of it.
    recovery_url: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'presentation_recordings',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['occurrence_uuid', 'provider_file_id'],
        name: 'presentation_recordings_unique_part',
      },
      { fields: ['attempt_id', 'part_no'], name: 'presentation_recordings_attempt' },
    ],
  },
);

export default PresentationRecording;
