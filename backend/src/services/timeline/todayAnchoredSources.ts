/**
 * todayAnchoredSources — gathers the ANCHORED candidates for the Today feed from
 * every surface and blends them: Class curriculum (getFeed), the student's
 * Project tasks (persisted StudentTask), and Community posts (community_posts).
 * The composer (todayFeedComposer) consumes the blended list and interleaves
 * ambient content around it.
 *
 * The one-way valve: these are the surfaces that flow INTO Today. Project +
 * Community are gated behind env.todayAggregateSources (default OFF) so the live
 * feed stays Class-only until enabled. Each source is fail-soft (errors → []),
 * so one surface can never break the feed.
 */
import { getFeed, type FeedCard, type FeedVideo } from './timelineService';
import { surfaceOf, isAmbient, isTodayEligible } from './surfaces';
import { anchoredWeekAllowed, weekStartedForToday, isWeekGated, interleaveByType } from './todayFeedPlan';
import { resolve as resolveType } from './typeRegistry';
import { blendSurfaces } from './todayAnchoredBlend';
import { getActiveProjectTree } from '../projects/projectReadService';
import CommunityPost from '../../models/CommunityPost';
import CommunityMember from '../../models/CommunityMember';
import LiveSession from '../../models/LiveSession';
import AttendanceRecord from '../../models/AttendanceRecord';
import { resolveCohortId } from '../communityService';
import { env } from '../../config/env';
import type { TodayFeedItem } from './todayFeedComposer';

const CANDIDATE_CAP = 20;

/** Class curriculum card → a Today feed item (position assigned later by the composer). */
export function anchoredItemFromCard(fc: FeedCard): TodayFeedItem {
  return {
    position: 0,
    kind: 'anchored',
    ref: `card:${fc.id}`,
    surface: surfaceOf(fc.type) ?? 'class',
    type: fc.type,
    render_band: fc.render_band,
    card_id: fc.id,
    title: fc.title ?? null,
    subtitle: fc.subtitle ?? null,
    description: fc.description ?? null,
    image: fc.image ?? fc.type_thumbnail ?? null,
    video: fc.video ?? null,
    blog: fc.blog ?? null,
    content: fc.content ?? null,
    week: fc.week ?? null,
    estimated_time: fc.estimated_time ?? null,
    status: fc.status ?? null,
    points: (fc as any).points ?? null,
    interacted: false,
  };
}

function projectItem(t: { id: string; title: string | null; description: string | null; status: string; release_key: string | null }): TodayFeedItem {
  return {
    position: 0,
    kind: 'anchored',
    ref: `project:${t.id}`,
    surface: 'project',
    type: 'project_task',
    render_band: resolveType('project_task')?.render_band ?? 'task',
    card_id: null,
    title: t.title ?? null,
    subtitle: t.release_key ?? null,
    description: t.description ?? null,
    image: null,
    video: null,
    blog: null,
    content: null,
    week: null,
    estimated_time: null,
    status: t.status === 'complete' ? 'completed' : t.status === 'in_progress' ? 'in_progress' : 'available',
    interacted: false,
  };
}

// A community post's media lives in media_urls (JSONB). Carry it into the Today card
// the same way the Community feed renders it: a YouTube/video link becomes a playable
// video (TimelineCard derives the thumbnail + play from the url), otherwise the first
// image is the poster. Without this the timeline card falls back to the blank band tile.
const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{11}/i;
const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i;

function communityMedia(mediaUrls: unknown): { video: FeedVideo | null; image: string | null } {
  const urls = Array.isArray(mediaUrls) ? (mediaUrls.filter((u) => typeof u === 'string' && u.trim()) as string[]) : [];
  if (!urls.length) return { video: null, image: null };
  const vid = urls.find((u) => YT_RE.test(u) || VIDEO_EXT_RE.test(u));
  if (vid) return { video: { url: vid, presenter: null, poster: null }, image: null };
  return { video: null, image: urls[0] };
}

type CommunityPostFields = {
  id?: string; body: string; media_urls?: unknown;
  member?: { display_name?: string | null; avatar_url?: string | null; level?: number | null } | null;
};

