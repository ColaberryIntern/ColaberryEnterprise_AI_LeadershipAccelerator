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
 * HOW A FAILURE EARNS AN ALERT. Three independent gates, each one added because
 * the check without it produced false positives at corpus scale:
 *
 *   1. The classifier must not be looking at a bot challenge. YouTube reuses
 *      LOGIN_REQUIRED and ERROR for "prove you are human", and on 2026-08-22
 *      reading that as an answer turned 146 healthy videos into PRIVATE.
 *   2. The batch's control video — one of ours, known good, probed in the same
 *      burst — must have come back healthy. If YouTube will not answer honestly
 *      about a video we know is fine, nothing else in that burst is evidence.
 *   3. The failure must reproduce in a second, separately controlled observation
 *      after a cooldown. A video that fails once and passes on retry was never
 *      broken.
 *
 * Anything that does not clear all three lands in UNKNOWN, which is reported and
 * never paged on.
 *
 * Failure-first notes:
 *  - What if a probe fails? Capped retry ladder, then UNKNOWN. UNKNOWN never
 *    alerts, so a rate limit cannot page anyone.
 *  - What if YouTube throttles the whole run? The control fails, every batch is
 *    marked untrusted, `untrusted_batches` and `throttled` go up and no failure
 *    is reported. Loud in the logs, silent on the pager.
 *  - What if YouTube changes its markup? `extractPlayerResponse` returns null,
 *    every video degrades to UNKNOWN, and the control degrades with them, so the
 *    run reports itself untrustworthy rather than reporting a dead curriculum.
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
import { ownershipOf, youtubeId, type Ownership, type VideoState } from './videoLinkClassifier';
import {
  BATCH_SIZE,
  CONFIRM_COOLDOWN_MS,
  CONTROL_VIDEO_ID,
  PACE_MS,
  chunk,
  createProber,
  observeBatch,
  sleep,
  type Observation,
} from './videoLinkProbe';
import { assessCard, sealedWeeks, severityFor, type CardImpact, type ImpactCard } from './videoLinkImpact';

const LAST_RUN_KEY = 'curriculum_video_health_last_run';
const SERVICE = 'curriculum-video-health';

export { CONTROL_VIDEO_ID };

export interface VideoFailure {
  video_id: string;
  state: VideoState;
  detail: string;
  remedy: string;
  channel: string | null;
  /** Tri-state on purpose: "we could not tell" is not "not ours". */
  ownership: Ownership;
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
  /** Probes YouTube refused to answer. A measure of us, not of the curriculum. */
  throttled: number;
  /** Batches whose control failed. Nothing in them may be called broken. */
  untrusted_batches: number;
  /** Videos we declined to judge because their batch was untrusted. */
  unverified: number;
  /**
   * Failing videos by owner. Reported as three numbers rather than one
   * "on our channel" count: that count read 0 during the 2026-08-22 dry run and
   * was taken as reassurance, when in fact the owner was unknown for all 149.
   */
  ownership: Record<Ownership, number>;
}

