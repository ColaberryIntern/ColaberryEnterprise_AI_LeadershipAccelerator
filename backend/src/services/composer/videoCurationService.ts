/**
 * videoCurationService — turns coverage gaps into a budget-packed set of curated
 * short videos, one per gap. The ranking + packing are PURE and deterministic
 * (injectable search dep, stable tiebreaks) so they are fully testable without
 * network. The real search is youtubeClient.searchShortVideos; tests inject a
 * fake. Budget-aware: fills highest-priority gaps first (blueprint order), stops
 * at the time budget, and records every gap it leaves unfilled (no silent drop).
 */
import { CoverageGap } from './coverageGapEngine';
import { VideoCandidate, SearchOptions, searchShortVideos } from './youtubeClient';

export interface CuratedVideo extends VideoCandidate {
  competency: string;        // canonical gap id this video fills
  competency_label: string;  // human label
}

export interface Unfilled { competency: string; label: string; reason: 'no_candidates' | 'budget' | 'search_error' }

export interface CurationResult {
  videos: CuratedVideo[];
  filled: string[];          // competencies now covered by a curated video
  unfilled: Unfilled[];
  budget_minutes: number;
  used_minutes: number;
  notes: string[];           // human log — why anything was dropped
  source: 'youtube' | 'none';
}

export interface CurationOptions {
  topic?: string;            // blueprint title/topic, sharpens the query
  budgetMinutes?: number;    // default 75
  minSeconds?: number;       // default 180
  maxSeconds?: number;       // default 600
}

export interface CurationDeps {
  search: (query: string, opts?: SearchOptions) => Promise<VideoCandidate[]>;
}

const TARGET_SECONDS = 360; // ~6 min — the sweet spot we bias ranking toward

/** PURE — rank candidates for a gap by title relevance, popularity, duration fit. */
export function rankCandidates(cands: VideoCandidate[], gapLabel: string): VideoCandidate[] {
  const words = gapLabel.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const maxViews = Math.max(1, ...cands.map((c) => c.view_count));
  const score = (c: VideoCandidate): number => {
    const t = c.title.toLowerCase();
    const relevance = words.length ? words.filter((w) => t.includes(w)).length / words.length : 0;
    const views = Math.log10(c.view_count + 1) / Math.log10(maxViews + 1);
    const fit = Math.max(0, 1 - Math.abs(c.duration_seconds - TARGET_SECONDS) / TARGET_SECONDS);
    return relevance * 0.5 + views * 0.3 + fit * 0.2;
  };
  return [...cands].sort((a, b) =>
    score(b) - score(a) || b.view_count - a.view_count || a.video_id.localeCompare(b.video_id));
}

/**
 * Curate one video per gap, packed within the time budget. Never throws — a
 * per-gap search failure degrades to that gap being left unfilled with a note.
 */
export async function curateVideosForGaps(
  gaps: CoverageGap[],
  opts: CurationOptions = {},
  deps: CurationDeps = { search: searchShortVideos },
): Promise<CurationResult> {
  const budgetMinutes = opts.budgetMinutes ?? 75;
  const topic = (opts.topic || '').trim();
  const budgetSeconds = budgetMinutes * 60;

  const videos: CuratedVideo[] = [];
  const unfilled: Unfilled[] = [];
  const notes: string[] = [];
  let usedSeconds = 0;
  let gotAny = false;

  for (const gap of gaps) {
    const query = (topic ? `${topic} ${gap.label}` : `${gap.label}`) + ' tutorial explained';
    let candidates: VideoCandidate[] = [];
    try {
      candidates = await deps.search(query, { minSeconds: opts.minSeconds, maxSeconds: opts.maxSeconds });
    } catch (e: any) {
      notes.push(`Search failed for "${gap.label}": ${e?.message || 'error'}.`);
      unfilled.push({ competency: gap.competency, label: gap.label, reason: 'search_error' });
      continue;
    }
    if (candidates.length) gotAny = true;
    if (!candidates.length) {
      unfilled.push({ competency: gap.competency, label: gap.label, reason: 'no_candidates' });
      continue;
    }
    const best = rankCandidates(candidates, gap.label)[0];
    if (usedSeconds + best.duration_seconds > budgetSeconds) {
      unfilled.push({ competency: gap.competency, label: gap.label, reason: 'budget' });
      notes.push(`Left "${gap.label}" unfilled — a ${best.duration_label} video exceeds the remaining ${Math.round((budgetSeconds - usedSeconds) / 60)} min of budget.`);
      continue;
    }
    usedSeconds += best.duration_seconds;
    videos.push({ ...best, competency: gap.competency, competency_label: gap.label });
  }

  const source: CurationResult['source'] = gotAny ? 'youtube' : 'none';
  if (!gotAny && gaps.length) notes.unshift('No video candidates returned — verify YOUTUBE_API_KEY and connectivity.');

  return {
    videos,
    filled: videos.map((v) => v.competency),
    unfilled,
    budget_minutes: budgetMinutes,
    used_minutes: Math.round((usedSeconds / 60) * 10) / 10,
    notes,
    source,
  };
}

