import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AiNewsItem — the library table behind the AI News Flash intelligence pipeline.
 *
 * A weekly cron (schedulerService 'AiNewsRefresh') fetches a set of free AI-lab
 * RSS feeds and upserts each item here, deduped by `guid`. Materialization is a
 * separate, idempotent step: for each item without `summary_json`, the pipeline
 * runs the `ai_news_flash` generation prompt (via the instrumented OpenAI path),
 * stores the generated executive card content on `summary_json`, then creates ONE
 * standalone published `timeline_cards` row and records its id on `card_id`.
 *
 * This is the ingestion HALF of the blog/podcast precedent (library table +
 * *_views), specialized to a one-card-per-item news feed with LLM summarization.
 * Schema is created explicitly at boot by ensureAiNewsSchema() (no global sync).
 */
export interface AiNewsItemAttributes {
  id?: string;
  guid: string;            // stable dedup key: `${source}:${sha1(link|title)}`
  source: string;          // e.g. 'Anthropic', 'OpenAI', 'Hugging Face'
  title: string;
  url?: string | null;
  excerpt?: string | null;
  published_at?: Date | null;
  importance?: number;     // 0-100 deterministic rank (source + recency + signals)
  summary_json?: any;      // the generated 9-key card content (null until materialized)
  card_id?: string | null; // the materialized timeline_cards.id (null until carded)
  first_seen_at?: Date;
  last_seen_at?: Date;
}

class AiNewsItem extends Model<AiNewsItemAttributes> implements AiNewsItemAttributes {
  declare id: string;
  declare guid: string;
  declare source: string;
  declare title: string;
  declare url: string | null;
  declare excerpt: string | null;
  declare published_at: Date | null;
  declare importance: number;
  declare summary_json: any;
  declare card_id: string | null;
  declare first_seen_at: Date;
  declare last_seen_at: Date;
}

AiNewsItem.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    guid: { type: DataTypes.STRING(200), allowNull: false, unique: true },
    source: { type: DataTypes.STRING(80), allowNull: false },
    title: { type: DataTypes.TEXT, allowNull: false },
    url: { type: DataTypes.TEXT, allowNull: true },
    excerpt: { type: DataTypes.TEXT, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    importance: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    summary_json: { type: DataTypes.JSONB, allowNull: true },
    card_id: { type: DataTypes.UUID, allowNull: true },
    first_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'ai_news_items',
    timestamps: false,
    indexes: [
      { fields: ['source'] },
      { fields: ['importance'] },
      { fields: ['card_id'] },
    ],
  }
);

export default AiNewsItem;
