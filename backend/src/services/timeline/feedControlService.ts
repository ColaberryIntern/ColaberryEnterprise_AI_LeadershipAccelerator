/**
 * feedControlService — the Feed Control plane's write + read API.
 *
 * Routes curriculum TYPES and individual CARDS to surfaces (Today / class section /
 * community / …) and sets their cadence, frequency, pin, priority, and publish
 * window — the knobs the transparent ranker (feedRanker) + composer consume.
 *
 * Durability note: `typeSeeder` re-asserts a type's home_surface/feed_mode/
 * today_eligible from the CODE registry on every boot, so a raw DB edit to those
 * columns is reverted. Type routing therefore lives in a `SystemSetting` map
 * (`feed_type_routing`) that is applied to the in-memory registry LIVE (on edit)
 * and again at boot AFTER the seed — so it survives restarts. Card-level overrides
 * are plain columns on `timeline_cards` (not touched by any seed).
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { getSetting, setSetting } from '../settingsService';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import TimelineCard from '../../models/TimelineCard';
import Enrollment from '../../models/Enrollment';
import { resolve as resolveType, register, allTypes, type SurfaceId, type FeedMode } from './typeRegistry';
import { SURFACE_ORDER } from './surfaces';
import { getFeedPolicy, setFeedPolicy, type FeedPolicy } from './feedConfigService';
import { rankCandidates, type RankCandidate } from './feedRanker';
import { getFeed } from './timelineService';
import { resolveWeight } from './todayFeedPlan';
import { env } from '../../config/env';
import { rankLearningValue } from '../cape/capeLearningValueRanker';
import type { TodayFeedItem } from './todayFeedComposer';

export { getFeedPolicy, setFeedPolicy, type FeedPolicy } from './feedConfigService';

const ROUTING_KEY = 'feed_type_routing';
const SURFACES: SurfaceId[] = ['today', 'class', 'project', 'community', 'group'];
const BUCKETS = ['pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance'];

export interface TypeRouting {
  home_surface?: SurfaceId;
  feed_mode?: FeedMode;
  today_eligible?: boolean;
  bucket_default?: string;
  feed_cadence?: number | null;
  feed_frequency_cap?: number | null;
  feed_cooldown_days?: number | null;
  /** 1-100 slider value, real (not simulator-only) for types whose live
   *  instances are rotation-eligible — see getBoard()'s `weight_live` and
   *  todayFeedComposer.extendFeed's weighted variety-pool selection. Stored
   *  ONLY in this SystemSetting map (no CurriculumTypeDefinition mirror, no
   *  migration — unlike feed_cadence/feed_frequency_cap/feed_cooldown_days,
   *  which predate this field and already have their own DB columns). */
  feed_weight?: number | null;
}

async function getRoutingMap(): Promise<Record<string, TypeRouting>> {
  const raw = await getSetting(ROUTING_KEY);
  return raw && typeof raw === 'object' ? raw : {};
}

/** Every type's resolved weight (1-100), for types that have one explicitly
 *  set — absent from the map means "use the neutral default" (resolveWeight
 *  handles that at the READ site, e.g. todayFeedComposer, not here) so this
 *  function never has to know which keys will actually be looked up. */
export async function getTypeWeights(): Promise<Map<string, number>> {
  const map = await getRoutingMap();
  const weights = new Map<string, number>();
  for (const slug of Object.keys(map)) {
    const w = map[slug].feed_weight;
    if (w != null) weights.set(slug, resolveWeight(w));
  }
  return weights;
}

/** Apply one type's stored routing onto the in-memory registry (makes it live). */
function applyOne(slug: string, r: TypeRouting): void {
  const def = resolveType(slug);
  if (!def) return;
  register({
    ...def,
    home_surface: (r.home_surface ?? def.home_surface) as SurfaceId,
    feed_mode: (r.feed_mode ?? def.feed_mode) as FeedMode,
    today_eligible: r.today_eligible ?? def.today_eligible,
    bucket: (r.bucket_default ?? def.bucket) as any,
  });
}

/** Boot hook — re-apply all stored type routing to the registry + mirror to the DB
 *  (run AFTER typeSeeder so it wins). Never throws. */
