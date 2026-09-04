import { award, sumPointsTodayByEventTypes } from '../pointsService';
import { centralDateKey } from '../centralDate';
import { CertSessionMode, CertDomainResult } from '../../models/CertSession';

/**
 * certPointsService — Cert Prep's integration with the canonical points ledger.
 *
 * This service mints nothing. Every award goes through `pointsService.award`,
 * which writes to `student_points_events` and is idempotent per
 * (enrollment_id, event_key). There is deliberately no parallel cert ledger: a
 * second points table is how two totals start disagreeing and neither can be
 * trusted.
 *
 * THE INCENTIVE SHAPE IS THE POINT. Ali's instruction was that students should
 * keep taking practice exams until their scores get really good. So volume is
 * cheap and improvement is valuable:
 *
 *   - Finishing a practice set pays a little, and is capped per day, so grinding
 *     sessions cannot be farmed for points.
 *   - Mastering a domain for the FIRST time pays well, once per domain, forever.
 *   - Reaching sustained readiness pays the most, once.
 *
 * A student who sits ten mediocre practice sets earns the daily cap and stops. A
 * student whose scores climb keeps unlocking mastery awards. That is the
 * behaviour we want to pay for.
 *
 * Cert points can never substitute for required Classroom or Project completion —
 * they are a parallel earn, not an alternative path (see CLAUDE.md's progression
 * rules and the Phase 1 anti-gaming requirement).
 */

/**
 * Cert event types. Registered here rather than in pointsService.POINT_EVENTS so
 * the Cert Prep feature owns its own values; `award` takes an explicit `points`
 * override, so the canonical registry does not need editing to add a feature.
 */
export const CERT_POINT_VALUES = {
  /** One-time: the baseline diagnostic that starts the track. */
  cert_diagnostic_complete: 40,
  /** Repeatable but small and daily-capped — participation, not achievement. */
  cert_practice_complete: 5,
  /** Per full-length mock. Worth more than practice; still not the big prize. */
  cert_mock_complete: 25,
  /** First time a domain crosses the mastery bar. Once per domain, ever. */
  cert_domain_mastered: 50,
  /** Sustained readiness across multiple sittings. The one that matters. */
  cert_readiness_sustained: 150,
} as const;

export type CertPointEvent = keyof typeof CERT_POINT_VALUES;

/**
 * Daily ceiling on farmable cert practice points. Mirrors the existing
 * AMBIENT_LEARNING / COMMUNITY caps in progression/dailyCap.ts: the events that
 * repeat cheaply get a ceiling, the ones that represent real achievement do not.
 */
export const CERT_PRACTICE_DAILY_CAP = 40;

/** The event types that count against that cap. */
export const CERT_CAPPED_EVENT_TYPES: readonly string[] = ['cert_practice_complete'];

/**
 * Proportion correct at which a domain counts as mastered.
 *
 * Set above the exam's own passing proportion (~0.689) on purpose. A domain you
 * scrape a pass in is not one you have mastered, and paying out at the pass mark
 * would stop a student practising exactly when they were only just good enough.
 */
export const DOMAIN_MASTERY_PCT = 0.8;

/** Minimum answered items in a domain before mastery can be claimed at all. */
export const DOMAIN_MASTERY_MIN_ITEMS = 8;

export interface AwardResult {
  event: string;
  awarded: boolean;
  points: number;
}

/**
 * Points for completing a sitting.
 *
 * Keyed on the session id, so a re-submitted "complete" (a retry, a double-tapped
 * button, a resumed tab) cannot pay twice. Practice awards are suppressed once the
 * day's cap is reached rather than partially awarded — a half-award would make the
 * ledger's arithmetic unexplainable to a student reading their own history.
 */
