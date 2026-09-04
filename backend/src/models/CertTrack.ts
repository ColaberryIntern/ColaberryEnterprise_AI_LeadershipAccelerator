import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CertTrack — a versioned certification definition (e.g. Claude Certified
 * Architect, Foundations). One row per (track_id, version); exactly one row per
 * track may carry is_current.
 *
 * Every exam fact here is NULLABLE on purpose. Anthropic's official CCAR-F exam
 * guide sits behind the Partner Academy login and has not been read; what we
 * currently believe about item counts, duration and the passing score comes from
 * third-party community guides. `blueprint_source` records that honestly and
 * defaults to 'unverified'. Readiness presentation must degrade when a fact is
 * absent rather than substitute a plausible number — do not add defaults here.
 *
 * `availability_start_week` is the server-side source of truth for the Week 7
 * fence and is read by certAvailabilityService. It is deliberately data, not a
 * constant, so the program can move the fence without a deploy.
 *
 * Columns must match backend/src/db/ensureCertPrepSchema.ts EXACTLY.
 */

export type BlueprintSource = 'official' | 'community' | 'unverified';

export interface CertTrackAttributes {
  id?: string;
  track_id: string;
  version?: number;
  display_name: string;
  issuer: string;
  blueprint_version: string;
  blueprint_source?: BlueprintSource;
  source_url?: string | null;
  source_note?: string | null;
  exam_item_count?: number | null;
  exam_duration_minutes?: number | null;
  scaled_score_min?: number | null;
  scaled_score_max?: number | null;
  passing_scaled_score?: number | null;
  availability_start_week?: number;
  readiness_policy_version?: string;
  effective_from?: Date | null;
  effective_to?: Date | null;
  is_current?: boolean;
  is_active?: boolean;
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class CertTrack extends Model<CertTrackAttributes> implements CertTrackAttributes {
  declare id: string;
  declare track_id: string;
  declare version: number;
  declare display_name: string;
  declare issuer: string;
  declare blueprint_version: string;
  declare blueprint_source: BlueprintSource;
  declare source_url: string | null;
  declare source_note: string | null;
  declare exam_item_count: number | null;
  declare exam_duration_minutes: number | null;
  declare scaled_score_min: number | null;
  declare scaled_score_max: number | null;
  declare passing_scaled_score: number | null;
  declare availability_start_week: number;
  declare readiness_policy_version: string;
  declare effective_from: Date | null;
  declare effective_to: Date | null;
  declare is_current: boolean;
  declare is_active: boolean;
  declare created_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CertTrack.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    track_id: { type: DataTypes.STRING(40), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    display_name: { type: DataTypes.STRING(150), allowNull: false },
    issuer: { type: DataTypes.STRING(100), allowNull: false },
    blueprint_version: { type: DataTypes.STRING(40), allowNull: false },
    blueprint_source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unverified' },
    source_url: { type: DataTypes.TEXT, allowNull: true },
    source_note: { type: DataTypes.TEXT, allowNull: true },
    // Unverified exam facts — nullable, never defaulted. See the header.
    exam_item_count: { type: DataTypes.INTEGER, allowNull: true },
    exam_duration_minutes: { type: DataTypes.INTEGER, allowNull: true },
    scaled_score_min: { type: DataTypes.INTEGER, allowNull: true },
    scaled_score_max: { type: DataTypes.INTEGER, allowNull: true },
    passing_scaled_score: { type: DataTypes.INTEGER, allowNull: true },
    availability_start_week: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
    readiness_policy_version: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'v1' },
    effective_from: { type: DataTypes.DATE, allowNull: true },
    effective_to: { type: DataTypes.DATE, allowNull: true },
    is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    sequelize,
    tableName: 'cert_tracks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default CertTrack;
