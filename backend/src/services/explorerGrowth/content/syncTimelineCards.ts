import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { ExplorerStageTag } from '../../../types/explorerGrowth';

/**
 * Explorer Growth OS — EPIC 5 T003. Project published timeline cards into the
 * content registry.
 *
 * A PROJECTION, NOT AN AUTHORING SURFACE. `explorer_content_assets` carries
 * `source_system` / `source_id` / `synced_at` and has no body column at all —
 * it holds `title`, `summary` and `url`. That is deliberate: the existing
 * campaign engine renders copy at send time from its sequence steps'
 * `ai_instructions`, so this registry supplies the THING TO POINT AT and never
 * the message. Storing copy here would duplicate the campaign engine, which the
 * original brief forbade, and would mean authoring content, which this epic's
 * contract puts out of scope.
 *
 * NOTHING SENDS. This module writes registry rows and returns counts.
 */

/** One projected row, before it reaches the database. */
interface AssetRow {
  source_id: string;
  title: string;
  summary: string | null;
  url: string;
  topic_tags: string[];
  journey_stage_tags: ExplorerStageTag[];
  priority: number;
  published_at: Date | null;
}

export interface SyncResult {
  scanned: number;
  written: number;
  /** Cards skipped, with the reason — a silent skip is indistinguishable from no data. */
  skipped: { source_id: string; reason: string }[];
}

const SOURCE_SYSTEM = 'timeline_cards';

/**
 * Where a card sits in the journey.
 *
 * MUST emit exactly the tags `PRIMARY_STATE_TO_STAGE` produces — the two are
 * compared to each other, and a test in `assetPurposeMap.test.ts` pins that
 * agreement rather than leaving it to inspection. Two ends that agree in type
 * and disagree in fact is this epic's whole subject.
 *
 * Weeks 0-1 are the beginning; 2-12 are the arc; a card with NO week is undated
 * and travels anywhere, which is what `evergreen` means here.
 */
export function stageTagForWeek(week: number | null): ExplorerStageTag {
  if (week === null || week === undefined) return 'evergreen';
  if (week <= 1) return 'activation';
  return 'learning';
}

/** What the projection query returns. Shape verified against the real database. */
interface CardRow {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  week: number | null;
  priority: number;
  release_date: Date | null;
  type_tags: unknown;
  type_category: string | null;
}

/**
 * Published, active cards whose TYPE is also active and feed-eligible.
 *
 * `today_eligible` and `is_active` live on `curriculum_type_definitions` and
 * already express whether a kind of content may surface to a learner. Honouring
 * them rather than re-deciding here keeps one answer to that question; a second
 * opinion in this file would drift from the first the moment either changed.
 *
 * The join is on `ctd.slug = tc.type` — measured at 585 of 585 on production,
 * no orphans — and it is an INNER join deliberately: a card whose type has no
 * definition has no eligibility answer, and projecting it would be assuming one.
 */
const PROJECTION_SQL = `
  SELECT tc.id,
         tc.title,
         tc.subtitle,
         tc.description,
         tc.week,
         tc.priority,
         tc.release_date,
         ctd.tags     AS type_tags,
         ctd.category AS type_category
    FROM timeline_cards tc
    JOIN curriculum_type_definitions ctd ON ctd.slug = tc.type
   WHERE tc.visibility = 'published'
     AND tc.status = 'active'
     AND ctd.is_active = true
     AND ctd.today_eligible = true
`;

/**
 * Topic tags from the card's type.
 *
 * `ctd.tags` is JSONB and frequently `[]`; `ctd.category` is usually present.
 * Sparse tagging is fine — an empty tag list means "no topic signal", and the
 * resolver treats an empty affinity list as no preference rather than as a
 * refusal, so sparseness costs reach rather than causing a miss.
 */
function topicTags(row: CardRow): string[] {
  const out = new Set<string>();
  if (Array.isArray(row.type_tags)) {
    for (const t of row.type_tags) if (typeof t === 'string' && t.trim()) out.add(t.trim());
  }
  if (row.type_category?.trim()) out.add(row.type_category.trim().toLowerCase());
  return [...out];
}

function toAssetRow(row: CardRow): AssetRow {
  return {
    source_id: row.id,
    title: row.title,
    // subtitle first: it is the human summary line. description is often long
    // rendered prose, so it is a fallback rather than the preference.
    summary: row.subtitle?.trim() || row.description?.trim()?.slice(0, 500) || null,
    url: `/portal/runtime/${row.id}`,
    topic_tags: topicTags(row),
    journey_stage_tags: [stageTagForWeek(row.week)],
    priority: row.priority ?? 0,
    published_at: row.release_date,
  };
}

