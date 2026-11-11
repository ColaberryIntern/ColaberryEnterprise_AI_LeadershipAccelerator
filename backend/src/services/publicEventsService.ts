import * as sql from 'mssql';
import { QueryTypes } from 'sequelize';
import { env } from '../config/env';
import { sequelize } from '../config/database';
import { OpenHouseEvent } from '../models';
import { OpenHouseView } from './openHouseTypes';
import { centralWallClockToInstant, CCPP_NOW_CENTRAL } from './centralDate';

export { centralWallClockToInstant };

/**
 * Public events for the portal: the calendar feed and the "Next event" countdown
 * (which highlights the flagship Open House).
 *
 * Source of truth is CCPP `EventBrite_Events` — the same live Eventbrite -> CCPP
 * pipeline that feeds attendees. Two facts drive the query:
 *   - `Status` carries the Eventbrite lifecycle (live / deleted / completed /
 *     draft / ended / started / canceled). Deleted events share future dates, so
 *     we require `Status = 'live'`.
 *   - "Public" is the CCPP `Registration` event group. `EventBrite_EventGroups`
 *     row ID 1 is named `Registration`; `EventBrite_EventAccess` maps EventId ->
 *     EventGroupId with its own `IsActive` flag. That label is the one CCPP
 *     maintains deliberately for prospect-facing, register-for-this events, so it
 *     is the signal we key on. It admits the AI-track events (AI Internship
 *     Presentation, AI Strategy And Collaboration, AI Friday Trends) and still
 *     excludes the recurring bootcamp sessions (SQL After Dark, Interview Prep,
 *     IPBC Saturday / Mortgage Help) and the internal COE meetups, none of which
 *     carry the label.
 *   - PUBLIC_EVENT_LIKE is a DEPRECATED name fallback OR'd onto the label check.
 *     A handful of individual occurrences of otherwise-public series are missing
 *     an active Registration row in CCPP, and dropping the name list outright
 *     would silently un-publish events the portal shows today. Delete it once
 *     CCPP labels those occurrences; see the PR that introduced this note.
 *
 * CCPP is only reachable from inside the prod network, so this runs in the
 * backend container. Failure-First: on any CCPP error we fall back to the
 * hand-seeded Postgres `open_house_events` table (may be empty) so the portal
 * never hard-fails, and we cache results in-memory because the onboarding
 * schedule endpoint is hit on every portal page load.
 */

// The "Next event" countdown highlights the flagship Open House (see
// getNextPublicEvent). Match Open Houses by name since CCPP has no category column.
const OPEN_HOUSE_RE = /open house/i;
// The CCPP event-group label that means "prospect-facing, registration open".
// `EventBrite_EventGroups.GroupName`; matched by name rather than by the literal
// ID 1 so a CCPP re-seed that renumbers the table cannot silently empty the feed.
export const PUBLIC_EVENT_GROUP = 'Registration';
// DEPRECATED name fallback — see the header note. Some individual occurrences of
// public series carry no active Registration row in CCPP; without these patterns
// they would vanish from the portal. Remove once CCPP labels every occurrence.
// Static literals (no user input), spliced into the CCPP WHERE as OR'd LIKEs.
const PUBLIC_EVENT_LIKE: string[] = [
  '%Open House%',
  '%Competition%',       // CAP Competition
  '%Talent Showcase%',   // Data Talent Showcase
  '%Financial Literacy%',
  '%Good Life%',
];
const FETCH_WINDOW_DAYS = 180;
const FETCH_LIMIT = 100;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

interface CcppEventRow {
  EventId: string;
  Name: string;
  Description: string | null;
  URL: string | null;
  StartDate: Date;
  EndDate: Date | null;
  /** Eventbrite promo image. Absent on rows CCPP synced before the column existed. */
  Logo_url?: string | null;
  /** DISTINCT registrant count from the attendee mirror; absent on fallback rows. */
  SignupCount?: number | null;
}

let cache: { at: number; events: OpenHouseView[] } | null = null;

async function connectCcpp(): Promise<sql.ConnectionPool> {
  if (!env.mssqlHost || !env.mssqlUser) {
    throw new Error('MSSQL connection not configured (MSSQL_HOST / MSSQL_USER missing)');
  }
  const pool = new sql.ConnectionPool({
    server: env.mssqlHost,
    port: env.mssqlPort,
    user: env.mssqlUser,
    password: env.mssqlPass,
    database: env.mssqlDatabase,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 20000,
  });
  await pool.connect();
  return pool;
}

const EVENT_TZ = 'America/Chicago';