export async function awardSessionCompletion(
  enrollmentId: string,
  session: { id: string; mode: CertSessionMode },
  now: Date = new Date(),
): Promise<AwardResult> {
  if (session.mode === 'diagnostic') {
    // Once per enrollment, not once per diagnostic: repeating the baseline is
    // allowed and useful, but it is only worth paying for the first time.
    const res = await award(enrollmentId, {
      eventType: 'cert_diagnostic_complete',
      eventKey: 'cert_diagnostic_complete',
      points: CERT_POINT_VALUES.cert_diagnostic_complete,
      metadata: { session_id: session.id },
    });
    return { event: 'cert_diagnostic_complete', ...res };
  }

  if (session.mode === 'mock') {
    const res = await award(enrollmentId, {
      eventType: 'cert_mock_complete',
      eventKey: `cert_mock_complete:${session.id}`,
      points: CERT_POINT_VALUES.cert_mock_complete,
      metadata: { session_id: session.id },
    });
    return { event: 'cert_mock_complete', ...res };
  }

  // The cap is a CENTRAL-time day, matching every other daily total in the
  // platform — a student in another timezone gets the same cap on the same day,
  // and does not get a second allowance by crossing midnight locally.
  const spentToday = await sumPointsTodayByEventTypes(
    enrollmentId,
    [...CERT_CAPPED_EVENT_TYPES],
    centralDateKey(now.getTime()),
  );
  if (spentToday >= CERT_PRACTICE_DAILY_CAP) {
    return { event: 'cert_practice_complete', awarded: false, points: 0 };
  }

  const res = await award(enrollmentId, {
    eventType: 'cert_practice_complete',
    eventKey: `cert_practice_complete:${session.id}`,
    points: CERT_POINT_VALUES.cert_practice_complete,
    metadata: { session_id: session.id },
  });
  return { event: 'cert_practice_complete', ...res };
}

/**
 * Points for mastering domains, evaluated after a sitting is scored.
 *
 * Keyed per domain, so a domain pays out once ever no matter how many times it is
 * re-demonstrated. That is what makes improvement, rather than repetition, the
 * thing being rewarded. A domain with too few answered items is skipped: three
 * lucky answers is not mastery.
 */
export async function awardDomainMastery(
  enrollmentId: string,
  domainResults: CertDomainResult[],
): Promise<AwardResult[]> {
  const results: AwardResult[] = [];
  for (const domain of domainResults) {
    if (domain.total < DOMAIN_MASTERY_MIN_ITEMS) continue;
    if (domain.pct < DOMAIN_MASTERY_PCT) continue;

    const res = await award(enrollmentId, {
      eventType: 'cert_domain_mastered',
      eventKey: `cert_domain_mastered:${domain.domain_id}`,
      points: CERT_POINT_VALUES.cert_domain_mastered,
      metadata: { domain_id: domain.domain_id, pct: domain.pct, items: domain.total },
    });
    results.push({ event: `cert_domain_mastered:${domain.domain_id}`, ...res });
  }
  return results;
}

/**
 * The one-time award for reaching sustained readiness.
 *
 * Called only by the readiness computation, and only when the state is
 * 'sustained' — which requires more than one qualifying sitting, so a single
 * lucky run cannot trigger it.
 */
export async function awardSustainedReadiness(
  enrollmentId: string,
  metadata: { overall_scaled: number | null; policy_version: string },
): Promise<AwardResult> {
  const res = await award(enrollmentId, {
    eventType: 'cert_readiness_sustained',
    eventKey: 'cert_readiness_sustained',
    points: CERT_POINT_VALUES.cert_readiness_sustained,
    metadata,
  });
  return { event: 'cert_readiness_sustained', ...res };
}

/**
 * Everything a completed sitting should pay, in one call.
 *
 * Returns every attempted award including the ones that did not fire, so a caller
 * can log honestly ("already awarded", "daily cap reached") rather than reporting
 * silence as success.
 */
export async function awardForCompletedSession(
  enrollmentId: string,
  session: { id: string; mode: CertSessionMode; domain_results?: CertDomainResult[] | null },
  now: Date = new Date(),
): Promise<AwardResult[]> {
  const results: AwardResult[] = [await awardSessionCompletion(enrollmentId, session, now)];
  if (session.domain_results?.length) {
    results.push(...(await awardDomainMastery(enrollmentId, session.domain_results)));
  }
  return results;
}
