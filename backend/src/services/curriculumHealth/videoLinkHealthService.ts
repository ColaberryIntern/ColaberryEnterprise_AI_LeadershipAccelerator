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
 * HOW IT LOOKS. Through the YouTube Data API v3, not by scraping. The scraper it
 * replaced worked from a laptop and was blind from the production host, which
 * YouTube answers with a bot challenge. The dry run before this change was 150
 * checked, 150 unknown, 0 failures, 6 untrusted batches, finished in nine seconds
 * because every batch bailed the moment its control probe was challenged. That is
 * the previous fix behaving correctly - quiet rather than 150 false alerts - and
 * it is still no coverage. `videos.list` answers the same questions from a
 * metered endpoint that has no reason to decide we are a robot, at one quota unit
 * per fifty videos.
 *
 * HOW A FAILURE EARNS AN ALERT. Three independent gates, each one added because
 * the check without it produced false positives at corpus scale:
 *
 *   1. The API must have answered. Quota exhaustion, a rejected key, an IP
 *      restriction, a timeout and a paginated response are all "we could not
 *      see", and none of them may become a statement about a video.
 *   2. The batch's control video - one of ours, known good, carried inside the
 *      same `videos.list` call - must have come back healthy. If the API will not
 *      answer honestly about a video we know is fine, nothing else in that
 *      response is evidence, including the ids that were missing from it.
 *   3. The failure must reproduce in a second, separately controlled observation
 *      after a cooldown. A video that fails once and passes on retry was never
 *      broken.
 *
 * Anything that does not clear all three lands in UNKNOWN, which is reported and
 * never paged on.
 *
 * AND ABSENCE IS NOT HEALTH. `videos.list` omits ids it cannot return instead of
 * erroring on them, so 47 items back from 50 ids means three videos are broken.
 * The probe iterates the request rather than the response precisely so a missing
 * video can never fall through as healthy: that is the 146-video mistake with the
 * sign flipped, and silent instead of loud.
 *
 * Failure-first notes:
 *  - What if the API refuses? The batch is untrusted: `untrusted_batches` and
 *    `unverified` go up, nothing is called healthy and nothing is called broken.
 *  - What if the quota runs out mid-run? Identical treatment. The remaining
 *    batches are unverified, the run reports it, and no alert fires.
 *  - What if the key is missing entirely? The run refuses to start and says so,
 *    rather than probing 150 videos into a wall.
 *  - What if the response shape changed? A 200 with no items array is a
 *    ContractViolation, not an empty result; an item carrying no
 *    `status.embeddable` is UNKNOWN, not embeddable. Neither degrades to healthy.
 *  - What if a run sees NOTHING at all? It does not stamp the day's idempotency
 *    key, so a blind run cannot consume the slot a sighted one needs.
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
import { classifyMissingUrl, ownershipOf, youtubeId, type Ownership, type VideoState } from './videoLinkClassifier';
import { DAILY_QUOTA_NOTE, createVideoApiClient } from './videoLinkApiClient';
import { createAbsenceProbe } from './videoLinkAbsenceProbe';
import {
  BATCH_SIZE,
  CONFIRM_COOLDOWN_MS,
  CONTROL_VIDEO_ID,
  PACE_MS,
  chunk,
  observeBatch,
  sleep,
  type Observation,
  type ProbeDeps,
} from './videoLinkProbe';
import {
  assessCard, assessMissingUrlCard, sealedWeeks, severityFor,
  type CardImpact, type ImpactCard,
} from './videoLinkImpact';

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

/**
 * One card of a card-owned video type that carries no video URL.
 *
 * Kept out of `failures` on purpose. A `VideoFailure` is keyed on a video_id and
 * describes a link that is broken; this has no video_id and describes a link that
 * was never made. Merging the two would make the daily count of broken videos
 * jump by 21 overnight without a single video having broken.
 */