// "Now" in the frame CCPP stores StartDate in. Moved to centralDate.ts on
// 2026-11-10 and imported above, so the JS correction and its SQL twin sit
// together: keeping this fragment private here is why openHouseEventService
// still carried the same six-hour defect two months after this service was
// fixed. The full explanation traveled with it.

// CCPP stores `EventBrite_Events` datetimes as CENTRAL wall-clock, but the mssql
// driver reads them as UTC (so 6:30 PM Central arrives as 18:30Z). Re-interpreting
// the naive wall-clock as America/Chicago (centralWallClockToInstant, imported
// above from centralDate.ts) recovers the true instant, DST-aware.

/** Map a CCPP `EventBrite_Events` row to the shared OpenHouseView contract (pure). */
export function ccppRowToView(r: CcppEventRow): OpenHouseView {
  return {
    id: String(r.EventId),
    title: r.Name,
    description: r.Description ?? null,
    // CCPP times are Central wall-clock read as UTC — correct them to the true instant.
    starts_at: centralWallClockToInstant(new Date(r.StartDate)),
    // Same correction for the end, which is nullable in CCPP.
    ends_at: r.EndDate ? centralWallClockToInstant(new Date(r.EndDate)) : null,
    timezone: EVENT_TZ,
    registration_url: r.URL ?? null,
    meeting_link: null,
    // Blank strings exist in CCPP alongside NULLs; normalize both to null so the
    // UI's "has an image" check is a single truthiness test.
    image_url: r.Logo_url ? String(r.Logo_url).trim() || null : null,
    // A real count or null — never a fabricated zero. `null` means "not known"
    // and renders as no badge; 0 means "genuinely nobody yet".
    signup_count: typeof r.SignupCount === 'number' && Number.isFinite(r.SignupCount)
      ? r.SignupCount
      : null,
    // Per-viewer; the shared cache cannot hold it. annotateRegistration()
    // overwrites this per request. Defaulting false keeps the contract total.
    is_registered: false,
  };
}

/** Keep only events starting between `nowMs` and `nowMs + days` (pure). */
export function withinDays(events: OpenHouseView[], nowMs: number, days: number): OpenHouseView[] {
  const horizon = nowMs + days * 864e5;
  return events.filter((e) => {
    const t = new Date(e.starts_at).getTime();
    return t > nowMs && t <= horizon;
  });
}

async function fetchFromCcpp(): Promise<OpenHouseView[]> {
  const pool = await connectCcpp();
  try {
    // OR of static LIKE literals (no user input) — the deprecated name fallback.
    const allowlist = PUBLIC_EVENT_LIKE.map((p) => `e.Name LIKE '${p}'`).join(' OR ');
    // EXISTS, not a JOIN: an event may carry several active group rows, and a
    // join would emit one duplicate event per row (and burn the TOP (@lim) budget
    // on them). The group name is bound as a parameter, not interpolated.
    const res = await pool
      .request()
      .input('days', sql.Int, FETCH_WINDOW_DAYS)
      .input('lim', sql.Int, FETCH_LIMIT)
      .input('group', sql.NVarChar, PUBLIC_EVENT_GROUP)
      .query<CcppEventRow>(`
        SELECT TOP (@lim) e.EventId, e.Name, e.Description, e.URL, e.StartDate, e.EndDate, e.Logo_url,
          -- DISTINCT email, not row count: one Eventbrite order writes several
          -- attendee rows, and the legacy training site badges the people number
          -- (14 for an event holding 30 rows). Correlated subquery rather than a
          -- LEFT JOIN + GROUP BY so it cannot multiply the TOP (@lim) row budget.
          (SELECT COUNT(DISTINCT a2.Email)
             FROM EventBrite_EventAttendees a2
            WHERE a2.EventId = e.EventId) AS SignupCount
        FROM EventBrite_Events e
        WHERE e.Status = 'live'
          AND e.StartDate > ${CCPP_NOW_CENTRAL}
          AND e.StartDate <= DATEADD(day, @days, ${CCPP_NOW_CENTRAL})
          AND (
            EXISTS (
              SELECT 1
              FROM EventBrite_EventAccess a
              INNER JOIN EventBrite_EventGroups g ON g.ID = a.EventGroupId
              WHERE a.EventId = e.EventId
                AND a.IsActive = 1
                AND g.GroupName = @group
            )
            OR ${allowlist}
          )
        ORDER BY e.StartDate ASC
      `);
    return res.recordset.map(ccppRowToView);
  } finally {
    await pool.close();
  }
}

