import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ensureCampusActivitySchema } from '../../db/ensureCampusActivitySchema';
import { rankOutreach, type OutreachRow, type OutreachSignals, type OutreachView } from './explorerOutreachRanking';
import { withPersonLinks, type PersonLinks } from './explorerPersonLinks';

/**
 * Explorer Growth tied to the campus (Ali, 2026-10-26): Open House sign-ups, assignments completed, admissions meetings booked,
 * tours taken and how far, who is on campus, and the staff outreach list (explorerOutreachRanking ranks it).
 *
 * READ-ONLY except for ensureCampusActivitySchema, which creates the two campus activity tables if a learner has not yet written to
 * them (IF NOT EXISTS; otherwise this page would 500 on a fresh database). Explorers are the explorer_journey_profiles population, the
 * same set every other Explorer Growth tab counts. Tours and admissions bookings are recorded only from 2026-10-26 (the tables did
 * not exist before); the page says so. Every replacement is a scalar.
 */
export interface CampusActivity {
  explorers: number;
  open_house: { people: number; rsvps: number; last_7_days: number };
  assignments: { completed: number; people: number; last_7_days: number };
  admissions_calls: { booked: number; upcoming: number; cancelled: number; people: number };
  tours: { started: number; finished: number; by_stop: { stop: number; total: number; people: number }[] };
  on_campus: { last_24h: number; last_7_days: number };
  tracked_since: string;
}

/** The day tour progress and campus bookings started being recorded. */
export const CAMPUS_TRACKED_SINCE = '2026-10-26';

const one = async <T extends object>(sql: string): Promise<T | undefined> => (await sequelize.query<T>(sql, { type: QueryTypes.SELECT }))[0];
const n = (v: unknown): number => Number(v ?? 0);

export async function getCampusActivity(): Promise<CampusActivity> {
  await ensureCampusActivitySchema();
  const [explorers, oh, cards, calls, tours, stops, here] = await Promise.all([
    one<{ n: string }>('SELECT COUNT(*) AS n FROM explorer_journey_profiles'),
    one<{ people: string; rsvps: string; week: string }>(
      `SELECT COUNT(DISTINCT e.enrollment_id) AS people, COUNT(*) AS rsvps,
              COUNT(*) FILTER (WHERE e.created_at > NOW() - INTERVAL '7 days') AS week
         FROM student_points_events e JOIN explorer_journey_profiles p ON p.enrollment_id = e.enrollment_id
        WHERE e.event_type = 'open_house_rsvp'`),
    one<{ completed: string; people: string; week: string }>(
      `SELECT COUNT(*) AS completed, COUNT(DISTINCT c.enrollment_id) AS people,
              COUNT(*) FILTER (WHERE c.completed_at > NOW() - INTERVAL '7 days') AS week
         FROM timeline_card_progress c JOIN explorer_journey_profiles p ON p.enrollment_id = c.enrollment_id
        WHERE c.status = 'completed'`),
    one<{ booked: string; upcoming: string; cancelled: string; people: string }>(
      `SELECT COUNT(*) FILTER (WHERE b.status = 'booked') AS booked,
              COUNT(*) FILTER (WHERE b.status = 'booked' AND b.starts_at > NOW()) AS upcoming,
              COUNT(*) FILTER (WHERE b.status = 'cancelled') AS cancelled,
              COUNT(DISTINCT b.enrollment_id) FILTER (WHERE b.status = 'booked') AS people
         FROM campus_admissions_bookings b JOIN explorer_journey_profiles p ON p.enrollment_id = b.enrollment_id`),
    one<{ started: string; finished: string }>(
      `SELECT COUNT(*) AS started, COUNT(*) FILTER (WHERE t.finished_at IS NOT NULL) AS finished
         FROM campus_tour_progress t JOIN explorer_journey_profiles p ON p.enrollment_id = t.enrollment_id
        WHERE t.tour = 'explorer'`),
    sequelize.query<{ stop: number; total: number; people: string }>(
      `SELECT t.furthest_stop AS stop, t.total_stops AS total, COUNT(*) AS people
         FROM campus_tour_progress t JOIN explorer_journey_profiles p ON p.enrollment_id = t.enrollment_id
        WHERE t.tour = 'explorer' GROUP BY 1, 2 ORDER BY 1`, { type: QueryTypes.SELECT }),
    one<{ day: string; week: string }>(
      `SELECT COUNT(*) FILTER (WHERE c.updated_at > NOW() - INTERVAL '24 hours') AS day,
              COUNT(*) FILTER (WHERE c.updated_at > NOW() - INTERVAL '7 days') AS week
         FROM campus_presence c JOIN explorer_journey_profiles p ON p.enrollment_id = c.enrollment_id`),
  ]);
  return {
    explorers: n(explorers?.n),
    open_house: { people: n(oh?.people), rsvps: n(oh?.rsvps), last_7_days: n(oh?.week) },
    assignments: { completed: n(cards?.completed), people: n(cards?.people), last_7_days: n(cards?.week) },
    admissions_calls: { booked: n(calls?.booked), upcoming: n(calls?.upcoming), cancelled: n(calls?.cancelled), people: n(calls?.people) },
    tours: { started: n(tours?.started), finished: n(tours?.finished), by_stop: stops.map((s) => ({ stop: n(s.stop), total: n(s.total), people: n(s.people) })) },
    on_campus: { last_24h: n(here?.day), last_7_days: n(here?.week) },
    tracked_since: CAMPUS_TRACKED_SINCE,
  };
}

