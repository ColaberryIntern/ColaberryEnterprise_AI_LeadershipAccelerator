/**
 * feedTypeStatsService — read-only per-type delivery analytics for the Feed
 * Control admin board's gear-icon type drawer (NOT the CAPE governance board).
 *
 * Answers the product ask directly: how many times is this type triggered,
 * how many items do we have to choose from, how often is new content being
 * created, how many distinct timelines has it appeared in, what's its
 * velocity, and — the required part — if it isn't appearing, WHY, checked
 * against REAL config and REAL data rather than a templated guess.
 *
 * PURE READ PATH. Every query here is a SELECT; nothing is ever written.
 * Reuses the exact tables/columns the proven-working code already reads
 * (today_feed_impressions, timeline_cards, blog_posts, podcasts,
 * network_videos, intel_items) rather than inventing a parallel tracking
 * system — see ambientPool.ts and feedControlService.simulate() for the
 * precedent this follows.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { resolve as resolveType, allTypes } from './typeRegistry';
import { getFeedPolicy, type FeedPolicy } from './feedConfigService';
import { getRoutingMap, type TypeRouting } from './feedControlService';
import { AMBIENT_REPEAT_COOLDOWN_DAYS } from './ambientPool';

const AMBIENT_SLUGS = new Set(['blog', 'podcast', 'testimonial']);

// Confirmed via direct inspection of backend/src/services/intel/sources/ (not
// guessed): these Intelligence Pipeline types ship a fixed, hand-curated
// content list with no live re-fetch, so "found=0 inserted=0" every run is
// expected exhaustion of a finite catalog, not a live-source outage.
const STATIC_INTEL_SLUGS = new Set(['ai_tool_of_the_day', 'ai_quote_of_the_day', 'claude_code_technique', 'market_intelligence']);
const INTEL_PIPELINE_SLUGS = new Set([
  'ai_news_flash', 'ai_research_digest', 'ai_tool_of_the_day', 'ai_video_stream',
  'ai_quote_of_the_day', 'ai_architecture_breakdown', 'build_breakdown',
  'mcp_server_spotlight', 'claude_code_technique', 'market_intelligence',
]);

export type DiagnosticSeverity = 'info' | 'warning' | 'critical';
export interface TypeStatsDiagnostic { code: string; severity: DiagnosticSeverity; message: string; }

export interface TypeStats {
  slug: string;
  label: string;
  student_label: string;
  home_surface: string;
  feed_mode: 'anchored' | 'ambient';
  pool: { total: number; publishedNow: number | null; source: string };
  creation: { last7d: number; last30d: number; mostRecentAt: string | null };
  triggered: { allTime: number; last7d: number; last30d: number };
  breadth: { distinctEnrollments: number };
  velocity: { perDay7d: number; perDay30d: number; trend: 'up' | 'down' | 'flat' };
  routing: { cadence: number | null; frequencyCap: number | null; cooldownDays: number | null; todayEligible: boolean };
  lane: { totalImpressions30d: number; typeShare30d: number; equalShareBaseline: number };
  diagnostics: TypeStatsDiagnostic[];
  generatedAt: string;
}

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round((Number.isFinite(n) ? n : 0) * f) / f;
}

async function getPool(slug: string): Promise<{ total: number; publishedNow: number | null; source: string }> {
  if (slug === 'blog') {
    const rows = await sequelize.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM blog_posts WHERE is_active`,
      { type: QueryTypes.SELECT },
    ).catch(() => [{ total: 0 }]);
    return { total: rows[0]?.total ?? 0, publishedNow: null, source: 'blog_posts (is_active)' };
  }
  if (slug === 'podcast') {
    const rows = await sequelize.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM podcasts WHERE is_active AND audio_url IS NOT NULL`,
      { type: QueryTypes.SELECT },
    ).catch(() => [{ total: 0 }]);
    return { total: rows[0]?.total ?? 0, publishedNow: null, source: 'podcasts (is_active, audio_url set)' };
  }
  if (slug === 'testimonial') {
    const rows = await sequelize.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM network_videos WHERE is_active AND playable`,
      { type: QueryTypes.SELECT },
    ).catch(() => [{ total: 0 }]);
    return { total: rows[0]?.total ?? 0, publishedNow: null, source: 'network_videos (is_active, playable)' };
  }
  // Excludes the permanent 'intel_sample_seed' card every intel-pipeline type
  // gets planted unconditionally at every server boot (seedIntelSampleCards()) —
  // without this exclusion `total` is never truly 0 for those types even when
  // their real generated content has fully run dry, which silently prevented
  // the INTEL_SOURCE_EXHAUSTED/POOL_EMPTY diagnostics below from ever firing
  // (found 2026-08-10 investigating why 4 types went quiet with no admin-visible
  // warning). A no-op for non-intel types, which never carry this source value.
  const rows = await sequelize.query<{ total: number; published_now: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active' AND metadata->>'source' IS DISTINCT FROM 'intel_sample_seed')::int AS total,
       COUNT(*) FILTER (WHERE status = 'active' AND visibility = 'published' AND metadata->>'source' IS DISTINCT FROM 'intel_sample_seed')::int AS published_now
     FROM timeline_cards WHERE type = :slug`,
    { replacements: { slug }, type: QueryTypes.SELECT },
  ).catch(() => [{ total: 0, published_now: 0 }]);
  return { total: rows[0]?.total ?? 0, publishedNow: rows[0]?.published_now ?? 0, source: 'timeline_cards (status=active, excludes permanent sample seed)' };
}

async function getCreation(slug: string): Promise<{ last7d: number; last30d: number; mostRecentAt: string | null }> {
  let sql: string;
  let replacements: Record<string, unknown> = {};
  if (slug === 'blog') {
    sql = `SELECT COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '7 days')::int AS last7,
                  COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '30 days')::int AS last30,
                  MAX(published_at) AS most_recent
             FROM blog_posts WHERE is_active`;
  } else if (slug === 'podcast') {
    sql = `SELECT COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '7 days')::int AS last7,
                  COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '30 days')::int AS last30,
                  MAX(published_at) AS most_recent
             FROM podcasts WHERE is_active AND audio_url IS NOT NULL`;
  } else if (slug === 'testimonial') {
    sql = `SELECT COUNT(*) FILTER (WHERE ingested_at >= NOW() - INTERVAL '7 days')::int AS last7,
                  COUNT(*) FILTER (WHERE ingested_at >= NOW() - INTERVAL '30 days')::int AS last30,
                  MAX(ingested_at) AS most_recent
             FROM network_videos WHERE is_active AND playable`;
  } else {
    sql = `SELECT COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last7,
                  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last30,
                  MAX(created_at) AS most_recent
             FROM timeline_cards WHERE type = :slug`;
    replacements = { slug };
  }
  const rows = await sequelize.query<{ last7: number; last30: number; most_recent: string | null }>(
    sql, { replacements, type: QueryTypes.SELECT },
  ).catch(() => [{ last7: 0, last30: 0, most_recent: null }]);
  const r = rows[0];
  return { last7d: r?.last7 ?? 0, last30d: r?.last30 ?? 0, mostRecentAt: r?.most_recent ?? null };
}

interface ImpressionStats { allTime: number; last7d: number; last30d: number; distinctEnrollments: number }

async function getImpressions(slug: string, mode: 'anchored' | 'ambient'): Promise<ImpressionStats> {
  const sql = mode === 'ambient'
    ? `SELECT COUNT(*)::int AS all_time,
              COUNT(*) FILTER (WHERE served_at >= NOW() - INTERVAL '7 days')::int AS last7,
              COUNT(*) FILTER (WHERE served_at >= NOW() - INTERVAL '30 days')::int AS last30,
              COUNT(DISTINCT enrollment_id)::int AS distinct_enrollments
         FROM today_feed_impressions WHERE provider = :slug`
    : `SELECT COUNT(*)::int AS all_time,
              COUNT(*) FILTER (WHERE tfi.served_at >= NOW() - INTERVAL '7 days')::int AS last7,
              COUNT(*) FILTER (WHERE tfi.served_at >= NOW() - INTERVAL '30 days')::int AS last30,
              COUNT(DISTINCT tfi.enrollment_id)::int AS distinct_enrollments
         FROM today_feed_impressions tfi JOIN timeline_cards tc ON tc.id = tfi.card_id
        WHERE tc.type = :slug`;
  const rows = await sequelize.query<{ all_time: number; last7: number; last30: number; distinct_enrollments: number }>(
    sql, { replacements: { slug }, type: QueryTypes.SELECT },
  ).catch(() => [{ all_time: 0, last7: 0, last30: 0, distinct_enrollments: 0 }]);
  const r = rows[0];
  return { allTime: r?.all_time ?? 0, last7d: r?.last7 ?? 0, last30d: r?.last30 ?? 0, distinctEnrollments: r?.distinct_enrollments ?? 0 };
}

/** All types' 30-day impression counts in ONE query, used both for lane-share
 *  diagnostics on a single type and for the adjustment preview's displacement
 *  model (feedTypeAdjustmentPreviewService) — avoids an N-query fan-out. */