export async function applyFeedRoutingToRegistry(): Promise<number> {
  try {
    const map = await getRoutingMap();
    const slugs = Object.keys(map);
    for (const slug of slugs) {
      applyOne(slug, map[slug]);
      const r = map[slug];
      await CurriculumTypeDefinition.update(
        {
          ...(r.home_surface ? { home_surface: r.home_surface } : {}),
          ...(r.feed_mode ? { feed_mode: r.feed_mode } : {}),
          ...(r.today_eligible != null ? { today_eligible: r.today_eligible } : {}),
          ...(r.bucket_default ? { bucket_default: r.bucket_default } : {}),
          ...(r.feed_cadence !== undefined ? { feed_cadence: r.feed_cadence } : {}),
          ...(r.feed_frequency_cap !== undefined ? { feed_frequency_cap: r.feed_frequency_cap } : {}),
          ...(r.feed_cooldown_days !== undefined ? { feed_cooldown_days: r.feed_cooldown_days } : {}),
        } as any,
        { where: { slug } },
      ).catch(() => {});
    }
    if (slugs.length) console.log(`[FeedControl] applied routing to ${slugs.length} type(s)`);
    return slugs.length;
  } catch (err: any) {
    console.warn('[FeedControl] applyFeedRoutingToRegistry failed:', err?.message);
    return 0;
  }
}

/** Route a TYPE to a surface + set its feed defaults. Durable + live. */
export async function routeType(slug: string, patch: TypeRouting, adminId?: string): Promise<{ slug: string; routing: TypeRouting }> {
  if (!resolveType(slug)) throw Object.assign(new Error(`unknown type ${slug}`), { status: 404 });
  if (patch.home_surface && !SURFACES.includes(patch.home_surface)) throw Object.assign(new Error('bad surface'), { status: 400 });
  if (patch.bucket_default && !BUCKETS.includes(patch.bucket_default)) throw Object.assign(new Error('bad bucket'), { status: 400 });
  // Deliberately a CLAMP, not a reject (unlike home_surface/bucket_default
  // above): feed_weight is a slider-bound numeric range, not an enum — a
  // stray out-of-range value (or a client bug) should land on a valid
  // in-range weight, not 400 the whole request. `null` explicitly clears a
  // set weight back to "unset" (neutral default), distinct from omitting the
  // field (leaves any existing stored value untouched).
  const cleanPatch: TypeRouting = patch.feed_weight === undefined || patch.feed_weight === null
    ? patch
    : { ...patch, feed_weight: resolveWeight(patch.feed_weight) };
  const map = await getRoutingMap();
  const merged: TypeRouting = { ...map[slug], ...cleanPatch };
  map[slug] = merged;
  await setSetting(ROUTING_KEY, map, adminId);
  applyOne(slug, merged); // live
  await CurriculumTypeDefinition.update(
    {
      ...(merged.home_surface ? { home_surface: merged.home_surface } : {}),
      ...(merged.feed_mode ? { feed_mode: merged.feed_mode } : {}),
      ...(merged.today_eligible != null ? { today_eligible: merged.today_eligible } : {}),
      ...(merged.bucket_default ? { bucket_default: merged.bucket_default } : {}),
      ...(merged.feed_cadence !== undefined ? { feed_cadence: merged.feed_cadence } : {}),
      ...(merged.feed_frequency_cap !== undefined ? { feed_frequency_cap: merged.feed_frequency_cap } : {}),
      ...(merged.feed_cooldown_days !== undefined ? { feed_cooldown_days: merged.feed_cooldown_days } : {}),
    } as any,
    { where: { slug } },
  ).catch(() => {});
  return { slug, routing: merged };
}

const CARD_FIELDS = ['feed_surface', 'bucket', 'week', 'priority', 'pinned_until', 'feed_cadence', 'feed_frequency_cap', 'feed_cooldown_days', 'visibility', 'release_date'] as const;
export type CardRoutingPatch = Partial<Record<(typeof CARD_FIELDS)[number], any>>;

/** Route a single CARD (overrides its type default). */
export async function routeCard(cardId: string, patch: CardRoutingPatch, adminId?: string): Promise<{ id: string }> {
  const card = await TimelineCard.findByPk(cardId);
  if (!card) throw Object.assign(new Error('card not found'), { status: 404 });
  const clean: any = {};
  for (const k of CARD_FIELDS) if (k in patch && patch[k] !== undefined) clean[k] = patch[k];
  if (clean.pinned_until) clean.pinned_until = new Date(clean.pinned_until);
  if (clean.release_date) clean.release_date = new Date(clean.release_date);
  await card.update(clean);
  return { id: card.id };
}

/** Bulk route many types (e.g. "put these 10 on Today"). */
export async function bulkRouteTypes(slugs: string[], patch: TypeRouting, adminId?: string): Promise<{ routed: string[] }> {
  const routed: string[] = [];
  for (const slug of slugs) {
    try { await routeType(slug, patch, adminId); routed.push(slug); } catch { /* skip bad slug */ }
  }
  return { routed };
}

