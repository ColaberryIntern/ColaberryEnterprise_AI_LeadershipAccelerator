import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { sourceLabel } from './openHouseCountdownContext';

/**
 * OH1d (Ali, 2026-11-17): "What is passing in their 360 profile? ... Nothing personal in there.
 * Nothing about their activity or what they've shown interest in."
 *
 * The person's profile for Maya's Open House messages, built from the same tables the admin
 * 360 view (adminOs/personProfileService) reads, and rendered as labelled sections the model
 * can actually digest, not one summary sentence.
 *
 * WHY THESE FIELDS. Measured on the Nov 19 registrants (183): what people TYPED about
 * themselves is nearly empty (title 1, company 2, interest 4, message 1), while what they DID is
 * rich: 137 have tracked portal sessions, 100 opened lessons, 80 have a campus location, 55 earned
 * points, 54 completed lessons, 133 have an intent level. The first version read only completed
 * lessons and the campus tour, so 101 people with real activity were described as "has not
 * completed anything".
 *
 * Each section is fetched on its own and a failure is logged and leaves only that section out,
 * so one bad query never blanks the whole profile (and never hides as "no activity").
 */

export interface PersonProfile {
  first_name: string | null;
  signed_up_on: string | null;
  signup_source: string | null;
  stage: string | null;                    // plain words, from explorer_journey_profiles.primary_state
  days_since_last_activity: number | null;
  completed: Array<{ title: string; on: string | null }>;   // most recent first, up to 5
  completed_count: number;
  opened_not_finished: string[];           // lessons opened in the portal but not completed, up to 3
  portal_areas: string[];                  // e.g. "the Today page", "the community"
  sessions: number;
  last_visit_on: string | null;
  videos_played: number;
  campus_area: string | null;              // where they last were on campus
  tour: string | null;
  knowledge_checks: number;
  streak_days: number;
  points: number;
  live_sessions_attended: number;
  community_last_active_on: string | null;
  title: string | null;
  company: string | null;
  industry: string | null;
  interest: string | null;
  their_note: string | null;
  goal: string | null;
  intent_level: string | null;             // for tone only; never quoted to the person
  unavailable: string[];                   // sections whose query failed
}

const CAMPUS_AREA_NAMES: Record<string, string> = {
  lecture: 'the Classroom', library: 'the Library', tower: 'the Schedule tower', studio: 'the Project Studio',
  amphi: 'the Events Hall', testing: 'the Cert Prep Center', observatory: 'My Progress', commons: 'the Meeting Rooms',
  gallery: 'the Showcase Gallery', career: 'the Career Center', arcade: 'the Game Room', gate: 'the Main Gate',
  admissions: 'Admissions', chow: 'the Chow Hall',
};

