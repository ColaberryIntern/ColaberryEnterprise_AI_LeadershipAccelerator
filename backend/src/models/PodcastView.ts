import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * PodcastView — per-student "listened" ledger for personalized podcast picks.
 * Exact sibling of `network_video_views` (Testimonials): one row per
 * (enrollment, episode), UPSERTed at feed-compose time by podcastMediaService.
 * Doubles as the "never the same episode twice" engine (unseen-pool sub-query)
 * and the stable per-card assignment (last_timeline_card_id).
 */
export interface PodcastViewAttributes {
  id?: string;
  enrollment_id: string;
  podcast_id: string;
  category?: string | null;
  first_seen_at?: Date;
  last_seen_at?: Date;
  seen_count?: number;
  last_timeline_card_id?: string | null;
  context?: any;
}

class PodcastView extends Model<PodcastViewAttributes> implements PodcastViewAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare podcast_id: string;
  declare category: string | null;
  declare first_seen_at: Date;
  declare last_seen_at: Date;
  declare seen_count: number;
  declare last_timeline_card_id: string | null;
  declare context: any;
}

PodcastView.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    podcast_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'podcasts', key: 'id' } },
    category: { type: DataTypes.STRING(80), allowNull: true },
    first_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    seen_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    last_timeline_card_id: { type: DataTypes.UUID, allowNull: true },
    context: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'podcast_views',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['enrollment_id', 'podcast_id'], name: 'idx_podcast_views_enrollment_podcast_unique' },
      { fields: ['enrollment_id'], name: 'idx_podcast_views_enrollment' },
      { fields: ['last_timeline_card_id'], name: 'idx_podcast_views_card' },
    ],
  }
);

export default PodcastView;