/**
 * The upsert.
 *
 * TWO THINGS HERE ARE NOT INTERCHANGEABLE WITH THE OBVIOUS ALTERNATIVE.
 *
 * 1. `WHERE source_id IS NOT NULL` must be restated. The unique index is
 *    PARTIAL, and Postgres will not infer a partial index without its predicate
 *    — verified on production: without it the statement raises 42P10.
 *
 * 2. This is raw SQL rather than `ExplorerContentAsset.upsert()` because the
 *    model declares no `indexes` array, so Sequelize knows only the primary key
 *    and would conflict-target `id` — a fresh UUID per run. That inserts ~585 new
 *    rows every night with no error and no duplicate-key violation: a registry
 *    that doubles daily and never once complains.
 *
 * `synced_at` is set on every touch so a stale row is visible as stale.
 * `created_at` is left alone on conflict — an asset's first appearance is a fact
 * about the content, not about the last sync.
 */
const UPSERT_SQL = `
  INSERT INTO explorer_content_assets
    (asset_type, source_system, source_id, title, summary, url,
     topic_tags, journey_stage_tags, priority, published_at,
     allowed_channels, active, synced_at, created_at, updated_at)
  VALUES
    ('LESSON', :source_system, :source_id, :title, :summary, :url,
     CAST(:topic_tags AS text[]), CAST(:journey_stage_tags AS text[]), :priority, :published_at,
     ARRAY['email']::text[], true, now(), now(), now())
  ON CONFLICT (source_system, source_id) WHERE source_id IS NOT NULL
  DO UPDATE SET title              = EXCLUDED.title,
                summary            = EXCLUDED.summary,
                url                = EXCLUDED.url,
                topic_tags         = EXCLUDED.topic_tags,
                journey_stage_tags = EXCLUDED.journey_stage_tags,
                priority           = EXCLUDED.priority,
                published_at       = EXCLUDED.published_at,
                active             = true,
                synced_at          = now(),
                updated_at         = now()
`;

/** Postgres array literal for a text[] bind. */
function pgArray(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/(["\\])/g, '\\$1')}"`).join(',')}}`;
}

/**
 * Project every eligible card into the registry.
 *
 * IDEMPOTENT: running twice produces the same rows. That property is what makes
 * a shadow run trustworthy — a registry that changed between two identical runs
 * would make every downstream count unreproducible.
 *
 * Cards missing a title are skipped WITH A REASON rather than written with a
 * placeholder: `title` is NOT NULL, and a row titled "Untitled" is a row that
 * can be selected and cited.
 */
export async function syncTimelineCards(): Promise<SyncResult> {
  const cards = await sequelize.query<CardRow>(PROJECTION_SQL, { type: QueryTypes.SELECT });

  const result: SyncResult = { scanned: cards.length, written: 0, skipped: [] };

  for (const card of cards) {
    if (!card.title?.trim()) {
      result.skipped.push({ source_id: card.id, reason: 'no title' });
      continue;
    }
    const row = toAssetRow(card);
    await sequelize.query(UPSERT_SQL, {
      type: QueryTypes.INSERT,
      replacements: {
        source_system: SOURCE_SYSTEM,
        source_id: row.source_id,
        title: row.title,
        summary: row.summary,
        url: row.url,
        topic_tags: pgArray(row.topic_tags),
        journey_stage_tags: pgArray(row.journey_stage_tags),
        priority: row.priority,
        published_at: row.published_at,
      },
    });
    result.written += 1;
  }

  return result;
}

/**
 * Retire registry rows whose source card is no longer publishable.
 *
 * DEACTIVATES, NEVER DELETES, and touches only rows this sync owns
 * (`source_system = 'timeline_cards'`). Human-seeded rows carry a null
 * `source_id` and a different `source_system`; a sync that deleted them would
 * destroy work nobody could recover.
 *
 * Kept separate from the upsert loop so that a partial sync cannot retire
 * everything it merely failed to reach.
 */
export async function retireMissingCards(seenSourceIds: string[]): Promise<number> {
  if (seenSourceIds.length === 0) return 0; // refuse to retire everything on an empty scan
  const [, meta] = await sequelize.query(
    `UPDATE explorer_content_assets
        SET active = false, updated_at = now()
      WHERE source_system = :source_system
        AND source_id IS NOT NULL
        AND source_id <> ALL(CAST(:seen AS text[]))
        AND active = true`,
    {
      replacements: { source_system: SOURCE_SYSTEM, seen: pgArray(seenSourceIds) },
      type: QueryTypes.UPDATE,
    },
  );
  return typeof meta === 'number' ? meta : 0;
}
