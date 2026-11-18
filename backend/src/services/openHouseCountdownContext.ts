import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * OH1: what this person has been doing on the platform, in one or two plain
 * sentences, for the countdown prompt (Ali, 2026-11-17: "relate to what they are
 * doing"). Facts only, from the same tables Explorer Growth reads. Empty when there
 * is nothing recorded, and the prompt then says nothing about activity at all.
 */
export interface PlatformActivityFacts {
  assignments_completed: number;
  last_assignment_title: string | null;
  tour_furthest: number | null;
  tour_total: number | null;
  tour_finished: boolean;
}

export function activitySentence(f: PlatformActivityFacts | null): string {
  if (!f) return '';
  const parts: string[] = [];
  if (f.assignments_completed > 0) {
    parts.push(`has completed ${f.assignments_completed} assignment${f.assignments_completed === 1 ? '' : 's'} on the platform`
      + (f.last_assignment_title ? `, most recently "${f.last_assignment_title}"` : ''));
  }
  if (f.tour_finished) parts.push('has finished the campus tour');
  else if (f.tour_furthest && f.tour_total) parts.push(`has started the campus tour (stop ${f.tour_furthest} of ${f.tour_total})`);
  if (parts.length === 0) return 'Has an account but has not completed anything on the platform yet.';
  return `This person ${parts.join(' and ')}.`;
}

/**
 * Everything we know about this person that a call can use, for Maya's voice brief
 * (Ali, 2026-11-17: "It has to be dynamic ... pass in the purpose and all the details
 * and then let it flow"). Facts from our own records only. Each field is null/empty
 * when nothing is recorded, and the brief then leaves that line out rather than guess.
 */
export interface CallFacts {
  signed_up_on: string | null;          // "November 3"
  signup_source: string | null;         // where the account came from
  completed: Array<{ title: string; on: string | null }>; // most recent first, up to 5
  completed_count: number;
  in_progress: string[];                // started, not finished (where they may be stuck), up to 3
  last_active_on: string | null;
  tour: string | null;                  // "finished the campus tour" / "stop 4 of 8"
  title: string | null;
  company: string | null;
  industry: string | null;
  interest: string | null;
  their_note: string | null;            // what they wrote on a form, if anything
}

const centralDay = (d: string | Date | null | undefined): string | null => {
  if (!d) return null;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return x.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric' });
};
const clean = (s: unknown, max = 300): string | null => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/**
 * A sign-up source a person would recognize, or null. Internal labels ("manual_test",
 * campaign codes) must never be read out on a call, so this is an allowlist.
 */
export function sourceLabel(raw: unknown): string | null {
  const s = String(raw ?? '').toLowerCase();
  if (!s) return null;
  if (/facebook|\bfb\b|meta|instagram|\big\b/.test(s)) return 'a Facebook or Instagram ad';
  if (/google|adwords|gclid/.test(s)) return 'Google';
  if (/linkedin/.test(s)) return 'LinkedIn';
  if (/youtube/.test(s)) return 'YouTube';
  if (/tiktok/.test(s)) return 'TikTok';
  if (/eventbrite/.test(s)) return 'Eventbrite';
  if (/referr?al|alumni/.test(s)) return 'a referral';
  return null;
}

/**
 * The real exchanges from `buildConversationHistory`: emails, calls, texts, replies,
 * meetings. Pipeline moves and system rows ("status change", "system") are internal and
 * are dropped. Most recent last, at most `max` lines.
 */
export function meaningfulHistory(history: string, max = 8): string {
  const lines = (history || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const keep = lines.filter((l) => !/—\s*(system|status change)\s*—/i.test(l) && !/^-?\s*\w{3} \d{1,2}: (system|status change)\b/i.test(l));
  return keep.slice(-max).join('\n');
}

export async function gatherCallFacts(email: string, leadId: number | null): Promise<CallFacts> {
  const e = (email || '').trim().toLowerCase();
  const facts: CallFacts = {
    signed_up_on: null, signup_source: null, completed: [], completed_count: 0, in_progress: [],
    last_active_on: null, tour: null, title: null, company: null, industry: null, interest: null, their_note: null,
  };
  if (!e) return facts;
  const [en] = await sequelize.query<{ id: string; created_at: string }>(
    `SELECT id, created_at FROM enrollments WHERE LOWER(email) = :e ORDER BY created_at DESC LIMIT 1`,
    { replacements: { e }, type: QueryTypes.SELECT },
  );
  if (en) {
    facts.signed_up_on = centralDay(en.created_at);
    // Statuses on prod: 'available' (not started; most rows), 'in_progress', 'completed'.
    // Only the last two are activity; an 'available' row says nothing about the person.
    const progress = await sequelize.query<{ title: string; status: string; completed_at: string | null; updated_at: string | null }>(
      `SELECT c.title, p.status, p.completed_at, p.updated_at
         FROM timeline_card_progress p JOIN timeline_cards c ON c.id = p.card_id
        WHERE p.enrollment_id = :id AND p.status IN ('completed', 'in_progress')
        ORDER BY COALESCE(p.completed_at, p.updated_at) DESC NULLS LAST`,
      { replacements: { id: en.id }, type: QueryTypes.SELECT },
    );
    const done = progress.filter((p) => p.status === 'completed');
    facts.completed_count = done.length;
    facts.completed = done.slice(0, 5).map((p) => ({ title: p.title, on: centralDay(p.completed_at) }));
    facts.in_progress = progress.filter((p) => p.status === 'in_progress').slice(0, 3).map((p) => p.title);
    facts.last_active_on = centralDay(progress[0]?.completed_at || progress[0]?.updated_at || null);
    const [tour] = await sequelize.query<{ furthest: number | null; total: number | null; finished: boolean | null }>(
      `SELECT MAX(furthest_stop) AS furthest, MAX(total_stops) AS total, BOOL_OR(finished_at IS NOT NULL) AS finished
         FROM campus_tour_progress WHERE enrollment_id = :id`,
      { replacements: { id: en.id }, type: QueryTypes.SELECT },
    );
    if (tour?.finished) facts.tour = 'finished the campus tour';
    else if (tour?.furthest && tour?.total) facts.tour = `started the campus tour (stop ${tour.furthest} of ${tour.total})`;
  }
  if (leadId != null) {
    const [l] = await sequelize.query<Record<string, unknown>>(
      `SELECT title, company, industry, interest_area, message, source, utm_source FROM leads WHERE id = :id`,
      { replacements: { id: leadId }, type: QueryTypes.SELECT },
    );
    if (l) {
      facts.title = clean(l.title, 80);
      facts.company = clean(l.company, 80);
      facts.industry = clean(l.industry, 80);
      facts.interest = clean(l.interest_area, 80);
      facts.their_note = clean(l.message, 300);
      facts.signup_source = sourceLabel(l.utm_source) || sourceLabel(l.source);
    }
  }
  return facts;
}

export async function describePlatformActivity(email: string): Promise<string> {
  const e = (email || '').trim().toLowerCase();
  if (!e) return '';
  const rows = await sequelize.query<{
    assignments_completed: string; last_assignment_title: string | null;
    tour_furthest: number | null; tour_total: number | null; tour_finished: boolean | null;
  }>(
    `WITH en AS (SELECT id FROM enrollments WHERE LOWER(email) = :email ORDER BY created_at DESC LIMIT 1)
     SELECT
       (SELECT COUNT(*) FROM timeline_card_progress p WHERE p.enrollment_id = (SELECT id FROM en) AND p.status = 'completed')::text AS assignments_completed,
       (SELECT c.title FROM timeline_card_progress p JOIN timeline_cards c ON c.id = p.card_id
          WHERE p.enrollment_id = (SELECT id FROM en) AND p.status = 'completed'
          ORDER BY p.completed_at DESC NULLS LAST LIMIT 1) AS last_assignment_title,
       (SELECT MAX(t.furthest_stop) FROM campus_tour_progress t WHERE t.enrollment_id = (SELECT id FROM en)) AS tour_furthest,
       (SELECT MAX(t.total_stops) FROM campus_tour_progress t WHERE t.enrollment_id = (SELECT id FROM en)) AS tour_total,
       (SELECT BOOL_OR(t.finished_at IS NOT NULL) FROM campus_tour_progress t WHERE t.enrollment_id = (SELECT id FROM en)) AS tour_finished`,
    { replacements: { email: e }, type: QueryTypes.SELECT },
  );
  const r = rows[0];
  if (!r) return '';
  return activitySentence({
    assignments_completed: Number(r.assignments_completed || 0),
    last_assignment_title: r.last_assignment_title,
    tour_furthest: r.tour_furthest,
    tour_total: r.tour_total,
    tour_finished: Boolean(r.tour_finished),
  });
}