const PORTAL_AREAS: Array<[RegExp, string]> = [
  [/^\/portal\/today/, 'the Today page'],
  [/^\/portal\/classroom/, 'the classroom'],
  [/^\/portal\/community/, 'the community'],
  [/^\/portal\/campus/, 'the campus'],
  [/^\/portal\/path/, 'their learning path'],
  [/^\/portal\/rooms\//, 'a campus room'],
  [/^\/portal\/runtime\//, 'lessons'],
];

/** Plain words for the journey stage. Unknown states are left out rather than guessed. */
export function stageLabel(primaryState: string | null | undefined): string | null {
  switch (String(primaryState || '').toUpperCase()) {
    case 'NOT_STARTED': return 'signed up but has not started on the platform yet';
    case 'NEW_EXPLORER': return 'new to the platform and exploring';
    case 'ACTIVE_LEARNER': return 'actively learning on the platform';
    case 'CONVERTED': return 'already enrolled in the program';
    default: return null;
  }
}

const day = (d: unknown): string | null => {
  if (!d) return null;
  const x = new Date(String(d));
  return Number.isNaN(x.getTime()) ? null : x.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric' });
};
const clean = (s: unknown, max = 200): string | null => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

export function emptyProfile(): PersonProfile {
  return {
    first_name: null, signed_up_on: null, signup_source: null, stage: null, days_since_last_activity: null,
    completed: [], completed_count: 0, opened_not_finished: [], portal_areas: [], sessions: 0, last_visit_on: null,
    videos_played: 0, campus_area: null, tour: null, knowledge_checks: 0, streak_days: 0, points: 0,
    live_sessions_attended: 0, community_last_active_on: null, title: null, company: null, industry: null,
    interest: null, their_note: null, goal: null, intent_level: null, unavailable: [],
  };
}

async function q<T extends object>(sql: string, replacements: Record<string, unknown>): Promise<T[]> {
  return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
}

/** Everything we hold on this person that a message can use. Never throws. */
export async function gatherPersonProfile(email: string, leadId: number | null, firstName: string | null = null): Promise<PersonProfile> {
  const p = emptyProfile();
  p.first_name = firstName;
  const e = (email || '').trim().toLowerCase();
  if (!e) return p;

  const section = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (err: any) {
      p.unavailable.push(name);
      console.error(`[OpenHouseProfile] ${name} unavailable:`, err?.message);
    }
  };

  let enrollmentId: string | null = null;
  await section('account', async () => {
    const [en] = await q<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM enrollments WHERE LOWER(email) = :e ORDER BY created_at DESC LIMIT 1`, { e });
    if (en) { enrollmentId = en.id; p.signed_up_on = day(en.created_at); }
  });

  if (leadId != null) {
    await section('about', async () => {
      const [l] = await q<Record<string, unknown>>(
        `SELECT title, company, industry, interest_area, message, source, utm_source FROM leads WHERE id = :id`, { id: leadId });
      if (l) {
        p.title = clean(l.title, 80); p.company = clean(l.company, 80); p.industry = clean(l.industry, 80);
        p.interest = clean(l.interest_area, 80); p.their_note = clean(l.message, 300);
        p.signup_source = sourceLabel(l.utm_source) || sourceLabel(l.source);
      }
    });
    await section('intent', async () => {
      const [i] = await q<{ intent_level: string | null }>(
        `SELECT intent_level FROM intent_scores WHERE lead_id = :id ORDER BY score_updated_at DESC NULLS LAST LIMIT 1`, { id: leadId });
      p.intent_level = clean(i?.intent_level, 20);
    });
    await section('portal visits', async () => {
      const rows = await q<{ path: string; n: string; last: string }>(
        `SELECT pe.page_path AS path, COUNT(*)::text AS n, MAX(pe.created_at)::text AS last
           FROM page_events pe JOIN visitors v ON v.id = pe.visitor_id
          WHERE v.lead_id = :id AND pe.event_type = 'pageview' AND pe.page_path LIKE '/portal/%'
          GROUP BY pe.page_path`, { id: leadId });
      const areas = new Set<string>();
      let last = '';
      for (const r of rows) {
        for (const [re, label] of PORTAL_AREAS) if (re.test(r.path)) { areas.add(label); break; }
        if (r.last > last) last = r.last;
      }
      p.portal_areas = [...areas];
      p.last_visit_on = day(last || null);
      const [s] = await q<{ n: string; vids: string }>(
        `SELECT (SELECT COUNT(*) FROM visitor_sessions s JOIN visitors v ON v.id = s.visitor_id WHERE v.lead_id = :id)::text AS n,
                (SELECT COUNT(*) FROM page_events pe JOIN visitors v ON v.id = pe.visitor_id WHERE v.lead_id = :id AND pe.event_type = 'media_play')::text AS vids`,
        { id: leadId });
      p.sessions = Number(s?.n || 0);
      p.videos_played = Number(s?.vids || 0);
    });
  }

  if (enrollmentId) {
    const en = enrollmentId;
    await section('lessons', async () => {
      const done = await q<{ id: string; title: string; completed_at: string | null }>(
        `SELECT c.id::text AS id, c.title, p.completed_at FROM timeline_card_progress p JOIN timeline_cards c ON c.id = p.card_id
          WHERE p.enrollment_id = :en AND p.status = 'completed' ORDER BY p.completed_at DESC NULLS LAST`, { en });
      p.completed_count = done.length;
      p.completed = done.slice(0, 5).map((d) => ({ title: d.title, on: day(d.completed_at) }));
      if (leadId != null) {
        const doneIds = new Set(done.map((d) => d.id));
        const opened = await q<{ id: string; title: string; last: string }>(
          `SELECT c.id::text AS id, c.title, MAX(pe.created_at)::text AS last
             FROM page_events pe JOIN visitors v ON v.id = pe.visitor_id
             JOIN timeline_cards c ON c.id::text = substring(pe.page_path from '/portal/runtime/([0-9a-f-]{36})')
            WHERE v.lead_id = :id AND pe.page_path LIKE '/portal/runtime/%'
            GROUP BY c.id, c.title ORDER BY 3 DESC`, { id: leadId });
        p.opened_not_finished = opened.filter((o) => !doneIds.has(o.id)).slice(0, 3).map((o) => o.title);
      }
    });
    await section('journey', async () => {
      const [j] = await q<{ primary_state: string | null; days_since_last_activity: number | null }>(
        `SELECT primary_state, days_since_last_activity FROM explorer_journey_profiles WHERE enrollment_id = :en LIMIT 1`, { en });
      p.stage = stageLabel(j?.primary_state);
      p.days_since_last_activity = j?.days_since_last_activity ?? null;
    });
    await section('campus', async () => {
      const [c] = await q<{ area: string | null }>(`SELECT area FROM campus_presence WHERE enrollment_id = :en ORDER BY updated_at DESC LIMIT 1`, { en });
      p.campus_area = c?.area ? (CAMPUS_AREA_NAMES[c.area] || null) : null;
      const [t] = await q<{ furthest: number | null; total: number | null; finished: boolean | null }>(
        `SELECT MAX(furthest_stop) AS furthest, MAX(total_stops) AS total, BOOL_OR(finished_at IS NOT NULL) AS finished
           FROM campus_tour_progress WHERE enrollment_id = :en`, { en });
      if (t?.finished) p.tour = 'finished the campus tour';
      else if (t?.furthest && t?.total) p.tour = `started the campus tour (stop ${t.furthest} of ${t.total})`;
    });
    await section('momentum', async () => {
      const [m] = await q<{ kc: string; streak: string; pts: string; attended: string }>(
        `SELECT (SELECT COUNT(*) FROM student_points_events WHERE enrollment_id = :en AND event_type = 'knowledge_check')::text AS kc,
                (SELECT COUNT(*) FROM student_points_events WHERE enrollment_id = :en AND event_type = 'daily_streak')::text AS streak,
                (SELECT COALESCE(SUM(points), 0) FROM student_points_events WHERE enrollment_id = :en)::text AS pts,
                (SELECT COUNT(*) FROM attendance_records WHERE enrollment_id = :en AND status::text IN ('present', 'late'))::text AS attended`,
        { en });
      p.knowledge_checks = Number(m?.kc || 0);
      p.streak_days = Number(m?.streak || 0);
      p.points = Number(m?.pts || 0);
      p.live_sessions_attended = Number(m?.attended || 0);
      const [cm] = await q<{ last_active_at: string | null }>(`SELECT last_active_at FROM community_members WHERE enrollment_id = :en LIMIT 1`, { en });
      p.community_last_active_on = day(cm?.last_active_at);
      const [g] = await q<{ goal: string | null; role: string | null }>(`SELECT goal, role FROM user_curriculum_profiles WHERE enrollment_id = :en LIMIT 1`, { en });
      p.goal = clean(g?.goal, 200);
      if (!p.title) p.title = clean(g?.role, 80);
    });
  }
  return p;
}

const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * The profile as the model reads it: labelled sections of plain facts, each line a thing the
 * message may use. Sections with nothing in them are left out entirely, so the model is never
 * tempted to fill a gap.
 */
export function renderPersonProfile(p: PersonProfile): string {
  const out: string[] = [];
  const sec = (title: string, lines: Array<string | null | false | undefined>) => {
    const keep = lines.filter((l): l is string => !!l);
    if (keep.length) out.push(`${title}\n${keep.map((l) => `- ${l}`).join('\n')}`);
  };
  sec('WHO THEY ARE', [
    p.first_name && `First name: ${p.first_name}`,
    (p.title || p.company) && `Works as ${[p.title, p.company].filter(Boolean).join(' at ')}${p.industry ? ` (${p.industry})` : ''}`,
    p.goal && `Their goal, in their words: "${p.goal}"`,
    p.interest && `Said they are interested in: ${p.interest}`,
    p.their_note && `What they wrote to us: "${p.their_note}"`,
  ]);
  sec('HOW THEY FOUND US', [
    p.signed_up_on && `Created their Colaberry account on ${p.signed_up_on}`,
    p.signup_source && `Came in through ${p.signup_source}`,
  ]);
  sec('WHAT THEY HAVE DONE ON THE PLATFORM', [
    p.stage && `Stage: ${p.stage}`,
    p.completed_count > 0 && `Completed ${p.completed_count} lesson${p.completed_count === 1 ? '' : 's'}. Most recent: ${p.completed.map((c) => `"${c.title}"${c.on ? ` (${c.on})` : ''}`).join(', ')}`,
    p.opened_not_finished.length > 0 && `Opened but has not finished: ${p.opened_not_finished.map((t) => `"${t}"`).join(', ')}. A natural place to offer help or suggest asking about it live`,
    p.portal_areas.length > 0 && `Has visited ${list(p.portal_areas)}`,
    p.campus_area && `Was last on campus in ${p.campus_area}`,
    p.tour && `Has ${p.tour}`,
    p.videos_played > 0 && `Played ${p.videos_played} video${p.videos_played === 1 ? '' : 's'}`,
    p.knowledge_checks > 0 && `Passed ${p.knowledge_checks} knowledge check${p.knowledge_checks === 1 ? '' : 's'}`,
    p.live_sessions_attended > 0 && `Attended ${p.live_sessions_attended} live session${p.live_sessions_attended === 1 ? '' : 's'}`,
  ]);
  sec('MOMENTUM', [
    p.sessions > 0 && `Visited ${p.sessions} time${p.sessions === 1 ? '' : 's'}${p.last_visit_on ? `, most recently on ${p.last_visit_on}` : ''}`,
    p.streak_days > 0 && `Kept a daily learning streak on ${p.streak_days} day${p.streak_days === 1 ? '' : 's'}`,
    p.points > 0 && `Has earned ${p.points} points`,
    p.community_last_active_on && `Last active in the community on ${p.community_last_active_on}`,
    p.days_since_last_activity != null && p.days_since_last_activity >= 7 && `Has been quiet for ${p.days_since_last_activity} days`,
  ]);
  sec('FOR YOUR TONE ONLY (never mention this to them)', [
    p.intent_level && `Interest level from their behavior: ${p.intent_level}`,
  ]);
  if (out.length === 0 || (out.length === 1 && out[0].startsWith('WHO THEY ARE') && !p.signed_up_on)) {
    return 'We have no recorded activity or background for this person yet. Do not guess. Write a warm message that makes them feel expected and invites them to bring a question.';
  }
  return out.join('\n\n');
}