export interface TopicPackResult {
  videos: CuratedVideo[];
  used_minutes: number;
  count: number;
  notes: string[];
  source: 'youtube' | 'none';
}

/**
 * Curate a THEMED pack of short videos (e.g. Week 0's "latest in AI") — NOT
 * gap-based. Searches each theme, de-dupes by video id across themes, and
 * collects up to `count` videos (optionally within a time budget). Every video
 * is tagged with one shared competency so it still counts toward coverage. Pure
 * ranking/dedup; injectable search for testing.
 */
export async function curateTopicPack(
  themes: string[],
  competency: string,
  competencyLabel: string,
  opts: { count?: number; budgetMinutes?: number; minSeconds?: number; maxSeconds?: number } = {},
  deps: CurationDeps = { search: searchShortVideos },
): Promise<TopicPackResult> {
  const count = opts.count ?? 35;
  const budgetSeconds = (opts.budgetMinutes ?? 0) * 60; // 0 ⇒ no time cap (count is the cap)
  const seen = new Set<string>();
  const collected: CuratedVideo[] = [];
  const notes: string[] = [];
  let usedSeconds = 0;
  let gotAny = false;

  for (const theme of themes) {
    if (collected.length >= count) break;
    let cands: VideoCandidate[] = [];
    try { cands = await deps.search(theme, { minSeconds: opts.minSeconds, maxSeconds: opts.maxSeconds }); }
    catch (e: any) { notes.push(`Search failed for "${theme}": ${e?.message || 'error'}.`); continue; }
    if (cands.length) gotAny = true;
    for (const c of rankCandidates(cands, theme)) {
      if (collected.length >= count) break;
      if (seen.has(c.video_id)) continue;
      if (budgetSeconds > 0 && usedSeconds + c.duration_seconds > budgetSeconds) continue;
      seen.add(c.video_id);
      usedSeconds += c.duration_seconds;
      collected.push({ ...c, competency, competency_label: competencyLabel });
    }
  }
  if (!gotAny) notes.unshift('No video candidates returned — verify YOUTUBE_API_KEY and connectivity.');
  return {
    videos: collected,
    used_minutes: Math.round((usedSeconds / 60) * 10) / 10,
    count: collected.length,
    notes,
    source: gotAny ? 'youtube' : 'none',
  };
}

/** Map a curated video to a draft PlanCard payload — tagged with the exact
 *  competency it fills so coverage moves for a real reason. */
export function curatedVideoToCard(v: CuratedVideo, week: number | null) {
  return {
    type: 'video',
    title: v.title,
    subtitle: v.channel || null,
    bucket: 'learn',
    week,
    difficulty: 'intro' as const,
    estimated_time: Math.round(v.duration_seconds / 60),
    points: { learning: 15, builder: 0, community: 0 },
    competencies: [v.competency],
    video_url: v.url,
    rationale: `Fills the "${v.competency_label}" coverage gap (${v.duration_label}, ${v.channel}).`,
  };
}
