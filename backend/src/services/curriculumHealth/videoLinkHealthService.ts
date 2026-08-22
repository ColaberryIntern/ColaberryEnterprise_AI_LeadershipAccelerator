/**
 * videoLinkHealthService — the scheduled curriculum video link check.
 *
 * 141 of the 155 videos the curriculum points at are third-party YouTube links.
 * Any one of them can be made private, deleted, or have embedding disabled at any
 * moment, with nothing changing on our side. Because every week's evaluation card
 * is gated on `section_complete{bucket:learn, scope:week}` — every learn card in
 * the week, no partial credit — a single dead video silently seals that week's
 * whole evaluation -> survey -> reflection chain.
 *
 * On 2026-08-21 we found out because a student wrote in. Two cards had been dead
 * long enough that 0 of 169 students had ever completed one of them. This job
 * turns that class of outage into an alert.
 *
 * Read-only with respect to the curriculum: it never edits, archives or repairs a
 * card. Choosing a replacement video is a curriculum judgement, and a
 * plausible-looking automatic substitution is exactly the kind of thing that
 * survives review and shouldn't.
 *
 * Failure-first notes:
 *  - What if a probe fails? It is retried with capped backoff, then reported
 *    UNKNOWN. UNKNOWN never alerts, so a rate limit cannot page anyone.
 *  - What if YouTube changes its markup? `extractPlayerResponse` returns null,
 *    every video degrades to UNKNOWN, the run reports `unknown` high and alerts
 *    on nothing. Loud in the logs, silent on the pager.
 *  - What if the DB is unreachable? The run throws; instrumentCronJob records the
 *    failure against the agent registry. No partial state is written.
 *  - Not handled: a video that is playable but whose *content* changed. No
 *    automated check can catch that.
 */

import { randomUUID } from 'crypto';
import { sequelize } from '../../config/database';
import { getSetting, setSetting } from '../settingsService';
import { emitAlert } from '../alertService';
import { CANONICAL_PROGRAM_ID } from '../timeline/curriculumScope';
import {
  classify,
  extractPlayerResponse,
  isOurChannel,
  readPlayerResponse,
  youtubeId,
  type PlayerProbe,
  type VideoState,
} from './videoLinkClassifier';
import { assessCard, sealedWeeks, severityFor, type CardImpact, type ImpactCard } from './videoLinkImpact';

const OEMBED = 'https://www.youtube.com/oembed';
const WATCH = 'https://www.youtube.com/watch';
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 4;
const LAST_RUN_KEY = 'curriculum_video_health_last_run';
const SERVICE = 'curriculum-video-health';

/** A desktop UA: the watch page serves a different shell to unknown clients. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

export interface VideoFailure {
  video_id: string;
  state: VideoState;
  detail: string;
  remedy: string;
  channel: string | null;
  ours: boolean;
  cards: CardImpact[];
  students_affected: number;
  seals_week: boolean;
}

export interface VideoHealthRunResult {
  ran: boolean;
  skipped: boolean;
  reason?: string;
  correlation_id: string;
  checked: number;
  healthy: number;
  unknown: number;
  failures: VideoFailure[];
  sealed_weeks: number[];
  alerts_emitted: number;
}

export interface RunOptions {
  /** Re-run within the same Central-time day. */
  force?: boolean;
  /** Probe and report but emit no alerts. */
  dryRun?: boolean;
}

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {},
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: SERVICE, event, outcome, ...context }) + '\n',
  );
}

/** Central-time calendar date, the unit the idempotency guard is keyed on. */
export function centralDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function fetchStatus(url: string): Promise<number | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': UA } });
      // 4xx here are meaningful verdicts, not transport failures: return them.
      return res.status;
    } catch {
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt);
    }
  }
  return null;
}

