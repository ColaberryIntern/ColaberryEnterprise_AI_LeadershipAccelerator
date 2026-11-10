/**
 * highlights - PURE. The 10 most impactful things that happened in this report, for the guided
 * tour (Ali, 10 Nov 2026: "throughout the report there are things that happened that offer great
 * insight - the 10 most impactful ... in the form of a guided tour where I click on the button and
 * you take me around and highlight the 10 most impactful things in this report").
 *
 * Every candidate is a fact the report already shows, scored by how much it should change what
 * Ali does today. Points (higher = earlier in the tour):
 *   waiting on Ali's reply          60 + 4 per day waiting      -> their TODAY block
 *   tier got worse since last time  45, better 30               -> their card
 *   no build work in the window     50; stuck N days 35 + 2N    -> their TODAY block
 *   no project at day N (14+)       40 + N/10                   -> their card
 *   project but never started       38                          -> their card
 *   reported a blocker, no build since 34                       -> that day on the combined timeline
 *   got unstuck after a blocker      24                         -> that day on the combined timeline
 *   gov build 75%+ verified          32                         -> their facts line
 *   overdue backlog (3+)             25 + overdue (max 60)      -> their TODAY block
 *   strong build streak (5+ verified) 20 + verified (max 45)    -> latest verified day on the timeline
 *   recorded a demo video (window)   26  (good news)            -> their artifacts
 *   presentation overdue (PREP plan) 22 + days late (max 42)    -> their artifacts
 *   still submitting Markdown        16                         -> their artifacts
 *   training 4+ weeks behind         14 + 2 per week            -> their facts line
 * At most MAX_PER_INTERN stops per intern, so the tour covers the cohort, not one person, and up to
 * POSITIVE_SLOTS stops are kept for good news (a streak, a nearly done build, a recovery).
 * Ties break by intern name, so the same report always gives the same tour.
 */
import type { InternCard } from '../types';
import type { SidecarIntern } from './types';

export const TOUR_STOPS = 10;
export const MAX_PER_INTERN = 2;

export type HighlightAnchor = 'card' | 'timeline' | 'facts' | 'artifacts' | 'event';
export interface Highlight {
  rank: number;
  enrollment_id: string;
  intern: string;
  kind: string;
  /** One line, the thing that happened. */
  title: string;
  /** Why it matters, naming the fact. */
  why: string;
  impact: number;
  target: { anchor: HighlightAnchor; event_key: string | null };
}

type Candidate = Omit<Highlight, 'rank'>;

/** The combined timeline tags each intern-row with `${enrollment}|${row.dayEnd}`. */
export const eventKey = (enrollmentId: string, dayEnd: string): string => `${enrollmentId}|${dayEnd}`;