/** Fallback: the hand-seeded Postgres `open_house_events` table (may be empty). */
async function fetchFromPostgres(): Promise<OpenHouseView[]> {
  const now = Date.now();
  const rows = await OpenHouseEvent.findAll({
    where: { status: 'scheduled' },
    order: [['starts_at', 'ASC']],
  });
  // Future-only, so getNextPublicEvent()[0] is always an upcoming event (CCPP's
  // SQL already filters future; this keeps the fallback consistent).
  return rows.filter((e) => new Date(e.starts_at).getTime() > now).map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    // The seeded Postgres table carries neither an end time nor an image, so the
    // Events page renders these rows text-only rather than breaking.
    ends_at: null,
    timezone: e.timezone,
    registration_url: e.registration_url,
    meeting_link: e.meeting_link,
    image_url: null,
    // Not known on this path — the seeded table has no attendee mirror. null
    // (no badge), never 0, which would assert nobody has registered.
    signup_count: null,
    is_registered: false,
  }));
}

/** Load the cached upcoming public events, refreshing from CCPP when stale. */
async function loadUpcoming(): Promise<OpenHouseView[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.events;

  let events: OpenHouseView[];
  try {
    events = await fetchFromCcpp();
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'public_events_ccpp_unavailable', outcome: 'partial',
      error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message, fallback: 'postgres_open_house_events' },
    }));
    try {
      events = await fetchFromPostgres();
    } catch (err2: any) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'backend',
        event: 'public_events_fallback_failed', outcome: 'failure',
        error_class: err2?.constructor?.name ?? 'Error', context: { message: err2?.message },
      }));
      events = [];
    }
  }
  // Fold our OWN registrations into the counts before caching, so every viewer of
  // the calendar sees one number for the event rather than Eventbrite's share of it.
  events = await addOwnRegistrations(events);
  cache = { at: Date.now(), events };
  return events;
}

/**
 * The event for the topbar "Next event" countdown. Prefers the flagship Open
 * House (prospect-facing), falling back to the soonest event of any kind so the
 * chip is never empty when only community events are scheduled.
 */
export async function getNextPublicEvent(): Promise<OpenHouseView | null> {
  const events = await loadUpcoming();
  return events.find((e) => OPEN_HOUSE_RE.test(e.title)) ?? events[0] ?? null;
}

/** Upcoming public events within `days` (default 30) for the portal calendar. */
export async function getUpcomingPublicEvents(days = 30, nowMs: number = Date.now()): Promise<OpenHouseView[]> {
  const events = await loadUpcoming();
  return withinDays(events, nowMs, days);
}

/** True if `id` is one of the current upcoming public events (RSVP validation). */
export async function isKnownPublicEvent(id: string): Promise<boolean> {
  const events = await loadUpcoming();
  return events.some((e) => e.id === id);
}

/**
 * Which of `eventIds` this email has registered for, from the CCPP
 * `EventBrite_EventAttendees` mirror (the same source
 * `openHouseOnboardingService.isEmailRegisteredForOpenHouse` reads, generalized
 * to many events in one round trip).
 *
 * Deliberately NOT cached: `cache` is shared across every viewer, and folding a
 * per-person answer into it would leak one learner's registrations to the next
 * request. Fails SOFT (empty set) so a CCPP blip degrades to "nothing marked
 * registered" rather than breaking the calendar.
 */
export async function getRegisteredEventIds(email: string, eventIds: string[]): Promise<Set<string>> {
  const e = (email || '').trim().toLowerCase();
  if (!e || eventIds.length === 0) return new Set();

  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await connectCcpp();
    const req = pool
      .request()
      .input('email', sql.VarChar, e)
      // The SAME address in the shape CCPP's ingestion actually stores. See below.
      .input('emailWrapped', sql.VarChar, `'${e}',`);
    // Bind each id as its own parameter — never interpolate ids into the text.
    const params = eventIds.map((id, i) => {
      req.input(`id${i}`, sql.VarChar, String(id));
      return `@id${i}`;
    });
    // WHY TWO EMAIL FORMS. 26,177 of 99,338 rows in EventBrite_EventAttendees
    // store the address with its delimiters baked in — literally
    // `'someone@example.com',`, a fragment of a VALUES list written verbatim.
    // Measured 2026-09-01, and it is not historical: 0.1% of 2024 rows, 69% of
    // 2025, and **100% of 2026** — including every one of the 46 registrations
    // for currently-upcoming events.
    //
    // An exact match on the clean form therefore returns nothing for anyone who
    // signed up recently, so "You are registered" never appears and the page
    // looks broken while the code is correct.
    //
    // Matching the corrupt shape EXACTLY rather than stripping quotes and commas
    // generally: the corruption is perfectly uniform (two shapes across the whole
    // table, nothing else), an exact comparison keeps the index usable, and it
    // cannot mangle a legitimate address the way a blanket REPLACE could.
    // `TRIM(chars FROM ...)` would be tidier but needs SQL Server 2022; this is 2017.
    //
    // THIS IS A DEFENSIVE READ, NOT A FIX. The ingestion still writes corrupt
    // rows and should be repaired upstream in CCPP; until then this recovers
    // both the 26k historical registrations and every new one.
    const res = await req.query<{ EventId: string }>(`
      SELECT DISTINCT EventId
      FROM EventBrite_EventAttendees
      WHERE (LOWER(Email) = @email OR LOWER(Email) = @emailWrapped)
        AND EventId IN (${params.join(',')})
    `);
    return new Set(res.recordset.map((r) => String(r.EventId)));
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'event_registration_lookup_failed', outcome: 'partial',
      error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message, events: eventIds.length },
    }));
    return new Set();
  } finally {
    if (pool) { try { await pool.close(); } catch { /* ignore */ } }
  }
}