// The DYNAMIC fields of a community card — derived from the LIVE post. Shared by
// compose-time (communityItem) and serve-time (rehydrateCommunityItems) so media,
// author, and text always reflect the current post, never a stale snapshot.
export function communityFieldsFromPost(p: CommunityPostFields): Pick<TodayFeedItem, 'title' | 'description' | 'image' | 'video' | 'author'> {
  const body = (p.body || '').trim();
  const title = body.length > 80 ? `${body.slice(0, 77)}…` : body;
  const { video, image } = communityMedia(p.media_urls);
  const author = p.member
    ? { name: p.member.display_name || 'Member', avatar_url: p.member.avatar_url ?? null, level: p.member.level ?? 1 }
    : null;
  return { title: title || 'Community post', description: body || null, image, video, author };
}

function communityItem(p: CommunityPostFields & { id: string }): TodayFeedItem {
  const f = communityFieldsFromPost(p);
  return {
    position: 0,
    kind: 'anchored',
    ref: `community:${p.id}`,
    surface: 'community',
    type: 'community_discussion',
    render_band: resolveType('community_discussion')?.render_band ?? 'community',
    card_id: null,
    title: f.title,
    subtitle: null,
    description: f.description,
    image: f.image,
    video: f.video,
    blog: null,
    content: null,
    week: null,
    estimated_time: null,
    status: null,
    interacted: false,
    author: f.author,
  };
}

/**
 * Serve-time re-hydration: refresh placed community cards from the LIVE post so a
 * new or edited post's media/author/text never shows stale from the frozen
 * impression snapshot (see reference_today_feed_append_only_snapshot). One batched
 * query, only when community items are present. Fail-soft — on error the snapshot
 * is left untouched. Mutates `items` in place.
 */
export async function rehydrateCommunityItems(items: TodayFeedItem[]): Promise<void> {
  const community = items.filter((i) => typeof i.ref === 'string' && i.ref.startsWith('community:'));
  if (!community.length) return;
  try {
    const ids = Array.from(new Set(community.map((i) => i.ref.slice('community:'.length))));
    const posts = await CommunityPost.findAll({
      where: { id: ids },
      include: [{ model: CommunityMember, as: 'member', attributes: ['display_name', 'avatar_url', 'level'] }],
    });
    const byId = new Map(posts.map((p) => { const plain = p.get({ plain: true }) as any; return [plain.id as string, plain]; }));
    for (const it of community) {
      const post = byId.get(it.ref.slice('community:'.length));
      if (!post) continue;
      const f = communityFieldsFromPost(post);
      it.title = f.title; it.description = f.description; it.image = f.image; it.video = f.video; it.author = f.author;
    }
  } catch (err: any) {
    console.warn('[todayAnchoredSources] community rehydrate failed:', err?.message?.split('\n')[0]);
  }
}

// ─── Live-session replay ("You missed it") ──────────────────────────────
// A completed session the student didn't attend surfaces as a replay card:
// inline recording + AI recap. Both the recording_url and recap_json.summary
// are admin-set / async-generated and may arrive AFTER the card is frozen into
// the append-only impression snapshot, so the DYNAMIC fields (video + summary)
// live in one shared deriver used at both compose-time (sessionReplayItem) and
// serve-time (rehydrateSessionItems) — the same split as communityFieldsFromPost.

type SessionReplayFields = {
  id: string;
  title: string | null;
  recording_url?: string | null;
  recap_json?: { summary?: string | null } | null;
};

// The fields that can change after the card is placed: the recording becomes
// available and the recap is generated. Everything else on the card is static.
export function sessionFieldsFromRow(s: Pick<SessionReplayFields, 'recording_url' | 'recap_json'>): Pick<TodayFeedItem, 'description' | 'video'> {
  const summary = typeof s.recap_json?.summary === 'string' ? s.recap_json.summary.trim() : '';
  return {
    description: summary || 'Recap coming soon.',
    video: s.recording_url ? { url: s.recording_url, presenter: null, poster: null } : null,
  };
}

