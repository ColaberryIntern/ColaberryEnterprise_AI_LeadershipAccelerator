import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import type { SnackbarConfig } from './landingPageSnackbar';

/**
 * What a landing page's snack bar is allowed to say, built from REAL rows only.
 *
 * NOTHING IS INVENTED. No sample names, no padded counts, no "random recent" fallback. If there
 * were no signups in the window, the feed is empty and the page shows no bar. That is the same
 * rule the page builder follows ("nothing is invented"), and it is what keeps this on the right
 * side of the FTC's rules on fake social proof.
 *
 * NOTHING IDENTIFYING LEAVES THE SERVER. The composer below turns rows into finished strings
 * before they reach the response: first name + last initial at most, city at most, never an
 * email, surname, lead id or timestamp precise enough to re-identify someone.
 *
 * Failure: the route catches any error from here, logs it with an error_class, and returns
 * `{ events: [] }`. A broken feed costs the page its snack bar, never the page itself.
 */

export interface SnackbarFeedEvent {
  kind: 'signup' | 'module_started' | 'daily_count';
  initials: string;
  title: string;
  action: string;
  /** Rounded so it cannot be joined back to an exact signup time. */
  ago_minutes: number | null;
}

export interface SignupRow {
  name: string | null;
  city: string | null;
  opted_in: boolean;
  created_at: Date;
}

const MAX_EVENTS = 12;

/** "Jordan Reyes" -> { first: "Jordan", initial: "R" }. Anything odd yields nulls. */
export function splitName(full: string | null): { first: string | null; initial: string | null } {
  if (!full) return { first: null, initial: null };
  const parts = full.trim().split(/\s+/).filter((p) => /^[\p{L}'-]{1,40}$/u.test(p));
  if (!parts.length) return { first: null, initial: null };
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  const initial = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : null;
  return { first, initial };
}

function cleanCity(city: string | null): string | null {
  if (!city) return null;
  const c = city.trim();
  return /^[\p{L} .'-]{2,60}$/u.test(c) ? c : null;
}

/** Round "how long ago" to buckets so the bar cannot pin an exact signup time. */
export function roundedAgo(createdAt: Date, now: Date): number {
  const mins = Math.max(0, Math.round((now.getTime() - createdAt.getTime()) / 60000));
  if (mins < 2) return 0;
  if (mins < 60) return Math.round(mins / 5) * 5 || 2;
  return Math.round(mins / 60) * 60;
}

/** Pure: rows in, public strings out. Unit-tested without a database. */
export function composeSignupEvents(rows: SignupRow[], config: SnackbarConfig, now: Date): SnackbarFeedEvent[] {
  const events: SnackbarFeedEvent[] = [];
  for (const row of rows) {
    const city = cleanCity(row.city);
    const { first, initial } = splitName(row.name);
    if (config.name_format === 'opted_in_only' && !row.opted_in) continue;
    const named = config.name_format !== 'city_only' && row.opted_in && first;
    let title: string;
    let initials: string;
    if (named) {
      title = initial ? `${first} ${initial}.` : String(first);
      if (city) title += ` from ${city}`;
      initials = `${first!.charAt(0)}${initial ?? ''}`;
    } else if (city) {
      title = `Someone in ${city}`;
      initials = city.charAt(0).toUpperCase();
    } else {
      continue; // No name allowed and no city: nothing honest and useful to say. Skip the row.
    }
    events.push({
      kind: 'signup',
      initials,
      title,
      // NOT "a free account": 40 TAC 807.172(d) forbids advertising training as free, and this
      // string renders on a public landing page. The kit shipped the banned phrasing; the
      // backend copy ratchet caught it. House phrasings are "$0 to start" and "No card needed".
      action: 'just created an account',
      ago_minutes: roundedAgo(row.created_at, now),
    });
    if (events.length >= MAX_EVENTS) break;
  }
  return events;
}

export function composeDailyCount(countToday: number, config: SnackbarConfig): SnackbarFeedEvent | null {
  if (!config.events.includes('daily_count') || countToday < config.daily_min) return null;
  return {
    kind: 'daily_count',
    initials: String(countToday),
    title: `${countToday} people started learning today`,
    action: 'Join them, it takes under a minute',
    ago_minutes: null,
  };
}

/**
 * Raw SQL because this is a three-table join with a lateral pick of one visitor per lead, which
 * the models cannot express without N+1. Results are typed at the call site per backend/CLAUDE.md.
 * Brand is derived via leads.source_id -> lead_sources.brand_id, the same derivation
 * freeSignupService documents ("Origin brand is DERIVED").
 */
export async function loadRecentSignups(brandId: string, windowHours: number): Promise<SignupRow[]> {
  return sequelize.query<SignupRow>(
    `SELECT l.name, v.city, COALESCE(l.social_proof_opt_in, false) AS opted_in, l.created_at
       FROM leads l
       JOIN lead_sources ls ON ls.id = l.source_id
       LEFT JOIN LATERAL (
         SELECT city FROM visitors WHERE lead_id = l.id AND city IS NOT NULL
         ORDER BY created_at DESC LIMIT 1
       ) v ON true
      WHERE ls.brand_id = :brandId
        AND l.created_at >= NOW() - (:windowHours || ' hours')::interval
      ORDER BY l.created_at DESC
      LIMIT 40`,
    { replacements: { brandId, windowHours: String(windowHours) }, type: QueryTypes.SELECT },
  );
}

export async function countSignupsToday(brandId: string, timezone: string): Promise<number> {
  const rows = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM leads l JOIN lead_sources ls ON ls.id = l.source_id
      WHERE ls.brand_id = :brandId
        AND (l.created_at AT TIME ZONE :tz)::date = (NOW() AT TIME ZONE :tz)::date`,
    { replacements: { brandId, tz: timezone }, type: QueryTypes.SELECT },
  );
  return Number(rows[0]?.n ?? 0);
}

export async function buildSnackbarFeed(
  brand: { id: string; timezone: string | null },
  config: SnackbarConfig,
  now: Date = new Date(),
): Promise<SnackbarFeedEvent[]> {
  const out: SnackbarFeedEvent[] = [];
  if (config.events.includes('signup')) {
    out.push(...composeSignupEvents(await loadRecentSignups(brand.id, config.window_hours), config, now));
  }
  // 'module_started' is phase 2: see IMPLEMENTATION.md step 7. Until it is wired to
  // lesson_instances it contributes nothing, rather than something made up.
  const daily = composeDailyCount(await countSignupsToday(brand.id, brand.timezone ?? 'America/Chicago'), config);
  if (daily) out.splice(Math.min(2, out.length), 0, daily);
  return out.slice(0, MAX_EVENTS);
}