/** Community's dynamic, community_posts-backed stream (see
 *  todayAnchoredSources.communityCandidates) always counts as weight-live —
 *  it has no `timeline_cards` rows of its own to detect via the query below. */
const ALWAYS_WEIGHT_LIVE_SLUGS = new Set<string>(['community_discussion']);

/**
 * PER-TYPE (not per-lane — see execution-contract.md Assumption 3 and the
 * `announcement` counterexample plan-audit cycle 1 caught: it's Today-lane
 * but week-bound/one-shot, so a lane-level flag would have wrongly marked it
 * live) — does this type's weight slider actually change real behavior right
 * now? True for the 3 ambient providers, the community dynamic stream, and
 * any type with at least one PUBLISHED evergreen (`week IS NULL`) card —
 * i.e. exactly the types eligible for todayFeedComposer's weighted variety
 * pool. False for everything else (assigned, week-bound curriculum) — the
 * slider is still shown (every non-system type on every lane gets one, per
 * the user's explicit "all 5 lanes" choice), just inert, and the frontend
 * uses this flag to say so honestly instead of implying full control.
 */
async function computeWeightLiveSlugs(ambientSlugs: string[]): Promise<Set<string>> {
  const live = new Set<string>([...ambientSlugs, ...ALWAYS_WEIGHT_LIVE_SLUGS]);
  try {
    const rows = await sequelize.query<{ type: string }>(
      `SELECT DISTINCT type FROM timeline_cards WHERE week IS NULL AND visibility = 'published'`,
      { type: QueryTypes.SELECT },
    );
    for (const r of rows) live.add(r.type);
  } catch (err: any) {
    console.warn('[FeedControl] computeWeightLiveSlugs failed (weight_live will undercount):', err?.message);
  }
  return live;
}

/** The board payload: surfaces + the types grouped under their effective surface + policy. */
export async function getBoard(): Promise<any> {
  const [policy, routing] = await Promise.all([getFeedPolicy(), getRoutingMap()]);
  const ambientSlugs = allTypes().filter((t) => t.feed_mode === 'ambient' && !t.system).map((t) => t.slug);
  const weightLiveSlugs = await computeWeightLiveSlugs(ambientSlugs);
  const lanes = SURFACE_ORDER.map((s) => ({
    surface: s,
    types: allTypes()
      .filter((t) => !t.system && !t.event && t.home_surface === s.id)
      .map((t) => ({
        slug: t.slug, label: t.label, student_label: t.student_label,
        home_surface: t.home_surface, feed_mode: t.feed_mode, today_eligible: t.today_eligible,
        bucket: t.bucket, render_band: t.render_band, difficulty: t.difficulty,
        cadence: routing[t.slug]?.feed_cadence ?? null,
        frequency_cap: routing[t.slug]?.feed_frequency_cap ?? null,
        cooldown_days: routing[t.slug]?.feed_cooldown_days ?? null,
        weight: routing[t.slug]?.feed_weight ?? null,
        weight_live: weightLiveSlugs.has(t.slug),
      })),
  }));
  // feedControlEnabled tells the UI which knobs actually reach students right now.
  // Checkbox (today_eligible) + lane (home_surface) are always live. Weight is
  // live for weight_live:true types when feedControlEnabled is on (confirmed
  // ON in prod). Cadence/frequency-cap/cooldown/priority/exploration remain
  // preview-only (the live composer never reads them) — see todayFeedComposer.
  return { lanes, policy, buckets: BUCKETS, feedControlEnabled: env.feedControlEnabled };
}

/** Uniform shape both ranking paths (legacy feedRanker + CAPE Phase 4) reduce
 * to before the shared ambient-interleave loop below. */
interface SimulatedRankedCard {
  type: string; student_label: string; title: string | null; card_id: string;
  render_band: string; surface: string; week: number | null; thumbnail: string | null;
  score: number; reasons: string[]; components?: Record<string, number>;
}

/** The existing transparent rule-based ranker (unchanged behavior — this is
 * exactly the body `simulate()` had before CAPE Phase 4 T009). */
