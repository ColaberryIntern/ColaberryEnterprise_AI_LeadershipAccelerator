/**
 * aiNewsIngestionService — the AI News Flash intelligence pipeline.
 *
 * Lifecycle (mirrors the blog/podcast precedent, plus LLM summarization):
 *   COLLECT   fetch a set of free AI-lab RSS feeds (native fetch + timeout + retries)
 *   NORMALIZE parseRssFeed → {guid,title,url,excerpt,publishedAt}
 *   DEDUPE    upsert into ai_news_items ON CONFLICT (guid)   (idempotent)
 *   SCORE     rankImportance → importance 0-100
 *   SUMMARIZE for each un-carded item: run the ai_news_flash generation prompt
 *   GENERATE  persist the 9-key card content on the row (summary_json)
 *   PUBLISH   create ONE standalone published timeline_cards row; record card_id
 *
 * IDEMPOTENT & REPLAYABLE (CLAUDE.md non-negotiable): dedup by guid; summarize
 * only when summary_json is null; create at most one card per item (guarded by
 * card_id). Re-running the cron produces no duplicate items, no duplicate cards,
 * and no duplicate LLM spend.
 *
 * FAIL-FIRST: every fetch has a hard timeout + capped retries; a feed failure is
 * logged and skipped (other feeds still ingest); an LLM failure leaves the item
 * un-carded for the next run (no partial commit); nothing here can throw into a
 * student request path.
 *
 * COST-GATED: live materialization only runs when AI_NEWS_INGEST_ENABLED === 'true'.
 * The library ingest (no LLM) always runs; card materialization is the gated,
 * cost-bearing step. maxCards bounds LLM spend per run.
 */
import { randomUUID } from 'crypto';
import { sequelize } from '../../config/database';
import AiNewsItem from '../../models/AiNewsItem';
import TimelineCard from '../../models/TimelineCard';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { resolvePrompt } from '../components/promptTesterService';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';
import { parseRssFeed, rankImportance, RssItem } from './rssParser';

export const NEWS_TYPE_SLUG = 'ai_news_flash';

/** The canonical program these cards attach to (AI Systems Architect Accelerator). */
const INTEL_PROGRAM_ID = process.env.INTEL_PROGRAM_ID || '92b98a72-8681-4f04-8ba1-16a18334cd0b';