export interface MissingUrlFinding {
  card_id: string;
  title: string;
  week: number | null;
  bucket: string | null;
  type: string | null;
  /** Only reachable cards are alerted on. The rest are still reported and counted. */
  student_reachable: boolean;
  /** Always "nothing" in substance; see `assessMissingUrlCard` for why. */
  blocks: string;
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
  /** Follow-up lookups YouTube refused. A measure of us, not of the curriculum. */
  throttled: number;
  /** Batches the API would not vouch for. Nothing in them may be called broken. */
  untrusted_batches: number;
  /** Videos we declined to judge because their batch was untrusted. */
  unverified: number;
  /**
   * YouTube Data API quota units this run spent. Reported so the daily cost is an
   * observed number rather than an estimate, and so a run that suddenly costs 100x
   * (someone reached for `search.list`) is visible the day it happens.
   */
  quota_units: number;
  /**
   * Failing videos by owner. Reported as three numbers rather than one
   * "on our channel" count: that count read 0 during the 2026-08-22 dry run and
   * was taken as reassurance, when in fact the owner was unknown for all 149.
   */
  ownership: Record<Ownership, number>;
  /**
   * Cards of a card-owned video type carrying no URL at all.
   *
   * Never HEALTHY, never a `failure`. A content gap, reported so that "we found
   * nothing wrong" can no longer mean "we never looked".
   */
  missing_url: MissingUrlFinding[];
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

/**
 * Type slugs whose card renders a player fed from the card's own metadata.
 *
 * Derived from `curriculum_type_definitions.render_band` — the six slugs in the
 * media/live_class/video_feedback bands — MINUS the ones whose media is resolved
 * per student at runtime. `podcast` and `testimonial` are assigned per
 * enrollment, and `ai_video_feedback` is generated per submission, so an empty
 * `metadata.video.url` is the normal resting state for those and reporting it
 * would be 100% false positives.
 */
const CARD_OWNED_VIDEO_TYPES = ['video', 'ai_video_stream', 'live_class'] as const;

async function loadVideoCards(): Promise<ImpactCard[]> {
  // Two populations, deliberately in one query.
  //
  // (1) Cards that carry a video URL. Keyed on the presence of the URL rather
  // than on type='video': several types (ai_video_stream, live_class,
  // testimonial, podcast) carry the same metadata.video.url and break
  // identically.
  //
  // (2) Cards of a card-owned video type carrying NO URL. Without this clause
  // such a card is not in the result set at all, is never probed, and reports
  // HEALTHY BY OMISSION — the same shape as an id `videos.list` drops from its
  // response, one step earlier and just as silent. On 2026-08-23 that was a Week
  // 3 card empty since 2026-07-14, with two unactioned student comments on the
  // card itself before a third report finally reached us.
  //
  // COALESCE is load-bearing, not defensive dressing. `NOT (metadata->'video' ?
  // 'url')` evaluates to NULL rather than true for a card whose metadata has no
  // 'video' key — which is the shape of all 21 such cards in production — so the
  // naive predicate filters out precisely the rows it is meant to find and
  // returns a confident zero. A sweep written that way did exactly that.
  //
  // Still reads ONLY metadata->'video'->>'url' for the URL itself. Scanning the
  // whole metadata blob also matches metadata.replaced_video.previous_url, a
  // tombstone for a link already retired; on 2026-08-21 that mistake found the
  // retired id dead and archived a healthy Week 3 card, sealing the week it was
  // trying to protect.
  const [rows] = await sequelize.query(
    `
    SELECT id, title, week, bucket, type, visibility, status, cohort_id, program_id,
           metadata->'video'->>'url' AS video_url
    FROM timeline_cards
    WHERE COALESCE(trim(metadata->'video'->>'url'), '') <> ''
       OR type IN (:cardOwnedVideoTypes)
  `,
    { replacements: { cardOwnedVideoTypes: [...CARD_OWNED_VIDEO_TYPES] } },
  );
  return (rows as Record<string, unknown>[]).map((r) => {
    // Trim once, here, so every downstream consumer agrees on what "has a URL"
    // means. A whitespace-only URL is treated as absent because that is exactly
    // how `hasVideoMetadata` treats it at runtime, and the checker must not
    // disagree with the gate about whether a video exists.
    const url = typeof r.video_url === 'string' ? r.video_url.trim() : '';
    return {
      id: String(r.id),
      title: String(r.title ?? ''),
      week: r.week === null || r.week === undefined ? null : Number(r.week),
      bucket: (r.bucket as string) ?? null,
      type: (r.type as string) ?? null,
      visibility: (r.visibility as string) ?? null,
      status: (r.status as string) ?? null,
      cohort_id: (r.cohort_id as string) ?? null,
      program_id: (r.program_id as string) ?? null,
      video_url: url || null,
      video_id: youtubeId(url || null),
    };
  });
}

/**
 * The verdict for a card with no URL. Constant, so it is built once rather than
 * per card, and read from the classifier rather than restated here so the alert
 * text and the taxonomy cannot drift apart.
 */
const MISSING_URL_VERDICT = classifyMissingUrl();

/**
 * Severity for a missing-URL alert.
 *
 * Fixed, and deliberately at the floor `severityFor` uses for a dead video that
 * reaches nobody. It never scales with student count because the finding never
 * blocks a student: scaling it would put a content gap on the same page as a
 * sealed week, and the whole value of the distinction is that these two read
 * differently at a glance.
 */
const MISSING_URL_SEVERITY = 3;

function buildMissingUrlFindings(cards: ImpactCard[]): MissingUrlFinding[] {
  return cards
    .map((card) => {
      const impact = assessMissingUrlCard(card, CANONICAL_PROGRAM_ID);
      return {
        card_id: impact.card_id,
        title: impact.title,
        week: impact.week,
        bucket: impact.bucket,
        type: card.type,
        student_reachable: impact.student_reachable,
        blocks: impact.blocks,
      };
    })
    // Reachable first: in production 21 cards carry no URL and only one of them
    // is in the live classroom, so an unsorted list buries the only actionable
    // row among twenty archived and out-of-program ones.
    .sort((a, b) => Number(b.student_reachable) - Number(a.student_reachable));
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

/** What one control-carrying sweep of a video list produced. */
interface SweepTally {
  healthy: Set<string>;
  inconclusive: Set<string>;
  suspects: Observation[];
  throttled: number;
  untrustedBatches: number;
  unverified: number;
  quotaUnits: number;
}

/**
 * Look a list of videos up in control-carrying batches and sort the answers into
 * healthy / inconclusive / suspect. Nothing here decides that a video is broken;
 * a suspect is only a candidate for a second look.
 *
 * Note what is NOT here: any path that quietly drops a video. Every id in
 * `videoIds` lands in exactly one of the three buckets, because a video that
 * falls out of the tally altogether reads downstream as "not a problem", which is
 * the same lie as calling it healthy.
 */
async function sweep(
  videoIds: string[],
  deps: ProbeDeps,
  correlationId: string,
  pass: 1 | 2,
): Promise<SweepTally> {
  const tally: SweepTally = {
    healthy: new Set(), inconclusive: new Set(), suspects: [],
    throttled: 0, untrustedBatches: 0, unverified: 0, quotaUnits: 0,
  };

  for (const batch of chunk(videoIds, BATCH_SIZE)) {
    const { trusted, observations, control_detail, quota_units } = await observeBatch(batch, deps);
    tally.throttled += observations.filter((o) => o.challenged).length;
    tally.quotaUnits += quota_units;

    if (!trusted) {
      // The control is the only thing standing between a blind run and 150 false
      // alerts. When it fails, this batch is not evidence of anything - and that
      // includes the ids that were missing from the response.
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
    throttled: 0, untrusted_batches: 0, unverified: 0, quota_units: 0,
    ownership: { ours: 0, third_party: 0, unknown: 0 },
    missing_url: [],
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
  const urlless: ImpactCard[] = [];
  for (const c of cards) {
    // Order matters. `video_id` is null for two unrelated reasons: the card has
    // no URL, and the card has a URL that is not YouTube. They are different
    // findings with different remedies — one is missing content we report, the
    // other is a Loom/Wistia link we cannot check and must not guess at — so the
    // no-URL case is taken first rather than folded into the skip below.
    if (!c.video_url) { urlless.push(c); continue; }
    if (!c.video_id) continue; // non-YouTube URL: skipped, never guessed at
    const list = byVideo.get(c.video_id) ?? [];
    list.push(c);
    byVideo.set(c.video_id, list);
  }

  // Computed before the API-key gate below: a missing URL is a fact about our own
  // database, so it stays reportable on a run that cannot reach YouTube at all.
  const missingUrl = buildMissingUrlFindings(urlless);

  const videoIds = Array.from(byVideo.keys());

  // A missing key is not a clean bill of health, and it is not an outage either.
  // Refuse to start and say which, rather than spending a run discovering it 150
  // times. `unverified` carries the corpus size so the result still reads "I
  // could not see N videos" instead of the far more dangerous "N videos checked".
  if (videoIds.length && !(process.env.YOUTUBE_API_KEY || '').trim()) {
    log('error', 'run_skipped', 'failure', {
      correlation_id: correlationId, reason: 'youtube_api_key_missing', videos: videoIds.length,
      error_class: 'NotConfigured',
    });
    return {
      // `missing_url` survives this early return: it was derived from our own
      // database and owes nothing to the API, so a missing key hides the video
      // check without also hiding the content gap. No alerts fire on this path,
      // matching the existing contract for a run that could not see.
      ...base, skipped: true, reason: 'youtube_api_key_missing',
      checked: videoIds.length, unknown: videoIds.length, unverified: videoIds.length,
      missing_url: missingUrl,
    };
  }

  log('info', 'run_started', 'success', {
    correlation_id: correlationId, videos: videoIds.length, cards: cards.length,
    pace_ms: paceMs, batch_size: BATCH_SIZE, control_video: CONTROL_VIDEO_ID,
    quota_budget: DAILY_QUOTA_NOTE,
  });

  const deps: ProbeDeps = { api: createVideoApiClient(), absence: createAbsenceProbe(paceMs) };

  // Pass 1 finds candidates. It does not convict.
  const first = await sweep(videoIds, deps, correlationId, 1);

  const healthy = new Set(first.healthy);
  const inconclusive = new Set(first.inconclusive);
  let throttled = first.throttled;
  let untrustedBatches = first.untrustedBatches;
  let unverified = first.unverified;
  let quotaUnits = first.quotaUnits;
  const confirmed: Observation[] = [];

  // Pass 2 re-observes only the suspects, in their own controlled burst, after a
  // cooldown. A failure that does not reproduce is not a failure.
  if (first.suspects.length) {
    log('info', 'confirmation_started', 'success', {
      correlation_id: correlationId, suspects: first.suspects.length, cooldown_ms: cooldownMs,
    });
    await sleep(cooldownMs);

    const second = await sweep(first.suspects.map((s) => s.video_id), deps, correlationId, 2);
    throttled += second.throttled;
    untrustedBatches += second.untrustedBatches;
    unverified += second.unverified;
    quotaUnits += second.quotaUnits;
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

  /**
   * A run that verified nothing at all did not happen, whatever the clock says.
   * Stamping the idempotency key on a blind run would burn the day's slot and
   * leave `force: true` as the only way back in - which is precisely how a check
   * that cannot see becomes a check nobody notices is silent.
   */
  const sawNothing = videoIds.length > 0 && unverified >= videoIds.length;

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
    // Only the student-reachable ones. The other 20 are archived or belong to a
    // different program, and alerting on them would bury the one that matters.
    for (const m of missingUrl.filter((f) => f.student_reachable)) {
      await emitAlert({
        // 'warning', never 'critical': this state cannot seal a week. Title is
        // stable per card so alertService folds the daily re-report into one open
        // alert rather than raising a new one every morning until it is fixed.
        type: 'warning',
        severity: MISSING_URL_SEVERITY,
        title: `Curriculum card has no video attached: ${m.title}`,
        description:
          `Week ${m.week ?? 'n/a'} ${m.type ?? 'card'}: ${MISSING_URL_VERDICT.detail}. ` +
          `Blocks: ${m.blocks} ${MISSING_URL_VERDICT.remedy}`,
        sourceType: 'system',
        impactArea: 'curriculum',
        entityType: 'curriculum_card',
        entityId: m.card_id,
        urgency: 'low',
        metadata: {
          card_id: m.card_id, state: MISSING_URL_VERDICT.state, week: m.week,
          bucket: m.bucket, type: m.type, seals_week: false,
          students_affected: 0, correlation_id: correlationId,
        },
      }).then(() => { alertsEmitted++; }).catch((err: Error) => {
        log('error', 'alert_emit_failed', 'failure', {
          correlation_id: correlationId, card_id: m.card_id, error_class: err.name, message: err.message,
        });
      });
    }
    if (!sawNothing) await setSetting(LAST_RUN_KEY, today);
  }

  const unknown = inconclusive.size;

  log(failures.length || untrustedBatches ? 'warn' : 'info', 'run_finished',
    failures.length || untrustedBatches ? 'partial' : 'success', {
      correlation_id: correlationId, duration_ms: Date.now() - started,
      checked: videoIds.length, healthy: healthy.size, unknown, failures: failures.length,
      sealed_weeks: weeks, throttled, untrusted_batches: untrustedBatches, unverified,
      quota_units: quotaUnits, saw_nothing: sawNothing, ownership,
      // Both numbers, because the gap between them is the story: 21 cards carry
      // no URL and exactly one of them is in the live classroom.
      missing_url: missingUrl.length,
      missing_url_reachable: missingUrl.filter((m) => m.student_reachable).length,
    });

  return {
    ran: true, skipped: false, correlation_id: correlationId, checked: videoIds.length,
    healthy: healthy.size, unknown, failures, sealed_weeks: weeks, alerts_emitted: alertsEmitted,
    throttled, untrusted_batches: untrustedBatches, unverified, quota_units: quotaUnits, ownership,
    missing_url: missingUrl,
  };
}