function rankWithLegacyRanker(anchored: any[], seenByRef: Map<string, any>, policy: FeedPolicy, now: Date): SimulatedRankedCard[] {
  const cands: (RankCandidate & { title: string | null; render_band: string; card_id: string; student_label: string; week: number | null; thumbnail: string | null })[] = anchored.map((c: any) => {
    const s = seenByRef.get(`card:${c.id}`);
    const def = resolveType(c.type);
    return {
      ref: `card:${c.id}`, type: c.type, surface: def?.home_surface ?? 'class', card_id: c.id,
      priority: c.priority ?? 0, pinned_until: c.pinned_until ? new Date(c.pinned_until) : null,
      released_at: c.release_date ? new Date(c.release_date) : (c.created_at ? new Date(c.created_at) : null),
      frequency_cap: c.feed_frequency_cap ?? null, // null → ranker uses policy.defaultFrequencyCap
      cooldown_days: c.feed_cooldown_days ?? null, // null → ranker uses policy.defaultCooldownDays
      seen_count: s?.n ?? 0, last_seen_at: s?.last ? new Date(s.last) : null, dismissed: !!s?.dismissed,
      title: c.title, render_band: c.render_band,
      student_label: c.student_label || c.type, week: c.week ?? null, thumbnail: c.type_thumbnail ?? null,
    };
  });
  return rankCandidates(cands, policy, now).map((r) => ({
    type: r.type, student_label: r.student_label, title: r.title, card_id: r.card_id, render_band: r.render_band,
    surface: r.surface, week: r.week, thumbnail: r.thumbnail, score: Number(r.score.toFixed(3)), reasons: r.reasons,
  }));
}

/** CAPE Phase 4 (design doc §17 AC 9): "Feed Control can simulate a specific
 * learner and explain every inclusion, exclusion, score, and rerank." Builds
 * `TodayFeedItem`-shaped candidates from the same `anchored` list the legacy
 * path uses, runs them through the real `rankLearningValue` pipeline (Stages
 * 1-5), and returns both the ranked items (with their Stage 3 component
 * breakdown) AND the Stage 2 exclusions with reasons — read-only, never
 * writes an impression. */
async function rankWithCapeRanker(enrollmentId: string, anchored: any[], now: Date): Promise<{ ranked: SimulatedRankedCard[]; excluded: Array<{ ref: string; reason: string }> }> {
  const candidates: TodayFeedItem[] = anchored.map((c: any) => {
    const def = resolveType(c.type);
    return {
      position: 0, kind: 'anchored', ref: `card:${c.id}`, surface: def?.home_surface ?? 'class', type: c.type,
      render_band: c.render_band, card_id: c.id, title: c.title, subtitle: null, description: null, image: null,
      video: null, blog: null, content: null, week: c.week ?? null, estimated_time: c.estimated_time ?? null,
      status: c.status ?? null, interacted: false,
    };
  });
  const result = await rankLearningValue(enrollmentId, candidates, now);
  const ranked: SimulatedRankedCard[] = result.items.map((r) => ({
    type: r.type, student_label: (r as any).student_label || r.type, title: r.title, card_id: r.card_id || '',
    render_band: r.render_band, surface: r.surface, week: r.week, thumbnail: null,
    score: Number(r.rank_score.toFixed(3)), reasons: r.reasons, components: r.components,
  }));
  return { ranked, excluded: result.excluded };
}

/**
 * READ-ONLY simulator: what would this student see next in Today, and WHY.
 * Ranks the student's today-eligible anchored cards and interleaves ambient
 * placeholders per the policy cadence. No side effects (never persists
 * impressions) — it mirrors the live composer's inputs.
 *
 * `useCapeRanker` (CAPE Phase 4, T009): when true, OR when
 * `env.capeLearningValueRankerEnabled` is already on, routes ranking through
 * the CAPE learning-value ranker instead of the legacy `feedRanker` — a
 * preview path admins can use to see real CAPE output for a real enrollment
 * even while the global flag stays off in production (this function never
 * writes regardless of which ranker it uses).
 */