/**
 * Return a copy of `events` with `is_registered` set for this viewer. Copies
 * rather than mutating because the objects belong to the shared cache — writing
 * to them in place would publish one learner's registrations to everyone else.
 */
export async function annotateRegistration(events: OpenHouseView[], email: string | null | undefined): Promise<OpenHouseView[]> {
  if (!email || events.length === 0) return events.map((e) => ({ ...e, is_registered: false }));
  const ids = events.map((e) => e.id);
  // BOTH ledgers. Someone who signed up on our own landing page is registered, and
  // before this they were shown a "Sign up" button pointing at Eventbrite - which
  // invited the very double-registration this pair of tables already suffers from.
  const [onEventbrite, onOurs] = await Promise.all([
    getRegisteredEventIds(email, ids),
    getOwnRegisteredEventIds(email, ids),
  ]);
  return events.map((e) => ({ ...e, is_registered: onEventbrite.has(e.id) || onOurs.has(e.id) }));
}

/** Test-only: clear the in-memory cache between cases. */
export function __resetPublicEventsCache(): void { cache = null; }

/**
 * Every attendee address Eventbrite holds for ONE event, de-duplicated and
 * un-corrupted. Used by the Open House attendee reconciliation (OH-9).
 *
 * ── WHY THIS THROWS, WHEN EVERYTHING ELSE HERE FALLS BACK ──
 *
 * The rest of this module is viewer-facing: a portal page that cannot reach CCPP
 * should still render, so those paths swallow the error and degrade. This one is
 * the opposite. Its caller compares two rosters and reports who is missing from
 * which, and an empty list from a broken query is indistinguishable from an event
 * with no attendees — it would render "0 registered on Eventbrite, all 6 of yours
 * are missing from it" with total confidence, which is a lie that looks like a
 * finding.
 *
 * That is not hypothetical. `getRegisteredEventIds` returns an empty Set on any
 * failure, and on 2026-11-11 it produced exactly that ambiguity while I was
 * checking this data by hand. So: this one throws, and the caller is required to
 * say "unavailable" rather than "zero".
 *
 * ── THE ADDRESS SHAPE ──
 *
 * CCPP's ingestion bakes the delimiters into the stored value — literally
 * `'someone@example.com',` — for 100% of 2026 rows. `getRegisteredEventIds`
 * handles this by matching both exact forms in SQL, which keeps its index usable.
 * Here the whole roster is being read rather than probed for one address, so the
 * unwrapping happens in JS, where it can be applied uniformly and tested.
 *
 * Addresses are returned lowercased and trimmed so callers can compare them
 * directly against `open_house_registrations.email_lower` without re-normalising
 * — two normalisers for one comparison is how a false "no overlap" gets made.
 */
