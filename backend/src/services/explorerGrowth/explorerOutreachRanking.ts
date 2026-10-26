/**
 * Who staff should reach out to, and who is most engaged (Explorer Growth, Ali 2026-10-26: "an easy way for the human staff to know
 * who they should be reaching out to and who are the most engaged customers"). PURE: rows in, ranked rows with plain reasons out, so
 * the ranking is tested without a database (explorerCampusService reads the rows).
 *
 * Every number comes from a recorded fact (no invented signal):
 *   cards       completed assignment cards (timeline_card_progress)
 *   rsvps       Open House "Save my seat" (student_points_events open_house_rsvp)
 *   calls       admissions calls booked from the campus (campus_admissions_bookings, since 2026-10-26), next_call the next one
 *   tour        furthest stop of total, finished (campus_tour_progress, since 2026-10-26)
 *   e/i scores  the Explorer Growth engagement and intent scores; HIGH_INTENT / DORMANT overlays
 *   last_seen   the latest of campus presence, community activity, a completed card or an RSVP
 *
 * MOST ENGAGED: everyone, by an engagement score (cards x3, RSVPs x8, calls x12, a finished tour 10 or 1 per stop reached, E/5, and
 * 10 if seen in the last day or 5 in the last week).
 * REACH OUT NOW: not converted, no call already coming up, not contacted in the last 7 days, and seen in the last 14 days (someone
 * gone longer is a re-engagement campaign, not a call list); by intent (I, RSVPs x10, a finished tour 8, cards x2, HIGH_INTENT 20,
 * the same recency bonus). Ties break on the email, so the order is stable.
 */
export type OutreachView = 'reach_out' | 'engaged';

export interface OutreachSignals {
  enrollment_id: string;
  email: string;
  name: string | null;
  primary_state: string;
  overlays: string[];
  e_score: number;
  i_score: number;
  cards: number;
  rsvps: number;
  calls: number;
  next_call: string | null;
  tour_furthest: number | null;
  tour_total: number | null;
  tour_finished: boolean;
  last_seen: string | null;
  last_contacted_at: string | null;
}

export interface OutreachRow extends OutreachSignals { score: number; reasons: string[] }

const DAY = 24 * 60 * 60 * 1000;
const daysSince = (iso: string | null, now: number): number | null => (iso ? Math.floor((now - new Date(iso).getTime()) / DAY) : null);
const recency = (seen: number | null): number => (seen === null ? 0 : seen <= 1 ? 10 : seen <= 7 ? 5 : 0);
const shortDate = (iso: string): string => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function engagementScore(s: OutreachSignals, now: number): number {
  const tour = s.tour_finished ? 10 : s.tour_furthest ?? 0;
  return s.cards * 3 + s.rsvps * 8 + s.calls * 12 + tour + Math.round(s.e_score / 5) + recency(daysSince(s.last_seen, now));
}

export function intentScore(s: OutreachSignals, now: number): number {
  return s.i_score + s.rsvps * 10 + (s.tour_finished ? 8 : 0) + s.cards * 2 + (s.overlays.includes('HIGH_INTENT') ? 20 : 0) + recency(daysSince(s.last_seen, now));
}

/** Reach out now: who qualifies (see the header). */
export function reachOutCandidate(s: OutreachSignals, now: number): boolean {
  if (s.primary_state === 'CONVERTED') return false;
  if (s.next_call && new Date(s.next_call).getTime() > now) return false;
  const contacted = daysSince(s.last_contacted_at, now);
  if (contacted !== null && contacted < 7) return false;
  const seen = daysSince(s.last_seen, now);
  return seen !== null && seen <= 14;
}

/** The plain-English why, most important first. */
export function reasonsFor(s: OutreachSignals, now: number): string[] {
  const out: string[] = [];
  if (s.next_call && new Date(s.next_call).getTime() > now) out.push(`Admissions call booked for ${shortDate(s.next_call)}`);
  else if (s.calls > 0) out.push('Booked an admissions call before');
  if (s.overlays.includes('HIGH_INTENT')) out.push('High intent');
  if (s.rsvps > 0) out.push(s.rsvps === 1 ? "RSVP'd to an Open House" : `RSVP'd to ${s.rsvps} Open Houses`);
  if (s.tour_finished) out.push('Finished the campus tour');
  else if (s.tour_furthest && s.tour_total) out.push(`Campus tour: stop ${s.tour_furthest} of ${s.tour_total}`);
  if (s.cards > 0) out.push(`Completed ${plural(s.cards, 'assignment', 'assignments')}`);
  const seen = daysSince(s.last_seen, now);
  if (seen !== null) out.push(seen <= 0 ? 'Active today' : seen === 1 ? 'Active yesterday' : `Last active ${seen} days ago`);
  const contacted = daysSince(s.last_contacted_at, now);
  out.push(contacted === null ? 'Not contacted yet' : `Last contacted ${contacted === 0 ? 'today' : `${contacted} days ago`}`);
  return out;
}

export function rankOutreach(rows: OutreachSignals[], view: OutreachView, limit: number, now: number): OutreachRow[] {
  const pool = view === 'reach_out' ? rows.filter((r) => reachOutCandidate(r, now)) : rows;
  const score = view === 'reach_out' ? intentScore : engagementScore;
  return pool
    .map((r) => ({ ...r, score: score(r, now), reasons: reasonsFor(r, now) }))
    .sort((a, b) => b.score - a.score || a.email.localeCompare(b.email))
    .slice(0, limit);
}