export interface RunOptions {
  /** Re-run within the same Central-time day. */
  force?: boolean;
  /** Probe and report but emit no alerts. */
  dryRun?: boolean;
  /** Minimum gap between outbound probes. Operational tuning; 0 in unit tests. */
  paceMs?: number;
  /** Wait before re-observing suspects. Operational tuning; 0 in unit tests. */
  confirmCooldownMs?: number;
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

/** What one control-bracketed sweep of a video list produced. */
interface SweepTally {
  healthy: Set<string>;
  inconclusive: Set<string>;
  suspects: Observation[];
  throttled: number;
  untrustedBatches: number;
  unverified: number;
}

/**
 * Probe a list of videos in control-bracketed batches and sort the answers into
 * healthy / inconclusive / suspect. Nothing here decides that a video is broken;
 * a suspect is only a candidate for a second look.
 */
async function sweep(
  videoIds: string[],
  prober: ReturnType<typeof createProber>,
  correlationId: string,
  pass: 1 | 2,
): Promise<SweepTally> {
  const tally: SweepTally = {
    healthy: new Set(), inconclusive: new Set(), suspects: [],
    throttled: 0, untrustedBatches: 0, unverified: 0,
  };

  for (const batch of chunk(videoIds, BATCH_SIZE)) {
    const { trusted, observations, control_detail } = await observeBatch(batch, prober);
    tally.throttled += observations.filter((o) => o.challenged).length;

    if (!trusted) {
      // The control is the only thing standing between a throttled run and 149
      // false alerts. When it fails, this batch is not evidence of anything.
      tally.untrustedBatches++;
      tally.unverified += batch.length;
      for (const id of batch) tally.inconclusive.add(id);
      log('warn', 'batch_untrusted', 'partial', {
        correlation_id: correlationId, pass, videos: batch.length,
        control_video: CONTROL_VIDEO_ID, detail: control_detail,
      });
      continue;
    }

    for (const o of observations) {
      if (o.verdict.state === 'HEALTHY') tally.healthy.add(o.video_id);
      else if (!o.verdict.actionable) {
        tally.inconclusive.add(o.video_id);
        log('warn', 'video_inconclusive', 'partial', {
          correlation_id: correlationId, pass, video_id: o.video_id, detail: o.verdict.detail,
        });
      } else tally.suspects.push(o);
    }
  }

  return tally;
}

export async function runVideoLinkHealthCheck(opts: RunOptions = {}): Promise<VideoHealthRunResult> {
  const correlationId = randomUUID();
  const started = Date.now();
  const today = centralDate();
  const paceMs = opts.paceMs ?? PACE_MS;
  const cooldownMs = opts.confirmCooldownMs ?? CONFIRM_COOLDOWN_MS;

  const base: VideoHealthRunResult = {
    ran: false, skipped: false, correlation_id: correlationId,
    checked: 0, healthy: 0, unknown: 0, failures: [], sealed_weeks: [], alerts_emitted: 0,
    throttled: 0, untrusted_batches: 0, unverified: 0,
    ownership: { ours: 0, third_party: 0, unknown: 0 },
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
  log('info', 'run_started', 'success', {
    correlation_id: correlationId, videos: videoIds.length, cards: cards.length,
    pace_ms: paceMs, batch_size: BATCH_SIZE, control_video: CONTROL_VIDEO_ID,
  });

  const prober = createProber(paceMs);

  // Pass 1 finds candidates. It does not convict.
  const first = await sweep(videoIds, prober, correlationId, 1);

  const healthy = new Set(first.healthy);
  const inconclusive = new Set(first.inconclusive);
  let throttled = first.throttled;
  let untrustedBatches = first.untrustedBatches;
  let unverified = first.unverified;
  const confirmed: Observation[] = [];

  // Pass 2 re-observes only the suspects, in their own controlled burst, after a
  // cooldown. A failure that does not reproduce is not a failure.
  if (first.suspects.length) {
    log('info', 'confirmation_started', 'success', {
      correlation_id: correlationId, suspects: first.suspects.length, cooldown_ms: cooldownMs,
    });
    await sleep(cooldownMs);

    const second = await sweep(first.suspects.map((s) => s.video_id), prober, correlationId, 2);
    throttled += second.throttled;
    untrustedBatches += second.untrustedBatches;
    unverified += second.unverified;
    second.healthy.forEach((id) => healthy.add(id));
    second.inconclusive.forEach((id) => inconclusive.add(id));
    confirmed.push(...second.suspects);

    const notReproduced = first.suspects.filter((s) => !second.suspects.some((c) => c.video_id === s.video_id));
    for (const s of notReproduced) {
      log('info', 'suspect_not_reproduced', 'success', {
        correlation_id: correlationId, video_id: s.video_id, first_pass_state: s.verdict.state,
      });
    }
  }

  const failures: VideoFailure[] = [];
  for (const o of confirmed) {
    const impacts = (byVideo.get(o.video_id) ?? []).map((c) =>
      assessCard(c, CANONICAL_PROGRAM_ID, isCompletable(c.type)),
    );
    const seals = impacts.some((i) => i.seals_week);
    const students = await studentsBlockedBy(impacts.filter((i) => i.seals_week).map((i) => i.card_id));

    failures.push({
      video_id: o.video_id, state: o.verdict.state, detail: o.verdict.detail, remedy: o.verdict.remedy,
      channel: o.channel, ownership: ownershipOf(o.channel), cards: impacts,
      students_affected: students, seals_week: seals,
    });
  }

  const ownership: Record<Ownership, number> = { ours: 0, third_party: 0, unknown: 0 };
  for (const f of failures) ownership[f.ownership]++;

  const weeks = sealedWeeks(failures.flatMap((f) => f.cards));
  let alertsEmitted = 0;

  if (!opts.dryRun) {
    for (const f of failures) {
      // Title is stable per video and state so alertService folds repeat
      // occurrences into the one open alert instead of raising a new one daily.
      const scope = f.seals_week
        ? `seals week ${f.cards.filter((c) => c.seals_week).map((c) => c.week).join(', ')} for ${f.students_affected} student(s)`
        : 'no week gate affected';
      const owner =
        f.ownership === 'ours' ? ' (OUR CHANNEL - fixable in our own settings)'
        : f.ownership === 'third_party' ? ' (third party)'
        : ' (owner could not be read)';
      await emitAlert({
        type: f.seals_week ? 'critical' : 'warning',
        severity: severityFor(f.seals_week, f.students_affected),
        title: `Curriculum video ${f.state}: ${f.video_id}`,
        description: `${f.detail}. ${scope}. Owner: ${f.channel ?? 'unknown'}${owner}. ${f.remedy}`,
        sourceType: 'system',
        impactArea: 'curriculum',
        entityType: 'curriculum_video',
        entityId: f.video_id,
        urgency: f.seals_week ? 'high' : 'low',
        metadata: {
          video_id: f.video_id, state: f.state, ownership: f.ownership, channel: f.channel,
          students_affected: f.students_affected, cards: f.cards, correlation_id: correlationId,
          confirmed_observations: 2,
        },
      }).then(() => { alertsEmitted++; }).catch((err: Error) => {
        log('error', 'alert_emit_failed', 'failure', {
          correlation_id: correlationId, video_id: f.video_id, error_class: err.name, message: err.message,
        });
      });
    }
    await setSetting(LAST_RUN_KEY, today);
  }

  const unknown = inconclusive.size;

  log(failures.length || untrustedBatches ? 'warn' : 'info', 'run_finished',
    failures.length || untrustedBatches ? 'partial' : 'success', {
      correlation_id: correlationId, duration_ms: Date.now() - started,
      checked: videoIds.length, healthy: healthy.size, unknown, failures: failures.length,
      sealed_weeks: weeks, throttled, untrusted_batches: untrustedBatches, unverified, ownership,
    });

  return {
    ran: true, skipped: false, correlation_id: correlationId, checked: videoIds.length,
    healthy: healthy.size, unknown, failures, sealed_weeks: weeks, alerts_emitted: alertsEmitted,
    throttled, untrusted_batches: untrustedBatches, unverified, ownership,
  };
}
