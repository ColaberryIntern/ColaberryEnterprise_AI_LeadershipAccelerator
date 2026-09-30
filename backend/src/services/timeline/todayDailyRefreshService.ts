/**
 * todayDailyRefreshService — decides whether a student's Today feed is due for
 * its once-per-Central-day automatic top-up (env.todayDailyRefreshEnabled, see
 * todayFeedComposer.ts's getTodayPage()). Without this, a long-tenured account
 * never sees new content on a plain page reload once it has enough materialized
 * `today_feed_impressions` to fill a page — the composer only extends when a
 * student scrolls past everything already stored (deterministic pagination is
 * intentional for scroll-position consistency, but it means "just refresh" never
 * surfaces anything new). This module answers exactly one question: has this
 * enrollment already gotten its daily top-up today?
 *
 * Uses centralDateKey() (centralDate.ts) rather than a naive UTC date compare —
 * that class of bug has caused a real production incident before (see
 * centralDate.ts's classInstant() docstring).
 *
 * Fail-soft, matching capeAiPulseExposureService.ts: a DB error degrades to
 * "no top-up due" (false) — never blocks or breaks the feed.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { centralDateKey } from '../centralDate';

/** True if this enrollment has NOT yet received today's (Central time) auto top-up
 *  — including a brand-new account with zero impressions (harmless: their very next
 *  call already extends naturally via the existing served.length < targetEnd loop,
 *  so this is at most a redundant early extension, never an error). */
export async function isDailyRefreshDue(enrollmentId: string): Promise<boolean> {
  try {
    const rows = await sequelize.query<{ last: string | Date | null }>(
      `SELECT MAX(served_at) AS last FROM today_feed_impressions WHERE enrollment_id = :eid`,
      { replacements: { eid: enrollmentId }, type: QueryTypes.SELECT },
    );
    const last = rows[0]?.last;
    if (!last) return true; // no impressions yet
    const lastMs = last instanceof Date ? last.getTime() : new Date(last).getTime();
    if (Number.isNaN(lastMs)) return true; // malformed row — treat as due rather than throw
    return centralDateKey(lastMs) !== centralDateKey(Date.now());
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'today_daily_refresh_check_failed',
      error_class: err?.name || 'Error',
      outcome: 'failure',
      context: { enrollment_id: enrollmentId, message: err?.message },
    }));
    return false; // fail-soft: skip the top-up, never break the feed
  }
}