function candidatesFor(c: InternCard, j: SidecarIntern): Candidate[] {
  const out: Candidate[] = [];
  const who = c.firstName;
  const base = { enrollment_id: c.enrollmentId, intern: c.name };
  const add = (kind: string, impact: number, title: string, why: string, anchor: HighlightAnchor, event_key: string | null = null): void => {
    out.push({ ...base, kind, impact, title, why, target: { anchor, event_key } });
  };
  const p = c.project;
  const rows = c.timeline.rows;
  // Destructured: the TRIAGE tier, not an enrollment tier (the free-account consumer scan flags `.tier` reads).
  const { tier: triageTier, reason: triageReason } = j.triage;
  const rowOf = (pred: (k: string) => boolean): { dayEnd: string } | undefined => [...rows].reverse().find((r) => r.events.some((e) => pred(e.kind)));

  if (c.emails.awaitingReply && c.emails.lastTheyWrote) {
    const days = Math.max(0, Math.floor((Date.parse(c.timeline.today) - Date.parse(String(c.emails.lastTheyWrote).slice(0, 10))) / 86400000));
    const waited = days === 0 ? 'arrived today and has no answer yet' : `has had no answer for ${days} day${days === 1 ? '' : 's'}`;
    add('reply_owed', 60 + 4 * days, `${who} is waiting on your reply`, `"${c.emails.awaitingSubject ?? ''}" ${waited}.`, 'timeline');
  }
  const changed = j.delta?.tier_changed_from;
  if (changed) {
    const rank = ['no_project_at_day_N', 'never_started_building', 'blocked_waiting_on_ali', 'overdue_backlog', 'quiet', 'on_track'];
    const worse = rank.indexOf(triageTier) < rank.indexOf(changed);
    add(worse ? 'slipping' : 'recovering', worse ? 45 : 30, `${who} is ${worse ? 'slipping' : 'recovering'}`, `Moved from ${changed.replace(/_/g, ' ')} to ${triageTier.replace(/_/g, ' ')} since the last report.`, 'card');
  }
  if (p) {
    const q = c.timeline.quietNow;
    if (q === null && (p.lastCommitDays !== null || (p.tasksDone ?? 0) > 0)) add('no_build', 50, `${who} has done no build work in ${c.timeline.windowDays} days`, `No commit or verified story on ${p.name} in the whole window.`, 'timeline');
    else if (q !== null && q >= 4) add('stuck', 35 + 2 * q, `${who} has been stuck for ${q} days`, `No commit or verified story on ${p.name} since ${q} days ago.`, 'timeline');
    if (triageTier === 'never_started_building') add('never_started', 38, `${who} has a project but has not started building`, triageReason, 'card');
    const blocker = rowOf((k) => k === 'stuck');
    const unstuck = rowOf((k) => k === 'unstuck');
    if (blocker && (!unstuck || unstuck.dayEnd < blocker.dayEnd) && q !== null && q < 4) {
      add('blocker', 34, `${who} reported a blocker`, 'They reported being blocked and there has been no build work since.', 'event', eventKey(c.enrollmentId, blocker.dayEnd));
    } else if (unstuck && blocker && unstuck.dayEnd >= blocker.dayEnd) {
      add('unstuck', 24, `${who} got unstuck`, 'Build work resumed after they reported a blocker.', 'event', eventKey(c.enrollmentId, unstuck.dayEnd));
    }
    if (c.gov && c.gov.total > 0 && c.gov.pct >= 75) add('near_done', 32, `${who}'s build is ${c.gov.pct}% verified`, `${c.gov.verified} of ${c.gov.total} stories on "${c.gov.title}" are verified; the proposal can start showing what works.`, 'facts');
    if (p.overdue >= 3) add('overdue', Math.min(60, 25 + p.overdue), `${who} has ${p.overdue} overdue tasks`, `${p.overdue} tasks on ${p.name} are past their due date.`, 'timeline');
    const verified = j.counts.verified ?? 0;
    const lastVerified = rowOf((k) => k === 'verified');
    if (verified >= 5 && lastVerified) add('streak', Math.min(45, 20 + verified), `${who} verified ${verified} stories in ${c.timeline.windowDays} days`, `Steady verified progress: ${p.pct ?? 0}% of ${p.name} is now verified.`, 'event', eventKey(c.enrollmentId, lastVerified.dayEnd));
  } else if ((c.day ?? 0) >= 14) {
    add('no_project', 40 + Math.floor((c.day ?? 0) / 10), `${who} has no project on day ${c.day}`, `${c.day} days in with nothing to build: one decision from you (a project) unblocks everything else.`, 'card');
  }
  // Demo videos: an overdue presentation from their own plan, and a newly recorded take (good news).
  const pres = c.presentation;
  if (pres && pres.daysLate > 0) add('presentation', 22 + Math.min(pres.daysLate, 20), `${who}'s ${pres.label} is ${pres.daysLate} days overdue`, `${pres.storyId} was due ${pres.dueOn} and has not been recorded yet; the prompt and nudge to get it done are ready.`, 'artifacts');
  const windowStart = Date.parse(c.timeline.start);
  const newVideo = c.artifacts.published.filter((a) => a.fileType === 'video' && Date.parse(a.at) >= windowStart).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (newVideo) add('new_video', 26, `${who} recorded a ${newVideo.title.replace(/ \(\d+:\d{2}\)$/, '')}`, `A demo video you can watch now (${newVideo.title.match(/\((\d+:\d{2})\)/)?.[1] ?? 'recorded'}), from the Presentation Studio.`, 'artifacts');
  if (c.artifacts.asks.some((a) => a.key === 'format_correction')) add('format', 16, `${who} is still submitting Markdown artifacts`, 'Their artifacts should be visual PDFs; the course-correction prompt is ready to send.', 'artifacts');
  const wb = j.pacing.weeks_behind;
  if (wb !== null && wb >= 4) add('training', 14 + 2 * wb, `${who} is ${wb} weeks behind in training`, `Week ${j.pacing.actual_training_week} completed where ${j.pacing.expected_training_week} were expected (${String(j.pacing.expected_basis).replace('_', ' ')}).`, 'facts');
  return out;
}

export function highlights(cards: InternCard[], interns: SidecarIntern[]): Highlight[] {
  const byId = new Map(interns.map((j) => [j.enrollment_id, j]));
  const all = cards.flatMap((c) => { const j = byId.get(c.enrollmentId); return j ? candidatesFor(c, j) : []; })
    .sort((a, b) => b.impact - a.impact || a.intern.localeCompare(b.intern) || a.kind.localeCompare(b.kind));
  const taken = new Map<string, number>();
  const picked: Candidate[] = [];
  const take = (h: Candidate): boolean => {
    const n = taken.get(h.enrollment_id) ?? 0;
    if (n >= MAX_PER_INTERN || picked.includes(h)) return false;
    taken.set(h.enrollment_id, n + 1);
    picked.push(h);
    return true;
  };
  // Reserve room for the best wins: a tour of only problems hides what is working (prod, 10 Nov:
  // the first tour was ten problems while one builder had 15 verified stories and a gov build was
  // 91% done).
  const wins = all.filter((h) => POSITIVE.has(h.kind));
  let room = TOUR_STOPS - Math.min(POSITIVE_SLOTS, wins.length);
  for (const h of all) { if (room <= 0) break; if (!POSITIVE.has(h.kind) && take(h)) room -= 1; }
  for (const h of wins) { if (picked.length >= TOUR_STOPS) break; take(h); }
  for (const h of all) { if (picked.length >= TOUR_STOPS) break; take(h); }
  // The tour runs in impact order, wins included.
  return picked.sort((a, b) => b.impact - a.impact || a.intern.localeCompare(b.intern) || a.kind.localeCompare(b.kind)).map((h, i) => ({ rank: i + 1, ...h }));
}

/** Highlights that are good news. */
export const POSITIVE: ReadonlySet<string> = new Set(['streak', 'near_done', 'unstuck', 'recovering', 'new_video']);
/** Up to this many stops are kept for good news when there is any. */
export const POSITIVE_SLOTS = 2;