async function probePlayer(videoId: string): Promise<PlayerProbe> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${WATCH}?v=${encodeURIComponent(videoId)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1' },
      });
      if (res.status !== 200) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(1500 * attempt);
          continue;
        }
        return { reachable: false, note: `watch page HTTP ${res.status}` };
      }
      const probe = readPlayerResponse(extractPlayerResponse(await res.text()));
      if (!probe.reachable && attempt < MAX_ATTEMPTS) {
        await sleep(1500 * attempt);
        continue;
      }
      return probe;
    } catch (err) {
      const e = err as Error;
      if (attempt < MAX_ATTEMPTS) await sleep(1500 * attempt);
      else return { reachable: false, note: e.name === 'TimeoutError' ? 'TimeoutError' : e.name };
    }
  }
  return { reachable: false, note: 'exhausted attempts' };
}

/** Both independent methods for one video. Exported for the CLI audit. */
export async function probeVideo(videoId: string): Promise<{ oembed: number | null; player: PlayerProbe }> {
  const oembed = await fetchStatus(`${OEMBED}?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
  const player = await probePlayer(videoId);
  return { oembed, player };
}

/** Does a channel we recorded as the owner still resolve? Discriminates
 *  UPLOADER_CLOSED from a plain REMOVED, whose video URLs both 404. */
async function channelGone(channelId: string | null): Promise<boolean> {
  if (!channelId) return false;
  const status = await fetchStatus(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}`);
  return status === 404;
}

async function loadVideoCards(): Promise<ImpactCard[]> {
  // Keyed on the presence of a video URL rather than on type='video': several
  // types (ai_video_stream, live_class, testimonial, podcast) carry the same
  // metadata.video.url and break identically.
  //
  // Deliberately reads ONLY metadata->'video'->>'url'. Scanning the whole
  // metadata blob also matches metadata.replaced_video.previous_url, which is a
  // tombstone recording a link we have already retired. On 2026-08-21 a
  // whole-blob sweep did exactly that, found the retired id dead, and archived a
  // healthy Week 3 card, sealing the week it was trying to protect.
  const [rows] = await sequelize.query(`
    SELECT id, title, week, bucket, type, visibility, status, cohort_id, program_id,
           metadata->'video'->>'url' AS video_url
    FROM timeline_cards
    WHERE metadata->'video'->>'url' IS NOT NULL
  `);
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    week: r.week === null || r.week === undefined ? null : Number(r.week),
    bucket: (r.bucket as string) ?? null,
    type: (r.type as string) ?? null,
    visibility: (r.visibility as string) ?? null,
    status: (r.status as string) ?? null,
    cohort_id: (r.cohort_id as string) ?? null,
    program_id: (r.program_id as string) ?? null,
    video_id: youtubeId(r.video_url as string),
  }));
}

async function studentsBlockedBy(cardIds: string[]): Promise<number> {
  if (!cardIds.length) return 0;
  const [rows] = await sequelize.query(
    `SELECT count(DISTINCT p.enrollment_id)::int AS affected
       FROM timeline_card_progress p
       JOIN enrollments e ON e.id = p.enrollment_id
      WHERE p.card_id IN (:cardIds)
        AND e.status = 'active'
        AND p.status <> 'completed'`,
    { replacements: { cardIds } },
  );
  return Number((rows as { affected: number }[])[0]?.affected ?? 0);
}

/** Resolved lazily so a registry problem cannot stop the health check. */
async function completableResolver(): Promise<(type: string | null) => boolean> {
  try {
    const { isCompletableType } = await import('../timeline/timelineGatingService');
    return (type) => (type ? isCompletableType(type) : true);
  } catch {
    return () => true; // fail open, matching the gating engine's own default
  }
}