/** Completed LiveSession the student missed → a Today feed replay item. Pure. */
export function sessionReplayItem(session: SessionReplayFields): TodayFeedItem {
  const dyn = sessionFieldsFromRow(session);
  return {
    position: 0,
    kind: 'anchored',
    ref: `session:${session.id}`,
    // live_class is registered under the 'group' (Group / Live) surface; fall
    // back to 'group' if the registry ever drops it.
    surface: surfaceOf('live_class') ?? 'group',
    type: 'live_class',
    render_band: 'live_class',
    card_id: null,
    title: `You missed it — ${session.title ?? 'Live class'}`,
    subtitle: 'Live class recap',
    description: dyn.description,
    image: null,
    video: dyn.video,
    blog: null,
    content: null,
    week: null,
    estimated_time: null,
    status: 'available',
    interacted: false,
    author: null,
  };
}

/**
 * Serve-time re-hydration of placed session cards — heals a "You missed it"
 * card that was frozen into the impression snapshot BEFORE the recording was
 * uploaded or the recap generated. Batched, only when session items are present.
 * Fail-soft — on error the snapshot is left untouched. Mutates `items` in place.
 */
export async function rehydrateSessionItems(items: TodayFeedItem[]): Promise<void> {
  const sessions = items.filter((i) => typeof i.ref === 'string' && i.ref.startsWith('session:'));
  if (!sessions.length) return;
  try {
    const ids = Array.from(new Set(sessions.map((i) => i.ref.slice('session:'.length))));
    const rows = await LiveSession.findAll({ where: { id: ids }, attributes: ['id', 'recording_url', 'recap_json'] });
    const byId = new Map(rows.map((r) => { const plain = r.get({ plain: true }) as any; return [plain.id as string, plain]; }));
    for (const it of sessions) {
      const row = byId.get(it.ref.slice('session:'.length));
      if (!row) continue;
      const dyn = sessionFieldsFromRow(row);
      it.video = dyn.video; it.description = dyn.description;
    }
  } catch (err: any) {
    console.warn('[todayAnchoredSources] session rehydrate failed:', err?.message?.split('\n')[0]);
  }
}

async function classCandidates(enrollmentId: string, placedRefs: Set<string>): Promise<TodayFeedItem[]> {
  try {
    const feed = await getFeed(enrollmentId);
    const isExplorer = feed.is_explorer === true; // free tier — Week 0 curriculum only
    // TODAY-ONLY: a week's cards only appear on Today once the student has
    // started that week (see weekStartedForToday's docstring) — Classroom is
    // completely unaffected (it never reads this flag or calls this function).
    const weekStartGateOn = env.timelineWeekStartGateEnabled;
    const eligible = feed.cards
      .filter((c) => {
        if (!isTodayEligible(c.type) || isAmbient(c.type)) return false;
        if (c.status === 'locked' || c.status === 'completed') return false;
        if (placedRefs.has(`card:${c.id}`)) return false;
        // The week gate governs any card tied to a real curriculum week,
        // regardless of surface — REGRESSION (2026-08-03): this used to be
        // scoped to `surfaceOf(c.type) === 'class'`, but `announcement` (and
        // `implementation_task`/`artifact_submission`, `community_discussion`
        // in some cases) are registered under other home surfaces
        // (`home_surface: 'today'`/`'project'`/`'community'`) despite
        // carrying a real `week` — so the gate silently never ran for them at
        // all, regardless of what the gate functions themselves did. Today-
        // homed EVERGREEN content (news / tools / quotes) has `week: null`
        // and must never be week-gated, or free users see none of it
        // (null !== 0) — that's what this guard actually protects, not surface.
        if (isWeekGated(c.week) && !anchoredWeekAllowed(c.week, isExplorer)) return false;
        if (weekStartGateOn && isWeekGated(c.week) && !weekStartedForToday(c, feed.cards)) return false;
        return true;
      })
      .map(anchoredItemFromCard);
    // Real curriculum (week-bound) keeps its existing order untouched; only the
    // evergreen (week:null) tail gets type-diversified — otherwise a high-volume
    // generator (e.g. daily AI News Flash) drowns out a small curated sibling
    // (e.g. AI Quote of the Day) just by having accumulated more rows over time.
    const weekBound = eligible.filter((i) => i.week != null);
    const evergreen = interleaveByType(eligible.filter((i) => i.week == null), (i) => i.type);
    return [...weekBound, ...evergreen];
  } catch (err: any) {
    console.warn('[todayAnchoredSources] class failed:', err?.message?.split('\n')[0]);
    return [];
  }
}