export function unwrapCcppEmail(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .replace(/^'/, '')
    .replace(/',?$/, '')
    .trim()
    .toLowerCase();
}

export async function getEventAttendeeEmails(eventId: string): Promise<string[]> {
  const id = String(eventId || '').trim();
  if (!id) return [];

  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await connectCcpp();
    const res = await pool
      .request()
      .input('eid', sql.VarChar, id)
      .query<{ Email: string }>(
        'SELECT Email FROM EventBrite_EventAttendees WHERE EventId = @eid',
      );
    const seen = new Set<string>();
    for (const row of res.recordset) {
      const email = unwrapCcppEmail(row.Email);
      if (email) seen.add(email);
    }
    return [...seen];
  } finally {
    if (pool) { try { await pool.close(); } catch { /* ignore */ } }
  }
}

/**
 * Normalise an address the SAME way on both sides of every comparison. One
 * normaliser, used everywhere, is what stops a false "no overlap".
 */
function normEmail(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * Which of `eventIds` this email registered for through OUR OWN pages.
 *
 * The Postgres twin of `getRegisteredEventIds`. Fails SOFT for the same reason:
 * a database blip should degrade to "nothing marked registered" rather than break
 * the calendar. `lower()` on both sides rather than `iLike`, because an address
 * containing `_` or `%` is an ordinary address and a LIKE wildcard.
 */
export async function getOwnRegisteredEventIds(email: string, eventIds: string[]): Promise<Set<string>> {
  const e = normEmail(email);
  if (!e || eventIds.length === 0) return new Set();
  try {
    const rows = await sequelize.query<{ event_id: string }>(
      `SELECT DISTINCT event_id FROM open_house_registrations
        WHERE lower(email_lower) = :email AND event_id IN (:ids)`,
      { replacements: { email: e, ids: eventIds.map(String) }, type: QueryTypes.SELECT },
    );
    return new Set(rows.map((r) => String(r.event_id)));
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'own_registration_lookup_failed', outcome: 'partial',
      error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message, events: eventIds.length },
    }));
    return new Set();
  }
}

/**
 * Add the people who registered through OUR pages to each event's `signup_count`.
 *
 * ── WHY ──
 *
 * The badge on the portal Events page was Eventbrite's roster alone. On 2026-11-11
 * the Nov 19 Open House read "7 signed up" while eight more people had registered
 * through our own landing page and the training site, with ZERO overlap between
 * the two lists. The number was not wrong about Eventbrite; it was answering a
 * narrower question than the one anyone reading it was asking.
 *
 * ── UNION, NOT SUM ──
 *
 * Someone can be on both lists. Adding the two counts would double-count them, and
 * the overlap being zero today is a fact about today, not a property of the system.
 * So the roster is read and the union taken.
 *
 * The union is computed from the UNWRAPPED roster rather than from CCPP's own
 * `COUNT(DISTINCT Email)`, which counts the raw column: one person stored once as
 * `a@b.com` and once as `'a@b.com',` is two rows to that COUNT and one person to
 * this one. Taking the roster's deduplicated size therefore also removes a latent
 * over-count from the badge.
 *
 * ── NEVER INFLATES ON A FAILED READ ──
 *
 * If the roster cannot be read, the count is left exactly as CCPP reported it. An
 * approximate larger number would be indistinguishable from a real one, and a
 * headcount nobody can trust is worse than a conservative one. Same if the event
 * has no registrations of ours, or if `signup_count` is already unknown: unknown
 * stays unknown.
 */
export async function addOwnRegistrations(events: OpenHouseView[]): Promise<OpenHouseView[]> {
  if (events.length === 0) return events;

  let rows: Array<{ event_id: string; email_lower: string }>;
  try {
    rows = await sequelize.query<{ event_id: string; email_lower: string }>(
      `SELECT event_id, email_lower FROM open_house_registrations WHERE event_id IN (:ids)`,
      { replacements: { ids: events.map((e) => String(e.id)) }, type: QueryTypes.SELECT },
    );
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'own_registrations_count_unavailable', outcome: 'partial',
      error_class: err?.constructor?.name ?? 'Error', context: { message: err?.message },
    }));
    return events;
  }
  if (rows.length === 0) return events;

  const byEvent = new Map<string, Set<string>>();
  for (const r of rows) {
    const id = String(r.event_id);
    if (!byEvent.has(id)) byEvent.set(id, new Set());
    byEvent.get(id)!.add(normEmail(r.email_lower));
  }

  const out: OpenHouseView[] = [];
  for (const e of events) {
    const mine = byEvent.get(String(e.id));
    // No registrations of ours, or Eventbrite's count already unknown: leave it be.
    if (!mine || mine.size === 0 || typeof e.signup_count !== 'number') {
      out.push(e);
      continue;
    }
    try {
      const roster = new Set((await getEventAttendeeEmails(String(e.id))).map(normEmail));
      const extra = [...mine].filter((m) => !roster.has(m)).length;
      out.push({ ...e, signup_count: roster.size + extra });
    } catch (err: any) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
        event: 'signup_union_roster_unavailable', outcome: 'partial',
        error_class: err?.constructor?.name ?? 'Error',
        context: { event_id: String(e.id), message: err?.message, kept: 'eventbrite_count_only' },
      }));
      out.push(e);
    }
  }
  return out;
}
