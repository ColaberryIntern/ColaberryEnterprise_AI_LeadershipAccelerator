/**
 * CARRYING THE AD'S TAGS FROM THE VISITOR SESSION ONTO THE LEAD.
 *
 * A signup writes a `leads` row; `/api/t/identify` then finds it by email and copies the UTM tags
 * off the visitor's session. This module is the decision inside that copy — which session to
 * believe, and which fields to take — pulled out of the controller so it can be tested without a
 * database, a request, or a clock.
 *
 * ── WHAT THIS FIXES (ADS-3) ──
 *
 * 1. IT NO LONGER TRUSTS "NEWEST". The old read took the single newest session. Sessions are
 *    reused for 30 minutes and the React tracker's own flush sends no UTM fields, so the newest
 *    session is routinely an untagged one: a visitor who lands on the tagged ad page, wanders to
 *    another tracked surface, and then signs up had their campaign sitting one session back, and
 *    the backfill read past it and wrote nothing. `pickAttributionSession` takes the newest
 *    session that actually carries a campaign, and falls back to the newest session for the rest.
 *    How far back it reaches is bounded two ways, by session count and by age — see
 *    `UTM_SESSION_LOOKBACK` and `UTM_ATTRIBUTION_WINDOW_DAYS`. Unbounded, the same fix would
 *    quietly turn last-touch attribution into first-touch.
 *
 * 2. IT COPIES ALL FIVE FIELDS. The old copy took `utm_source`, `utm_campaign` and `utm_medium`
 *    only, so `utm_content` and `utm_term` — which ad, which placement — reached the session and
 *    stopped there. Measured in production on 2026-11-03: 1,464 ad visits carried both, and 0 of
 *    450 leads did, which is why spend could be judged per campaign and never per ad. Both
 *    columns already exist on `leads` (added by `ensureLeadAttributionColumns`); nothing was
 *    writing to them.
 *
 * ── WHAT THIS DOES NOT FIX ──
 *
 * The race. The lead row is still created with NULL tags and patched milliseconds later by a
 * fire-and-forget call, so a consumer that reads the row synchronously can still see NULL. The fix
 * for that is the signup sending its own tags instead of being patched, which is a separate change
 * and already merged; this module cannot close it from the patching side.
 *
 * ── FAILURE PATH ──
 *
 * Nothing here throws: a missing session, a blank field and an unexpected shape all return "no
 * updates". The caller's own failure path is a classified log, never a silent swallow and never a
 * failed identify call — attribution rides on top of a lead that already exists, so losing the
 * tags must not cost the lead.
 *
 * Pure: rows in, a field map out.
 */

/** The five columns both `visitor_sessions` and `leads` carry. */
export const UTM_FIELDS = ['utm_source', 'utm_campaign', 'utm_medium', 'utm_content', 'utm_term'] as const;

export type UtmField = typeof UTM_FIELDS[number];

/** Anything carrying the five columns: a VisitorSession instance, a Lead instance, or a plain row. */
export type UtmFields = { [K in UtmField]?: string | null };

/** A session: the five columns plus when it started. */
export type UtmSession = UtmFields & { created_at?: Date | string | null };

/**
 * How many of a visitor's recent sessions to look back through for a campaign.
 *
 * Bounded on purpose. This read sits on a request that is already racing the page navigation, and
 * a long-lived visitor can accumulate sessions without limit; an uncapped read would grow quietly
 * with the oldest accounts. Twenty covers a visitor who browsed for a while between the ad click
 * and the signup. Past that the click is old enough that attributing to it would be a guess.
 */
export const UTM_SESSION_LOOKBACK = 20;

/**
 * How old an ad click may be and still be the thing a signup is attributed to.
 *
 * Reaching past the newest session is the fix, and left unbounded it is also a bug: it quietly
 * turns last-touch attribution into first-touch, so somebody who clicked an ad months ago and
 * later arrived through search would be credited to that ad forever. Thirty days matches the
 * report's own default window, so a signup can only be attributed to a click the report would
 * have spend for. Past that the click is old enough that crediting it would be a guess, and the
 * newest session is used instead.
 *
 * This does not inflate any current return on its own — the report windows spend and signups
 * together, so an out-of-window campaign lands in `unspentSignups` rather than against live spend.
 * The bound is here because the attribution written onto the lead is read by more than the report.
 */
export const UTM_ATTRIBUTION_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/** A usable tag: a non-blank string. NULL, undefined and whitespace all count as absent. */
const present = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** When the session started, or null when it cannot be read. */
function startedAt(session: UtmSession | undefined): number | null {
  const raw = session?.created_at;
  if (!raw) return null;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The session to attribute this lead to, given the visitor's sessions newest first.
 *
 * The newest session that carries a campaign AND is inside the attribution window wins, because a
 * campaign is what the report joins on and an untagged session cannot supply one. With no such
 * session, the newest session is used anyway — it may still carry a source or a medium worth
 * having, and returning nothing would throw those away too.
 *
 * A session whose timestamp cannot be read is treated as inside the window rather than outside it.
 * Dropping an attribution over a missing field is the exact failure this change exists to stop,
 * and a session row with no readable `created_at` is a schema problem, not a stale click.
 *
 * `nowMs` is a parameter so this stays testable without mocking the clock.
 */
export function pickAttributionSession<T extends UtmSession>(newestFirst: readonly T[], nowMs: number = Date.now()): T | undefined {
  if (!Array.isArray(newestFirst)) return undefined;
  const floor = nowMs - UTM_ATTRIBUTION_WINDOW_DAYS * DAY_MS;
  const attributable = (session: T) => {
    if (!present(session?.utm_campaign)) return false;
    const started = startedAt(session);
    return started === null || started >= floor;
  };
  return newestFirst.find(attributable) ?? newestFirst[0];
}

/**
 * The fields to write onto the lead. An empty object means there is nothing to do.
 *
 * A tag already on the lead is never overwritten: the lead's own value came from the signup
 * itself, which is closer to the person than a session matched by fingerprint. That is also what
 * makes this safe to run twice — the second run finds every field present and returns {} — so a
 * retried or duplicated identify call cannot change an attribution that is already set.
 *
 * Values are copied as they stand rather than cleaned up. The shape of `utm_source` is settled
 * where the report reads it (see adSpend/utmSource.ts), and a second, different rule applied here
 * would be one more way for the two sides to disagree.
 */
export function utmBackfillUpdates(session: UtmFields | undefined | null, lead: UtmFields): Partial<Record<UtmField, string>> {
  const updates: Partial<Record<UtmField, string>> = {};
  if (!session) return updates;
  for (const field of UTM_FIELDS) {
    const incoming = session[field];
    if (present(incoming) && !present(lead?.[field])) updates[field] = incoming;
  }
  return updates;
}