async function projectCandidates(enrollmentId: string, placedRefs: Set<string>): Promise<TodayFeedItem[]> {
  try {
    const tree = await getActiveProjectTree(enrollmentId);
    if (!tree) return [];
    return tree.lists
      .flatMap((l) => l.tasks)
      .filter((t) => t.status !== 'complete' && !placedRefs.has(`project:${t.id}`))
      .slice(0, CANDIDATE_CAP)
      .map(projectItem);
  } catch (err: any) {
    console.warn('[todayAnchoredSources] project failed:', err?.message?.split('\n')[0]);
    return [];
  }
}

async function communityCandidates(enrollmentId: string, placedRefs: Set<string>): Promise<TodayFeedItem[]> {
  try {
    const cohortId = await resolveCohortId(enrollmentId);
    const posts = await CommunityPost.findAll({
      where: { cohort_id: cohortId, status: 'visible' },
      include: [{ model: CommunityMember, as: 'member', attributes: ['display_name', 'avatar_url', 'level'] }],
      order: [['created_at', 'DESC']],
      limit: CANDIDATE_CAP,
    });
    return posts
      .map((p) => p.get({ plain: true }) as any)
      .filter((p: any) => !placedRefs.has(`community:${p.id}`))
      .map((p: any) => communityItem(p));
  } catch (err: any) {
    console.warn('[todayAnchoredSources] community failed:', err?.message?.split('\n')[0]);
    return [];
  }
}

async function missedSessionCandidates(enrollmentId: string, placedRefs: Set<string>): Promise<TodayFeedItem[]> {
  try {
    const cohortId = await resolveCohortId(enrollmentId);
    // Completed sessions for the cohort, most-recent first (session_number DESC).
    const sessions = await LiveSession.findAll({
      where: { cohort_id: cohortId, status: 'completed' },
      order: [['session_number', 'DESC']],
    });
    if (!sessions.length) return [];
    // Two-step "LEFT JOIN": load the student's attendance for those sessions.
    // Attended = a row with status present|late|excused. Absentee = NO row OR
    // status='absent' → those are the ones they "missed".
    const sessionIds = sessions.map((s) => s.id);
    const attendance = await AttendanceRecord.findAll({
      where: { enrollment_id: enrollmentId, session_id: sessionIds },
      attributes: ['session_id', 'status'],
    });
    const attendedSessionIds = new Set(
      (attendance as any[]).filter((a) => a.status !== 'absent').map((a) => a.session_id),
    );
    return sessions
      .filter((s) => !attendedSessionIds.has(s.id) && !placedRefs.has(`session:${s.id}`))
      .slice(0, 3)
      .map((s) => sessionReplayItem(s.get({ plain: true }) as any));
  } catch (err: any) {
    console.warn('[todayAnchoredSources] missed session failed:', err?.message?.split('\n')[0]);
    return [];
  }
}

/**
 * The blended anchored queue for the Today feed. Class-only unless
 * env.todayAggregateSources is on, in which case Project + Community are blended
 * in round-robin. Items carry position 0; the composer assigns real positions.
 */
export async function gatherAnchored(enrollmentId: string, placedRefs: Set<string>): Promise<TodayFeedItem[]> {
  const cls = await classCandidates(enrollmentId, placedRefs);
  // Each extra surface is gated by its own flag; when all are off this returns
  // the class-only queue unchanged (flag-off ≡ byte-identical to before).
  const extras: TodayFeedItem[][] = [];
  if (env.todayAggregateSources) {
    const [project, community] = await Promise.all([
      projectCandidates(enrollmentId, placedRefs),
      communityCandidates(enrollmentId, placedRefs),
    ]);
    extras.push(project, community);
  }
  if (env.todaySessionReplays) {
    extras.push(await missedSessionCandidates(enrollmentId, placedRefs));
  }
  if (!extras.length) return cls;
  return blendSurfaces([cls, ...extras]);
}