const SIGNALS_SQL = `
  WITH rsvp AS (SELECT enrollment_id, COUNT(*) AS n, MAX(created_at) AS last FROM student_points_events
                 WHERE event_type = 'open_house_rsvp' GROUP BY 1),
       cards AS (SELECT enrollment_id, COUNT(*) AS n, MAX(completed_at) AS last FROM timeline_card_progress
                  WHERE status = 'completed' GROUP BY 1),
       calls AS (SELECT enrollment_id, COUNT(*) FILTER (WHERE status = 'booked') AS n,
                        MIN(starts_at) FILTER (WHERE status = 'booked' AND starts_at > NOW()) AS next_call
                   FROM campus_admissions_bookings GROUP BY 1),
       tours AS (SELECT enrollment_id, MAX(furthest_stop) AS furthest, MAX(total_stops) AS total,
                        BOOL_OR(finished_at IS NOT NULL) AS finished FROM campus_tour_progress GROUP BY 1),
       community AS (SELECT enrollment_id, MAX(last_active_at) AS last FROM community_members GROUP BY 1),
       -- A HUMAN contacted them, per portal records (the Growth Journey rule, conversationOwnershipService): a staff-authored call,
       -- meeting or note, or Ali's personal outreach. explorer_journey_profiles.last_contacted_at has no writer; GHL's own call /
       -- text / email history needs the GHL v2 Conversations API, which this integration does not have yet (see the PR).
       human AS (SELECT lead_id, MAX(created_at) AS last FROM activities
                  WHERE admin_user_id IS NOT NULL AND type IN ('call', 'meeting', 'note') GROUP BY 1),
       personal AS (SELECT lead_id, MAX(created_at) AS last FROM communication_logs
                     WHERE direction = 'outbound' AND metadata->>'trigger' = 'ali_personal_outreach' GROUP BY 1)
  SELECT p.enrollment_id, p.email_normalized AS email, e.full_name AS name, p.primary_state, p.overlays,
         p.e_score, p.i_score, GREATEST(p.last_contacted_at, h.last, o.last) AS last_contacted_at,
         COALESCE(r.n, 0) AS rsvps, COALESCE(c.n, 0) AS cards, COALESCE(k.n, 0) AS calls, k.next_call,
         t.furthest AS tour_furthest, t.total AS tour_total, COALESCE(t.finished, false) AS tour_finished,
         GREATEST(cp.updated_at, cm.last, c.last, r.last) AS last_seen
    FROM explorer_journey_profiles p
    JOIN enrollments e ON e.id = p.enrollment_id
    LEFT JOIN rsvp r ON r.enrollment_id = p.enrollment_id
    LEFT JOIN cards c ON c.enrollment_id = p.enrollment_id
    LEFT JOIN calls k ON k.enrollment_id = p.enrollment_id
    LEFT JOIN tours t ON t.enrollment_id = p.enrollment_id
    LEFT JOIN campus_presence cp ON cp.enrollment_id = p.enrollment_id
    LEFT JOIN community cm ON cm.enrollment_id = p.enrollment_id
    LEFT JOIN human h ON h.lead_id = p.lead_id
    LEFT JOIN personal o ON o.lead_id = p.lead_id`;

type RawSignals = Omit<OutreachSignals, 'e_score' | 'i_score' | 'cards' | 'rsvps' | 'calls' | 'tour_furthest' | 'tour_total' | 'next_call' | 'last_seen' | 'last_contacted_at'> & {
  e_score: unknown; i_score: unknown; cards: unknown; rsvps: unknown; calls: unknown; tour_furthest: unknown; tour_total: unknown;
  next_call: Date | string | null; last_seen: Date | string | null; last_contacted_at: Date | string | null;
};
const iso = (v: Date | string | null): string | null => (v === null || v === undefined ? null : new Date(v).toISOString());

export function toSignals(r: RawSignals): OutreachSignals {
  return {
    enrollment_id: r.enrollment_id, email: r.email, name: r.name ?? null, primary_state: r.primary_state, overlays: r.overlays ?? [],
    e_score: n(r.e_score), i_score: n(r.i_score), cards: n(r.cards), rsvps: n(r.rsvps), calls: n(r.calls),
    next_call: iso(r.next_call), tour_furthest: r.tour_furthest === null ? null : n(r.tour_furthest),
    tour_total: r.tour_total === null ? null : n(r.tour_total), tour_finished: r.tour_finished === true,
    last_seen: iso(r.last_seen), last_contacted_at: iso(r.last_contacted_at),
  };
}

export async function getOutreach(view: OutreachView, limit: number, now = Date.now()): Promise<{ view: OutreachView; rows: (OutreachRow & PersonLinks)[]; tracked_since: string }> {
  await ensureCampusActivitySchema();
  const raw = await sequelize.query<RawSignals>(SIGNALS_SQL, { type: QueryTypes.SELECT });
  // The 360 and GHL links for the ranked page only (the GHL lookup is per person)
  const rows = await withPersonLinks(rankOutreach(raw.map(toSignals), view, limit, now));
  return { view, rows, tracked_since: CAMPUS_TRACKED_SINCE };
}
