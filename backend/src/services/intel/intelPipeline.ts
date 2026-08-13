/**
 * intelPipeline — the GENERIC intelligence-content engine.
 *
 * Extracted from the proven AI News Flash pipeline (aiNewsIngestionService) so
 * that N content generators become thin SOURCE ADAPTERS instead of N copy-pasted
 * pipelines. One adapter = an IntelSourceConfig (slug, cost-gate env, collect()).
 * The engine owns the shared lifecycle:
 *
 *   COLLECT      cfg.collect() → NormalizedIntelItem[]           (adapter-owned I/O)
 *   INGEST       upsert into intel_items ON CONFLICT (pipeline, guid)   (idempotent)
 *   SCORE        cfg.rank() or the default rankImportance → importance 0-100
 *   MATERIALIZE  per un-carded item: run the <slug> generation prompt (cost-gated)
 *   PUBLISH      one standalone published timeline_cards row; record card_id
 *
 * IDEMPOTENT (CLAUDE.md non-negotiable): dedup by (pipeline, guid); summarize only
 * when summary_json is null; one card per item (guarded by card_id). Re-running a
 * cron produces no duplicate items, no duplicate cards, and no duplicate LLM spend.
 *
 * FAIL-FIRST / COST-GATED: collect() failure skips the source (nothing throws); an
 * LLM failure leaves the item un-carded for the next run (no partial commit);
 * materialization only runs when cfg.enableEnv === 'true' (or opts.force), bounded
 * by maxCards. The pipeline slug doubles as the curriculum-type slug used to
 * resolve the generation prompt and stamp timeline_cards.type.
 *
 * NOTE: the registry + cost-gate rule live in the DB-free intelRegistry so they
 * stay unit-testable; this module re-exports that public surface so callers import
 * the whole engine API from one place.
 */
import { randomUUID } from 'crypto';
import { sequelize } from '../../config/database';
import IntelItem from '../../models/IntelItem';
import TimelineCard from '../../models/TimelineCard';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { resolvePrompt } from '../components/promptTesterService';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';
import { rankImportance } from './rssParser';
import { decideBootAction } from './aiNewsBootDecision';
import {
  NormalizedIntelItem,
  IntelRunResult,
  DEFAULT_CATCHUP_STALE_HOURS,
  getIntelSource,
  resolveMaterialization,
} from './intelRegistry';

// Re-export the registry/contract surface so callers get the whole engine API here.
export {
  registerIntelSource,
  getIntelSource,
  listIntelSources,
  resolveMaterialization,
  DEFAULT_CATCHUP_STALE_HOURS,
} from './intelRegistry';
export type { IntelSourceConfig, NormalizedIntelItem, IntelRunResult } from './intelRegistry';

/** The canonical program these cards attach to (AI Systems Architect Accelerator). */
const INTEL_PROGRAM_ID = process.env.INTEL_PROGRAM_ID || '92b98a72-8681-4f04-8ba1-16a18334cd0b';

/**
 * Upsert a batch of collected items for one pipeline. Idempotent on
 * (pipeline, guid); `summary_json`/`card_id` are NEVER overwritten on conflict so
 * a re-seen item keeps its generated content and its card. id/timestamps are
 * supplied explicitly so the raw INSERT never depends on DB-side defaults (the
 * podcast/blog lesson). Importance comes from the source's rank() if provided,
 * else the shared deterministic rankImportance.
 */