export async function runVideoLinkHealthCheck(opts: RunOptions = {}): Promise<VideoHealthRunResult> {
  const correlationId = randomUUID();
  const started = Date.now();
  const today = centralDate();

  const base: VideoHealthRunResult = {
    ran: false, skipped: false, correlation_id: correlationId,
    checked: 0, healthy: 0, unknown: 0, failures: [], sealed_weeks: [], alerts_emitted: 0,
  };

  // Idempotency: one run per Central-time date. A re-fired cron, a container
  // restart or a manual invocation on the same day is a no-op rather than a
  // second round of alerts.
  if (!opts.force) {
    const last = await getSetting(LAST_RUN_KEY);
    if (last === today) {
      log('info', 'run_skipped', 'success', { correlation_id: correlationId, reason: 'already_ran_today', date: today });
      return { ...base, skipped: true, reason: 'already_ran_today' };
    }
  }

  const cards = await loadVideoCards();
  const isCompletable = await completableResolver();

  const byVideo = new Map<string, ImpactCard[]>();
  for (const c of cards) {
    if (!c.video_id) continue; // non-YouTube URL: skipped, never guessed at
    const list = byVideo.get(c.video_id) ?? [];
    list.push(c);
    byVideo.set(c.video_id, list);
  }

  const videoIds = Array.from(byVideo.keys());
  log('info', 'run_started', 'success', { correlation_id: correlationId, videos: videoIds.length, cards: cards.length });

  const failures: VideoFailure[] = [];
  let healthy = 0;
  let unknown = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < videoIds.length) {
      const videoId = videoIds[cursor++];
      const { oembed, player } = await probeVideo(videoId);
      let verdict = classify(oembed, player);

      if (verdict.state === 'REMOVED') {
        const gone = await channelGone(player.channelId ?? null);
        if (gone) verdict = classify(oembed, player, true);
      }

      if (verdict.state === 'HEALTHY') { healthy++; continue; }
      if (!verdict.actionable) {
        unknown++;
        log('warn', 'video_inconclusive', 'partial', { correlation_id: correlationId, video_id: videoId, detail: verdict.detail });
        continue;
      }

      const impacts = (byVideo.get(videoId) ?? []).map((c) =>
        assessCard(c, CANONICAL_PROGRAM_ID, isCompletable(c.type)),
      );
      const seals = impacts.some((i) => i.seals_week);
      const students = await studentsBlockedBy(impacts.filter((i) => i.seals_week).map((i) => i.card_id));

      failures.push({
        video_id: videoId, state: verdict.state, detail: verdict.detail, remedy: verdict.remedy,
        channel: player.owner ?? null, ours: isOurChannel(player.owner), cards: impacts,
        students_affected: students, seals_week: seals,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, videoIds.length) }, worker));

  const weeks = sealedWeeks(failures.flatMap((f) => f.cards));
  let alertsEmitted = 0;

  if (!opts.dryRun) {
    for (const f of failures) {
      // Title is stable per video and state so alertService folds repeat
      // occurrences into the one open alert instead of raising a new one daily.
      const scope = f.seals_week
        ? `seals week ${f.cards.filter((c) => c.seals_week).map((c) => c.week).join(', ')} for ${f.students_affected} student(s)`
        : 'no week gate affected';
      await emitAlert({
        type: f.seals_week ? 'critical' : 'warning',
        severity: severityFor(f.seals_week, f.students_affected),
        title: `Curriculum video ${f.state}: ${f.video_id}`,
        description: `${f.detail}. ${scope}. Owner: ${f.channel ?? 'unknown'}${f.ours ? ' (OUR CHANNEL - fixable in our own settings)' : ' (third party)'}. ${f.remedy}`,
        sourceType: 'system',
        impactArea: 'curriculum',
        entityType: 'curriculum_video',
        entityId: f.video_id,
        urgency: f.seals_week ? 'high' : 'low',
        metadata: {
          video_id: f.video_id, state: f.state, ours: f.ours, channel: f.channel,
          students_affected: f.students_affected, cards: f.cards, correlation_id: correlationId,
        },
      }).then(() => { alertsEmitted++; }).catch((err: Error) => {
        log('error', 'alert_emit_failed', 'failure', {
          correlation_id: correlationId, video_id: f.video_id, error_class: err.name, message: err.message,
        });
      });
    }
    await setSetting(LAST_RUN_KEY, today);
  }

  log(failures.length ? 'warn' : 'info', 'run_finished', failures.length ? 'partial' : 'success', {
    correlation_id: correlationId, duration_ms: Date.now() - started,
    checked: videoIds.length, healthy, unknown, failures: failures.length, sealed_weeks: weeks,
  });

  return {
    ran: true, skipped: false, correlation_id: correlationId, checked: videoIds.length,
    healthy, unknown, failures, sealed_weeks: weeks, alerts_emitted: alertsEmitted,
  };
}
