import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Podcast — the student-facing catalog of Colaberry AI Podcast episodes, scraped
 * weekly from the curated training-site index and enriched with real per-episode
 * thumbnails/audio from the Buzzsprout feed. Consumed by the admin console and the
 * portal (Experience Studio) to show episodes to students.
 *
 * Dedup/idempotency key: `website_url` (unique). The `sequelize.sync({ alter: true })`
 * on boot creates/updates the `podcasts` table from this definition — no migration file.
 */
export interface PodcastAttributes {
  id?: string;
  title: string;
  slug?: string | null;
  website_url: string;
  audio_url?: string | null;
  thumbnail_url?: string | null;
  description?: string | null;
  duration_seconds?: number | null;
  duration_label?: string | null;
  published_at?: Date | null;
  buzzsprout_guid?: string | null;
  featured?: boolean;
  is_active?: boolean;
  source?: string;
  category?: string | null;
  tags?: string[];
  raw_meta_json?: any;
  last_seen_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class Podcast extends Model<PodcastAttributes> implements PodcastAttributes {
  declare id: string;
  declare title: string;
  declare slug: string | null;
  declare website_url: string;
  declare audio_url: string | null;
  declare thumbnail_url: string | null;
  declare description: string | null;
  declare duration_seconds: number | null;
  declare duration_label: string | null;
  declare published_at: Date | null;
  declare buzzsprout_guid: string | null;
  declare featured: boolean;
  declare is_active: boolean;
  declare source: string;
  declare category: string | null;
  declare tags: string[];
  declare raw_meta_json: any;
  declare last_seen_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Podcast.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING(500), allowNull: false },
    slug: { type: DataTypes.STRING(300), allowNull: true },
    website_url: { type: DataTypes.STRING(1000), allowNull: false, unique: true },
    audio_url: { type: DataTypes.STRING(1000), allowNull: true },
    thumbnail_url: { type: DataTypes.STRING(1000), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    duration_seconds: { type: DataTypes.INTEGER, allowNull: true },
    duration_label: { type: DataTypes.STRING(20), allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    buzzsprout_guid: { type: DataTypes.STRING(120), allowNull: true },
    featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    source: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'training.colaberry.com' },
    category: { type: DataTypes.STRING(80), allowNull: true },
    tags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    raw_meta_json: { type: DataTypes.JSONB, allowNull: true },
    last_seen_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'podcasts',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['website_url'], name: 'idx_podcasts_website_url_unique' },
      { fields: ['published_at'], name: 'idx_podcasts_published_at' },
      { fields: ['featured'], name: 'idx_podcasts_featured' },
      { fields: ['is_active'], name: 'idx_podcasts_is_active' },
    ],
  }
);

export default Podcast;