export async function getLaneImpressionMap30d(): Promise<Map<string, number>> {
  const rows = await sequelize.query<{ slug: string; n: number }>(
    `SELECT tc.type AS slug, COUNT(*)::int AS n
       FROM today_feed_impressions tfi JOIN timeline_cards tc ON tc.id = tfi.card_id
      WHERE tfi.served_at >= NOW() - INTERVAL '30 days'
      GROUP BY tc.type
      UNION ALL
     SELECT provider AS slug, COUNT(*)::int AS n
       FROM today_feed_impressions
      WHERE provider IS NOT NULL AND served_at >= NOW() - INTERVAL '30 days'
      GROUP BY provider`,
    { type: QueryTypes.SELECT },
  ).catch(() => [] as Array<{ slug: string; n: number }>);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.slug, (map.get(r.slug) || 0) + Number(r.n));
  return map;
}

/** Real 30-day breakdown of every OTHER type sharing this type's lane —
 *  the ground truth behind both the LOW_LANE_SHARE diagnostic and the
 *  adjustment preview's "what gets displaced" model. */
export async function getLaneBreakdown30d(homeSurface: string, excludeSlug?: string): Promise<Array<{ slug: string; label: string; impressions30d: number; share30d: number }>> {
  const laneMap = await getLaneImpressionMap30d();
  const laneTypes = allTypes().filter((t) => !t.system && !t.event && t.home_surface === homeSurface && t.slug !== excludeSlug);
  const total = laneTypes.reduce((s, t) => s + (laneMap.get(t.slug) || 0), 0);
  return laneTypes
    .map((t) => {
      const n = laneMap.get(t.slug) || 0;
      return { slug: t.slug, label: t.student_label || t.label, impressions30d: n, share30d: total > 0 ? n / total : 0 };
    })
    .sort((a, b) => b.impressions30d - a.impressions30d);
}