export async function simulate(
  enrollmentId: string,
  limit = 12,
  includeTypes?: string[],
  opts: { useCapeRanker?: boolean } = {},
): Promise<{ items: any[]; policy: FeedPolicy; context?: any; sandbox?: boolean; excluded?: Array<{ ref: string; reason: string }>; ranker?: 'legacy' | 'cape' }> {
  const now = new Date();
  const policy = await getFeedPolicy();
  // Sandbox / what-if: when includeTypes is provided (even an empty array), treat ONLY
  // those slugs as active instead of the live today_eligible routing. Never persists.
  const sandbox = Array.isArray(includeTypes);
  const includeSet = sandbox ? new Set(includeTypes) : null;

  // Seen state from the real impression ledger (no writes).
  const seen = await sequelize.query<{ ref: string; n: number; last: Date | null; dismissed: boolean }>(
    `SELECT ref, COUNT(*)::int AS n, MAX(served_at) AS last,
            bool_or(interaction = 'dismiss') AS dismissed
       FROM today_feed_impressions WHERE enrollment_id = :eid GROUP BY ref`,
    { replacements: { eid: enrollmentId }, type: QueryTypes.SELECT },
  ).catch(() => [] as any[]);
  const seenByRef = new Map(seen.map((s) => [s.ref, s]));

  let feed: any;
  try { feed = await getFeed(enrollmentId); } catch { return { items: [], policy }; }
  const anchored = (feed.cards || []).filter((c: any) => {
    const def = resolveType(c.type);
    const active = sandbox ? includeSet!.has(c.type) : def?.today_eligible;
    return active && def?.feed_mode !== 'ambient' && c.status !== 'locked' && c.status !== 'completed';
  });

  const useCape = opts.useCapeRanker === true || env.capeLearningValueRankerEnabled;
  let ranked: SimulatedRankedCard[];
  let excluded: Array<{ ref: string; reason: string }> = [];
  if (useCape) {
    const capeResult = await rankWithCapeRanker(enrollmentId, anchored, now);
    ranked = capeResult.ranked;
    excluded = capeResult.excluded;
  } else {
    ranked = rankWithLegacyRanker(anchored, seenByRef, policy, now);
  }

  // Interleave ambient placeholders on the policy cadence — identical for
  // both ranking paths (Phase 4 reorders the anchored queue only; ambient
  // cadence/interleave is untouched, see execution-contract.md Assumption 3).
  const items: any[] = [];
  const cad = Math.max(1, policy.todayCadence);
  // In sandbox, only rotate the ambient providers the user has actually included.
  const activeProviders = sandbox ? policy.ambientProviders.filter((p) => includeSet!.has(p)) : policy.ambientProviders;
  let sinceAmbient = 0;
  let ai = 0;
  for (const r of ranked) {
    items.push({ kind: 'anchored', type: r.type, student_label: r.student_label, title: r.title, card_id: r.card_id, render_band: r.render_band, surface: r.surface, week: r.week, thumbnail: r.thumbnail, score: r.score, reasons: r.reasons, ...(r.components ? { components: r.components } : {}) });
    sinceAmbient++;
    if (activeProviders.length && sinceAmbient >= cad) {
      const provider = activeProviders[ai % activeProviders.length];
      const pdef = resolveType(provider);
      items.push({ kind: 'ambient', type: provider, student_label: pdef?.student_label || provider, title: `${pdef?.student_label || provider} (rotating)`, surface: 'today', thumbnail: null, reasons: ['rotation · least-recently-seen'] });
      ai++; sinceAmbient = 0;
    }
    if (items.length >= limit) break;
  }

  // Student context — the state that decides WHAT is a candidate in the first place.
  const cards: any[] = feed.cards || [];
  const context = {
    is_explorer: feed.is_explorer === true,
    total_published: cards.length,
    candidates: anchored.length,
    locked: cards.filter((c) => c.status === 'locked').length,
    completed: cards.filter((c) => c.status === 'completed').length,
    already_seen: seen.length,
    max_week: cards.filter((c) => c.status !== 'locked' && c.week != null).reduce((m, c) => Math.max(m, c.week), 0),
  };
  return { items: items.slice(0, limit), policy, context, sandbox, ...(useCape ? { excluded, ranker: 'cape' as const } : { ranker: 'legacy' as const }) };
}

export interface EnrollmentOption { id: string; label: string; cohort_id: string | null; type: string; status: string }

/** Recent enrollments for the simulator dropdown — most recent first, labeled. */
export async function listEnrollments(limit = 60): Promise<EnrollmentOption[]> {
  const rows = await Enrollment.findAll({
    order: [['created_at', 'DESC']],
    limit: Math.max(1, Math.min(200, limit)),
    attributes: ['id', 'full_name', 'email', 'cohort_id', 'enrollment_type', 'status', 'created_at'],
  });
  return rows.map((e: any) => ({
    id: e.id,
    label: `${e.full_name || e.email || e.id.slice(0, 8)}${e.enrollment_type === 'explorer' ? ' · Free' : ''}${e.status && e.status !== 'active' ? ` · ${e.status}` : ''}`,
    cohort_id: e.cohort_id ?? null,
    type: e.enrollment_type || 'standard',
    status: e.status || 'active',
  }));
}

/** Cron worker: publish scheduled cards whose release_date has arrived. Idempotent. */
export async function publishDueCards(): Promise<{ published: number }> {
  const [rows]: any = await sequelize.query(
    `UPDATE timeline_cards SET visibility = 'published', updated_at = NOW()
       WHERE visibility = 'scheduled' AND release_date IS NOT NULL AND release_date <= NOW()
       RETURNING id`,
  );
  const published = Array.isArray(rows) ? rows.length : 0;
  if (published) console.log(`[FeedControl] published ${published} scheduled card(s)`);
  return { published };
}