export async function ingestIntelItems(
  pipeline: string,
  source: string,
  items: NormalizedIntelItem[],
  now: Date,
): Promise<{ inserted: number; updated: number }> {
  const cfg = getIntelSource(pipeline);
  let inserted = 0;
  let updated = 0;
  for (const it of items) {
    const itemSource = it.source || source;
    const importance = cfg?.rank
      ? cfg.rank(it, now)
      : rankImportance({ source: itemSource, title: it.title, publishedAt: it.publishedAt }, now);
    // any: the raw query returns a driver-shaped tuple; we read only rows[0].inserted.
    const [rows]: any = await sequelize.query(
      `INSERT INTO intel_items
         (id, pipeline, guid, source, title, url, excerpt, published_at, importance, summary_json, card_id, first_seen_at, last_seen_at)
       VALUES (:id, :pipeline, :guid, :source, :title, :url, :excerpt, :pub, :importance, NULL, NULL, NOW(), NOW())
       ON CONFLICT (pipeline, guid) DO UPDATE SET
         title = EXCLUDED.title, url = EXCLUDED.url, excerpt = EXCLUDED.excerpt,
         published_at = EXCLUDED.published_at, importance = EXCLUDED.importance,
         source = EXCLUDED.source, last_seen_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      {
        replacements: {
          id: randomUUID(), pipeline, guid: it.guid, source: itemSource, title: it.title,
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
 *   - already carded (card_id set) → no-op (returns the existing id)
 *   - summarized but not carded → build the card from stored summary_json (no LLM)
 *   - not summarized → run the LLM once, store summary_json, then create the card
 * The pipeline slug is the curriculum-type slug used to resolve the generation
 * prompt and stamp timeline_cards.type. Returns the card id, or null if it could
 * not be materialized (no prompt / LLM failed) — the item stays un-carded for the
 * next run (no partial commit, so a retry is safe and duplicate-free).
 */
export async function materializeIntelCard(item: IntelItem, model = DEFAULT_MODEL): Promise<string | null> {
  if (item.card_id) return item.card_id;
  const slug = item.pipeline;

  // any: summary_json is an opaque per-pipeline JSONB blob (see IntelItem model).
  let content: any = item.summary_json && typeof item.summary_json === 'object' ? item.summary_json : null;

  if (!content) {
    const def = await CurriculumTypeDefinition.findOne({ where: { slug } });
    const gen = def ? ((def as any).generation_prompt as string | null) : null;
    if (!gen) {
      console.warn(`[intel] ${slug} has no generation_prompt — cannot materialize`);
      return null;
    }
    const label = def ? ((def as any).label as string | null) || slug : slug;
    const resolved = resolvePrompt(gen, {
      item_title: item.title || '',
      item_source: item.source || '',
      item_url: item.url || '',
      item_excerpt: item.excerpt || '',
      item_date: item.published_at ? new Date(item.published_at).toISOString().slice(0, 10) : '',
    });
    let parsed: any = {}; // any: untyped LLM JSON, validated key-by-key below.
    try {
      const client = getInstrumentedOpenAI({ workflow_id: `${slug}_generate` });
      const res = await client.chat.completions.create({
        model, temperature: 0.4, max_tokens: 1600, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `You render the "${label}" intelligence card into the exact content a reader sees. Return STRICT json.` },
          { role: 'user', content: `Produce the card as json with keys: title, summary, body_html (clean self-contained HTML, no scripts, no style), questions (string[]), reflection (string), discussion_prompt (string), github_task (string|null), evaluation_criteria (string[]), completion (string).\n\nInstruction:\n${resolved}` },
        ],
      });
      parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    } catch (err: any) {
      console.warn(`[intel] ${slug} LLM summarize failed for`, item.guid, '-', err?.message?.split('\n')[0]);
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

  // Standalone, program-wide, published card. week=null (a dateless feed card);
  // release_date carries the item's date for feed ordering.
  const card = await TimelineCard.create({
    type: slug,
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
      source: `${slug}_pipeline`,
      intel_item_id: item.id,
      item: { title: item.title, source: item.source, url: item.url, date: item.published_at },
    },
    // as any: the TimelineCard create payload is broader than the strict attrs
    // typing (mirrors materializeNewsCard); the shape is validated by the DB.
  } as any);

  await item.update({ card_id: card.id });
  return card.id;
}

/**
 * Full pipeline run for one registered source. Always ingests (cheap). Then, when
 * cost-gated on (cfg.enableEnv === 'true' or opts.force), materializes up to
 * maxCards pending items, highest-importance first. Fail-first: a collect()
 * failure skips the source; an ingest failure is logged; a per-item LLM failure
 * leaves that item un-carded. Nothing here throws into a caller/cron.
 */
export async function runIntelPipeline(
  slug: string,
  opts: { dryRun?: boolean; maxCards?: number; force?: boolean } = {},
): Promise<IntelRunResult> {
  const now = new Date();
  const result: IntelRunResult = { slug, found: 0, inserted: 0, updated: 0, carded: 0, collectFailed: false };
  const cfg = getIntelSource(slug);
  if (!cfg) {
    console.warn(`[intel] no source registered for '${slug}' — nothing to run`);
    return result;
  }

  let items: NormalizedIntelItem[] = [];
  try {
    items = await cfg.collect();
    result.found = items.length;
  } catch (err: any) {
    console.warn(`[intel] ${slug} collect failed:`, err?.message?.split('\n')[0]);
    result.collectFailed = true;
    return result; // keep prior state; the next run retries.
  }

  if (!opts.dryRun && items.length) {
    try {
      const r = await ingestIntelItems(cfg.slug, cfg.label, items, now);
      result.inserted += r.inserted;
      result.updated += r.updated;
    } catch (err: any) {
      console.warn(`[intel] ${slug} ingest failed:`, err?.message?.split('\n')[0]);
    }
  }

  const { materializeOn, maxCards } = resolveMaterialization(cfg, opts);
  if (!opts.dryRun && materializeOn) {
    // Wrapped so the "nothing here throws into a caller/cron" contract holds even
    // for direct callers (a cron that calls runIntelPipeline, not just the boot
    // path): a DB error selecting the pending batch is logged, not propagated.
    try {
      const pending = await IntelItem.findAll({
        where: { pipeline: slug, card_id: null as any }, // as any: Sequelize null-where typing
        order: [['importance', 'DESC'], ['published_at', 'DESC']],
        limit: maxCards,
      });
      for (const item of pending) {
        try {
          const id = await materializeIntelCard(item);
          if (id) result.carded += 1;
        } catch (err: any) {
          console.warn(`[intel] ${slug} materialize failed for`, item.guid, '-', err?.message?.split('\n')[0]);
        }
      }
    } catch (err: any) {
      console.warn(`[intel] ${slug} materialize query failed:`, err?.message?.split('\n')[0]);
    }
  }

  console.log(`[intel] ${slug}: found=${result.found} inserted=${result.inserted} updated=${result.updated} carded=${result.carded}` +
    (result.collectFailed ? ' (collect failed)' : ''));
  return result;
}

/**
 * Generic boot catch-up for one pipeline. Reuses the pure decideBootAction over
 * intel_items counts + the newest <slug> card age to dispatch initial/catchup/skip
 * — so a redeploy through a cron window doesn't silently drop a run. Cost-gated
 * (cfg.enableEnv), non-blocking, and failure-swallowed: a boot never hangs or
 * throws on this. Idempotent — once a fresh card exists, later boots no-op.
 */
export async function runIntelPipelineOnBoot(slug: string): Promise<void> {
  const cfg = getIntelSource(slug);
  if (!cfg) return;
  try {
    const [totalRows]: any = await sequelize.query(
      `SELECT count(*)::int AS n FROM intel_items WHERE pipeline = :slug`,
      { replacements: { slug } },
    );
    const total = Array.isArray(totalRows) && totalRows[0] ? Number(totalRows[0].n) : 0;

    const [pendRows]: any = await sequelize.query(
      `SELECT count(*)::int AS n FROM intel_items WHERE pipeline = :slug AND card_id IS NULL`,
      { replacements: { slug } },
    );
    const pending = Array.isArray(pendRows) && pendRows[0] ? Number(pendRows[0].n) : 0;

    const [ageRows]: any = await sequelize.query(
      `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 3600.0 AS hours
         FROM timeline_cards WHERE type = :slug`,
      { replacements: { slug } },
    );
    const rawHours = Array.isArray(ageRows) && ageRows[0] ? ageRows[0].hours : null;
    const newestCardAgeHours = rawHours === null || rawHours === undefined ? null : Number(rawHours);

    const decision = decideBootAction({
      total,
      pending,
      newestCardAgeHours,
      materializeEnabled: process.env[cfg.enableEnv] === 'true',
      staleHours: cfg.catchupStaleHours ?? DEFAULT_CATCHUP_STALE_HOURS,
    });

    if (decision.action === 'skip') {
      console.log(`[intel] ${slug} boot: no action (${decision.reason})`);
      return;
    }
    if (decision.action === 'initial') {
      console.log(`[intel] ${slug} boot: library empty — running the initial ingest`);
      await runIntelPipeline(slug, { maxCards: 1 });
      return;
    }
    console.log(`[intel] ${slug} boot catch-up (${decision.reason}, ${pending} pending) — materializing`);
    await runIntelPipeline(slug); // default maxCards = cfg.maxPerRunEnv
  } catch (err: any) {
    console.warn(`[intel] ${slug} boot ingest skipped:`, err?.message?.split('\n')[0]);
  }
}