/** Free, no-key AI-lab feeds. Override with AI_NEWS_FEEDS="Source|url,Source|url". */
export interface FeedSource { source: string; url: string }
export const DEFAULT_FEEDS: FeedSource[] = [
  { source: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml' },
  { source: 'NVIDIA', url: 'https://blogs.nvidia.com/feed/' },
  { source: 'OpenAI', url: 'https://openai.com/blog/rss.xml' },
  { source: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { source: 'Anthropic', url: 'https://www.anthropic.com/news/rss.xml' },
];

export function configuredFeeds(): FeedSource[] {
  const raw = (process.env.AI_NEWS_FEEDS || '').trim();
  if (!raw) return DEFAULT_FEEDS;
  const parsed = raw.split(',').map((pair) => {
    const [source, url] = pair.split('|').map((s) => s.trim());
    return source && url ? { source, url } : null;
  }).filter(Boolean) as FeedSource[];
  return parsed.length ? parsed : DEFAULT_FEEDS;
}

/** Native fetch + AbortController with a hard timeout and capped retries. */
async function fetchWithTimeout(url: string, timeoutMs = 20_000, attempts = 3): Promise<string> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'ColaberryAccelerator/1.0 (+https://enterprise.colaberry.ai)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export interface IngestResult { found: number; inserted: number; updated: number; carded: number; skippedFeeds: string[] }

/**
 * Upsert a batch of already-parsed items for one source. Pure of network; used by
 * refreshAiNews and directly by tests. Idempotent on guid. Returns per-item
 * inserted/updated counts.
 */
export async function ingestItems(source: string, items: RssItem[], now: Date): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const it of items) {
    const importance = rankImportance({ source, title: it.title, publishedAt: it.publishedAt }, now);
    // id/timestamps supplied explicitly so the raw INSERT never depends on DB-side
    // defaults (podcast/blog lesson). summary_json/card_id are NEVER overwritten on
    // conflict — a re-seen item keeps its generated content and its card.
    const [rows]: any = await sequelize.query(
      `INSERT INTO ai_news_items
         (id, guid, source, title, url, excerpt, published_at, importance, summary_json, card_id, first_seen_at, last_seen_at)
       VALUES (:id, :guid, :source, :title, :url, :excerpt, :pub, :importance, NULL, NULL, NOW(), NOW())
       ON CONFLICT (guid) DO UPDATE SET
         title = EXCLUDED.title, url = EXCLUDED.url, excerpt = EXCLUDED.excerpt,
         published_at = EXCLUDED.published_at, importance = EXCLUDED.importance,
         last_seen_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      {
        replacements: {
          id: randomUUID(), guid: it.guid, source, title: it.title,
          url: it.url, excerpt: it.excerpt, pub: it.publishedAt, importance,
        },
      },
    );
    if (Array.isArray(rows) && rows[0]?.inserted) inserted += 1; else updated += 1;
  }
  return { inserted, updated };
}

/**
 * Materialize ONE library item into a published Timeline card. Idempotent:
 *   - already carded (card_id set) → no-op
 *   - summarized but not carded → create the card from the stored summary_json
 *     (no LLM re-spend)
 *   - not summarized → run the LLM once, store summary_json, then create the card
 * Returns the card id, or null if it could not be materialized (e.g. no LLM).
 */
export async function materializeNewsCard(item: AiNewsItem, model = DEFAULT_MODEL): Promise<string | null> {
  if (item.card_id) return item.card_id;

  let content = item.summary_json && typeof item.summary_json === 'object' ? item.summary_json : null;

  if (!content) {
    const def = await CurriculumTypeDefinition.findOne({ where: { slug: NEWS_TYPE_SLUG } });
    const gen = def ? ((def as any).generation_prompt as string | null) : null;
    if (!gen) {
      console.warn('[aiNews] ai_news_flash has no generation_prompt — cannot materialize');
      return null;
    }
    const resolved = resolvePrompt(gen, {
      item_title: item.title || '',
      item_source: item.source || '',
      item_url: item.url || '',
      item_excerpt: item.excerpt || '',
      item_date: item.published_at ? new Date(item.published_at).toISOString().slice(0, 10) : '',
    });
    let parsed: any = {};
    try {
      const client = getInstrumentedOpenAI({ workflow_id: 'ai_news_flash_generate' });
      const res = await client.chat.completions.create({
        model, temperature: 0.4, max_tokens: 1600, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You render the "AI News Flash" intelligence card into the exact content a reader sees. Return STRICT json.' },
          { role: 'user', content: `Produce the card as json with keys: title, summary, body_html (clean self-contained HTML, no scripts, no style), questions (string[]), reflection (string), discussion_prompt (string), github_task (string|null), evaluation_criteria (string[]), completion (string).\n\nInstruction:\n${resolved}` },
        ],
      });
      parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    } catch (err: any) {
      console.warn('[aiNews] LLM summarize failed for', item.guid, '-', err?.message?.split('\n')[0]);
      return null; // leave un-carded; the next run retries. No partial commit.
    }
    content = {
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : item.title,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      body_html: typeof parsed.body_html === 'string' ? parsed.body_html : undefined,
      questions: Array.isArray(parsed.questions) ? parsed.questions.map(String) : [],
      reflection: typeof parsed.reflection === 'string' ? parsed.reflection : undefined,
      discussion_prompt: typeof parsed.discussion_prompt === 'string' ? parsed.discussion_prompt : undefined,
    };
    await item.update({ summary_json: content });
  }

  // Create the standalone, program-wide, published card. week=null (a dateless
  // feed card); release_date carries the item's date for feed ordering.
  const card = await TimelineCard.create({
    type: NEWS_TYPE_SLUG,
    title: (content.title || item.title).slice(0, 480),
    description: content.summary || null,
    week: null,
    bucket: 'learn',
    visibility: 'published',
    status: 'active',
    release_date: item.published_at || null,
    estimated_time: 6,
    difficulty: 'intro',
    points: { learning: 5 },
    cohort_id: null,
    program_id: INTEL_PROGRAM_ID,
    metadata: {
      content: { ...content, content_at: new Date().toISOString() },
      content_at: new Date().toISOString(),
      source: 'ai_news_flash_pipeline',
      news_item_id: item.id,
      item: { title: item.title, source: item.source, url: item.url, date: item.published_at },
    },
  } as any);

  await item.update({ card_id: card.id });
  return card.id;
}

/**
 * Full pipeline run. Always ingests the library (cheap). Materializes cards only
 * when AI_NEWS_INGEST_ENABLED === 'true' (cost gate), up to `maxCards` per run,
 * newest/highest-importance first.
 */
export async function refreshAiNews(opts: { dryRun?: boolean; maxCards?: number; force?: boolean } = {}): Promise<IngestResult> {
  const now = new Date();
  const feeds = configuredFeeds();
  const result: IngestResult = { found: 0, inserted: 0, updated: 0, carded: 0, skippedFeeds: [] };

  for (const feed of feeds) {
    try {
      const xml = await fetchWithTimeout(feed.url);
      const items = parseRssFeed(xml, feed.source);
      if (!items.length) {
        console.warn('[aiNews] parsed 0 items from', feed.url, '- feed shape changed? Skipped.');
        result.skippedFeeds.push(feed.source);
        continue;
      }
      result.found += items.length;
      if (!opts.dryRun) {
        const r = await ingestItems(feed.source, items, now);
        result.inserted += r.inserted;
        result.updated += r.updated;
      }
    } catch (err: any) {
      console.warn('[aiNews] feed failed:', feed.source, '-', err?.message?.split('\n')[0]);
      result.skippedFeeds.push(feed.source);
    }
  }

  const materializeOn = opts.force || process.env.AI_NEWS_INGEST_ENABLED === 'true';
  if (!opts.dryRun && materializeOn) {
    const maxCards = opts.maxCards ?? 12;
    const pending = await AiNewsItem.findAll({
      where: { card_id: null as any },
      order: [['importance', 'DESC'], ['published_at', 'DESC']],
      limit: maxCards,
    });
    for (const item of pending) {
      try {
        const id = await materializeNewsCard(item);
        if (id) result.carded += 1;
      } catch (err: any) {
        console.warn('[aiNews] materialize failed for', item.guid, '-', err?.message?.split('\n')[0]);
      }
    }
  }

  console.log(`[aiNews] refresh: found=${result.found} inserted=${result.inserted} updated=${result.updated} carded=${result.carded}` +
    (result.skippedFeeds.length ? ` skipped=[${result.skippedFeeds.join(',')}]` : ''));
  return result;
}

/** Boot helper — populate a fresh environment once, non-blocking. Ingest only
 *  (no LLM at boot) unless AI_NEWS_INGEST_ENABLED is on. */
export async function refreshAiNewsIfEmpty(): Promise<void> {
  try {
    const [rows]: any = await sequelize.query(`SELECT count(*)::int AS n FROM ai_news_items`);
    const n = Array.isArray(rows) && rows[0] ? Number(rows[0].n) : NaN;
    if (n === 0) {
      console.log('[aiNews] ai_news_items is empty — running the initial ingest');
      await refreshAiNews({ maxCards: 6 });
    }
  } catch (err: any) {
    console.warn('[aiNews] boot ingest skipped:', err?.message?.split('\n')[0]);
  }
}
