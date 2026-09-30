import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * IntelItem — the GENERIC library table behind the intelligence-content pipeline.
 *
 * This is AiNewsItem generalized: one table, `intel_items`, backs N content
 * generators instead of one. A `pipeline` discriminator column names the source
 * adapter (which doubles as the curriculum-type slug), so AI News Flash, a
 * papers feed, a jobs feed, etc. all share the same ingest → score → materialize
 * lifecycle without a table per source.
 *
 * A cron (per pipeline) upserts each collected item here, deduped by
 * (pipeline, guid). Materialization is a separate, idempotent step: for each item
 * without `summary_json`, the engine runs the `<pipeline>` generation prompt (via
 * the instrumented OpenAI path), stores the generated card content on
 * `summary_json`, then creates ONE standalone published `timeline_cards` row and
 * records its id on `card_id`.
 *
 * Schema is created explicitly at boot by ensureIntelItemsSchema() (no global
 * sync — see MEMORY: new tables need ensure*Schema() + raw-SQL id/ts).
 */
export interface IntelItemAttributes {
  id?: string;
  pipeline: string;        // source-adapter slug AND the curriculum-type slug
  guid: string;            // dedup key within a pipeline: `${source}:${sha1(link|title)}`
  source: string;          // sub-source label, e.g. 'Anthropic', 'OpenAI', 'arXiv'
  title: string;
  url?: string | null;
  excerpt?: string | null;
  published_at?: Date | null;
  importance?: number;     // 0-100 deterministic rank (source + recency + signals)
  // any: the generated card content is per-pipeline (each curriculum type renders
  // its own key set); it is validated field-by-field at materialize time, so the
  // column stays an opaque JSONB blob here — mirrors AiNewsItem.summary_json.
  summary_json?: any;      // null until materialized
  card_id?: string | null; // the materialized timeline_cards.id (null until carded)
  first_seen_at?: Date;
  last_seen_at?: Date;
}

class IntelItem extends Model<IntelItemAttributes> implements IntelItemAttributes {
  declare id: string;
  declare pipeline: string;
  declare guid: string;
  declare source: string;
  declare title: string;
  declare url: string | null;
  declare excerpt: string | null;
  declare published_at: Date | null;
  declare importance: number;
  declare summary_json: any; // any: see IntelItemAttributes.summary_json
  declare card_id: string | null;
  declare first_seen_at: Date;
  declare last_seen_at: Date;
}

IntelItem.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    pipeline: { type: DataTypes.STRING(80), allowNull: false },
    guid: { type: DataTypes.STRING(200), allowNull: false },
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
    tableName: 'intel_items',
    timestamps: false,
    indexes: [
      // dedup key is (pipeline, guid): the same guid may legitimately recur under
      // two different pipelines, so uniqueness is scoped to the pipeline.
      { unique: true, fields: ['pipeline', 'guid'] },
      { fields: ['pipeline', 'importance'] },
      { fields: ['pipeline', 'card_id'] },
    ],
  }
);

/**
 * Idempotent DDL for intel_items. Mirrors ensureAiNewsSchema in server.ts:
 * CREATE TABLE / INDEX IF NOT EXISTS, DB-side defaults for id/timestamps, each
 * statement guarded so a partial failure logs and continues. Safe to run on every
 * boot. A later wiring unit calls this alongside the other ensure*Schema() calls.
 */
export async function ensureIntelItemsSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS intel_items (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       pipeline VARCHAR(80) NOT NULL,
       guid VARCHAR(200) NOT NULL,
       source VARCHAR(80) NOT NULL,
       title TEXT NOT NULL,
       url TEXT,
       excerpt TEXT,
       published_at TIMESTAMPTZ,
       importance INTEGER NOT NULL DEFAULT 0,
       summary_json JSONB,
       card_id UUID,
       first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_items_pipeline_guid ON intel_items (pipeline, guid)`,
    `CREATE INDEX IF NOT EXISTS idx_intel_items_pipeline_importance ON intel_items (pipeline, importance DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_intel_items_pipeline_card ON intel_items (pipeline, card_id)`,
  ];
  for (const sql of statements) {
    try { await sequelize.query(sql); }
    catch (err: any) { console.warn('[DB] intel_items schema statement failed:', err.message?.split('\n')[0]); }
  }
  console.log('[DB] intel_items schema ensured');
}

export default IntelItem;