async function getAmbientRotationPressure(slug: string, pool: number): Promise<{ distinctRecentRefs: number; pressure: number } | null> {
  if (!AMBIENT_SLUGS.has(slug) || pool <= 0) return null;
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(DISTINCT ref)::int AS n FROM today_feed_impressions
      WHERE provider = :slug AND served_at >= NOW() - (:days::text || ' days')::interval`,
    { replacements: { slug, days: AMBIENT_REPEAT_COOLDOWN_DAYS }, type: QueryTypes.SELECT },
  ).catch(() => [{ n: 0 }]);
  const n = rows[0]?.n ?? 0;
  return { distinctRecentRefs: n, pressure: pool > 0 ? n / pool : 0 };
}

async function getIntelPending(slug: string): Promise<number | null> {
  if (!INTEL_PIPELINE_SLUGS.has(slug)) return null;
  const rows = await sequelize.query<{ pending: number }>(
    `SELECT COUNT(*)::int AS pending FROM intel_items WHERE pipeline = :slug AND card_id IS NULL`,
    { replacements: { slug }, type: QueryTypes.SELECT },
  ).catch(() => [{ pending: 0 }]);
  return rows[0]?.pending ?? 0;
}

function buildDiagnostics(
  s: Omit<TypeStats, 'diagnostics'>,
  mode: 'anchored' | 'ambient',
  intelPending: number | null,
  ambientPressure: { distinctRecentRefs: number; pressure: number } | null,
): TypeStatsDiagnostic[] {
  const out: TypeStatsDiagnostic[] = [];

  // (a) checkbox/routing disabled — the single biggest, most common reason.
  if (!s.routing.todayEligible) {
    out.push({
      code: 'ROUTING_DISABLED', severity: 'critical',
      message: `"Eligible for the Today feed" is unchecked for this type — it is fully excluded from every student's timeline regardless of content or demand. Check the box in Feed Control to re-enable it.`,
    });
  }

  // (b) type-level cadence/freq-cap/cooldown are stored but NOT wired into the
  // live ranker for anchored cards. Confirmed by reading feedRanker.ts +
  // timelineService.ts: rankWithLegacyRanker (feedControlService.ts) reads
  // c.feed_frequency_cap / c.feed_cooldown_days off the CARD object only —
  // it never merges the TYPE-level routing.feed_frequency_cap/cooldown_days
  // onto a card that lacks its own override. This is the real, verified
  // reason cadence-tuning currently has zero live effect for anchored types.
  if (mode === 'anchored' && (s.routing.cadence != null || s.routing.frequencyCap != null || s.routing.cooldownDays != null)) {
    out.push({
      code: 'TYPE_LEVEL_KNOBS_INERT', severity: 'info',
      message: `Cadence/Freq cap/Cooldown are set at the type level but are not currently consumed by the live ranker for anchored cards — only a CARD's own override (Route Card) affects delivery today. Editing these fields changes what's stored and displayed, not what students see, until a per-card override is set to match.`,
    });
  }

  // (c) nothing currently published, even though items exist.
  if (mode === 'anchored' && s.pool.publishedNow === 0 && s.pool.total > 0) {
    out.push({
      code: 'NOTHING_PUBLISHED', severity: 'warning',
      message: `${s.pool.total} item(s) exist for this type but 0 are currently published (draft or scheduled) — nothing is eligible to serve until a card's visibility is set to "published".`,
    });
  }

  // (d) pool genuinely exhausted.
  if (s.pool.total === 0) {
    if (intelPending != null) {
      const staticSrc = STATIC_INTEL_SLUGS.has(s.slug);
      out.push({
        code: 'INTEL_SOURCE_EXHAUSTED', severity: 'critical',
        message: staticSrc
          ? `Pool is empty. This is a static/curated Intelligence Pipeline source (backend/src/services/intel/sources/) — its hardcoded catalog has been fully consumed (${intelPending} pending). It needs a manual content refresh, not a config change.`
          : `Pool is empty with ${intelPending} item(s) currently pending in the ingestion pipeline (intel_items, card_id IS NULL). Either the live source found nothing new on its last run, or pending items haven't been carded yet.`,
      });
    } else {
      out.push({
        code: 'POOL_EMPTY', severity: 'critical',
        message: `0 items exist for this type right now (source: ${s.pool.source}). Nothing can be served until content is created.`,
      });
    }
  }

  // (d, ambient variant) rotation pressure — most of a small pool has been
  // shown to SOMEONE within the cooldown window, so active students are
  // likely seeing repeats or gaps (this is the exact 2026-08-04 incident
  // pattern documented in ambientPool.ts, checked here per-type in general).
  if (ambientPressure && ambientPressure.pressure >= 0.85) {
    out.push({
      code: 'AMBIENT_ROTATION_PRESSURE', severity: 'warning',
      message: `${ambientPressure.distinctRecentRefs} of ${s.pool.total} pool item(s) (${Math.round(ambientPressure.pressure * 100)}%) were already shown to at least one student within the last ${AMBIENT_REPEAT_COOLDOWN_DAYS}-day cooldown window. Active students are likely seeing repeats sooner than intended. Consider growing the pool or shortening AMBIENT_REPEAT_COOLDOWN_DAYS.`,
    });
  }

  // (f) receiving a disproportionately low share of its lane's real traffic.
  if (s.routing.todayEligible && s.pool.total > 0 && s.lane.equalShareBaseline > 0 && s.lane.totalImpressions30d >= 20) {
    if (s.lane.typeShare30d < s.lane.equalShareBaseline * 0.3) {
      out.push({
        code: 'LOW_LANE_SHARE', severity: 'warning',
        message: `Receiving ${(s.lane.typeShare30d * 100).toFixed(1)}% of impressions in its "${s.home_surface}" lane over the last 30 days, vs. an equal-share baseline of ${(s.lane.equalShareBaseline * 100).toFixed(1)}% across ${Math.round(1 / s.lane.equalShareBaseline)} active type(s) there. Other pinned, higher-priority, or fresher content in the same lane is likely outranking it (feedRanker.ts scores priority, pin, and recency before this type is even reached).`,
      });
    }
  }

  // Fallback: never leave a silent gap — if it's eligible, has a pool, and
  // truly nothing above explains zero recent activity, say so plainly.
  if (s.triggered.last30d === 0 && s.routing.todayEligible && s.pool.total > 0 && out.length === 0) {
    out.push({
      code: 'NO_RECENT_ACTIVITY_UNEXPLAINED', severity: 'warning',
      message: `No impressions recorded in the last 30 days despite ${s.pool.total} available item(s) and this type being eligible. Check cohort/program scoping on its cards (cohort_id/program_id), or whether the students who would see it have already completed or locked every instance.`,
    });
  }

  return out;
}

/** The single per-type stats read the gear-icon drawer calls when it opens.
 *  Throws a 404-shaped error for an unknown slug (fail loud, matches
 *  routeType's own contract in feedControlService.ts). */
export async function getTypeStats(slug: string): Promise<TypeStats> {
  const def = resolveType(slug);
  if (!def) throw Object.assign(new Error(`unknown type ${slug}`), { status: 404 });
  const mode: 'anchored' | 'ambient' = AMBIENT_SLUGS.has(slug) || def.feed_mode === 'ambient' ? 'ambient' : 'anchored';

  const [pool, creation, impressions, laneMap, routingMap] = await Promise.all([
    getPool(slug), getCreation(slug), getImpressions(slug, mode), getLaneImpressionMap30d(), getRoutingMap(),
  ]);
  const [intelPending, ambientPressure] = await Promise.all([
    getIntelPending(slug),
    getAmbientRotationPressure(slug, pool.total),
  ]);

  const routing: TypeRouting = routingMap[slug] || {};
  const priorRate = Math.max(0, impressions.last30d - impressions.last7d) / 23;
  const perDay7d = impressions.last7d / 7;
  const trend: 'up' | 'down' | 'flat' = perDay7d > priorRate * 1.15 ? 'up' : perDay7d < priorRate * 0.85 ? 'down' : 'flat';

  const laneTypes = allTypes().filter((t) => !t.system && !t.event && t.home_surface === def.home_surface);
  const laneTotal30d = laneTypes.reduce((sum, t) => sum + (laneMap.get(t.slug) || 0), 0);
  const typeShare30d = laneTotal30d > 0 ? impressions.last30d / laneTotal30d : 0;
  const equalShareBaseline = laneTypes.length > 0 ? 1 / laneTypes.length : 0;

  const base: Omit<TypeStats, 'diagnostics'> = {
    slug, label: def.label, student_label: def.student_label,
    home_surface: def.home_surface, feed_mode: mode,
    pool,
    creation,
    triggered: { allTime: impressions.allTime, last7d: impressions.last7d, last30d: impressions.last30d },
    breadth: { distinctEnrollments: impressions.distinctEnrollments },
    velocity: { perDay7d: round(perDay7d), perDay30d: round(impressions.last30d / 30), trend },
    routing: {
      cadence: routing.feed_cadence ?? null,
      frequencyCap: routing.feed_frequency_cap ?? null,
      cooldownDays: routing.feed_cooldown_days ?? null,
      todayEligible: def.today_eligible,
    },
    lane: { totalImpressions30d: laneTotal30d, typeShare30d: round(typeShare30d, 3), equalShareBaseline: round(equalShareBaseline, 3) },
    generatedAt: new Date().toISOString(),
  };

  return { ...base, diagnostics: buildDiagnostics(base, mode, intelPending, ambientPressure) };
}

// Re-exported so the preview service can share the exact same "global policy"
// type without importing feedConfigService twice under two different names.
export type { FeedPolicy };
export { getFeedPolicy };
