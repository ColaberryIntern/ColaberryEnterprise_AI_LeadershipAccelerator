/**
 * timeline - PURE. One chronological story per intern: what happened, where they got stuck, when
 * they got moving again, what they asked, when Ali answered, what is late, and what is next.
 *
 * Ali, 9 Nov 2026: "one timeline that tells me what's happened... I want to see when things are
 * late, replies should be their own color, questions should be a color, getting stuck should be a
 * color, getting unstuck. The number of days between." Every rule below is that sentence made
 * deterministic and tested (__tests__/timeline.test.ts).
 *
 * Definitions (the only judgment calls, all visible in the legend):
 *   stuck     an email whose words say blocked (STUCK_RE), OR >= STUCK_GAP_DAYS with no build work
 *   unstuck   the first build work (commit or verified story) after a stuck email or a stuck gap
 *   question  an email that asks something (QUESTION_RE) and is not a stuck email
 *   reply     a message from colaberry.com to them; carries how long after their message it came
 *   late      an unverified task past its due date
 */
import type { EventKind, InternEmail, OurReply, ProjectView, Timeline, TimelineCounts, TimelineEvent, TimelineNext, TimelineRow, TrainingView } from './types';

const DAY = 86400000;
export const WINDOW_DAYS = 21;
export const STUCK_GAP_DAYS = 4;
export const SLOW_REPLY_DAYS = 2;

export const STUCK_RE = /\b(issues?|errors?|unable|can'?t|cannot|not (working|reaching|loading|refresh\w*|showing|able)|did not|didn'?t (work|refresh|load)|blocked|blocker|stuck|login loop|problems?|fail(ed|ing|s|ure)?|broken|no access|needs? access|access request)\b/i;
export const QUESTION_RE = /\?|\b(questions?|confirm|clarif\w*|request|guidance|review|sign-?off|approv\w*|advise|decisions?|how (do|should|to)|could you|can you|would you)\b/i;

/** Calendar day in Central time: the day Ali would say it happened. */
export function dayKey(iso: string | number | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const strip = (s: string | null | undefined): string => String(s ?? '').replace(/^((re|fwd?|fw)\s*:\s*)+/i, '').trim() || '(no subject)';

export function classifyEmail(subject: string | null, snippet: string | null): 'stuck' | 'question' | 'update' {
  const text = `${subject ?? ''} ${String(snippet ?? '').slice(0, 250)}`;
  if (STUCK_RE.test(text)) return 'stuck';
  if (QUESTION_RE.test(text)) return 'question';
  return 'update';
}

export interface TimelineInput {
  nowMs: number;
  firstName: string;
  project: ProjectView | null;
  /** Every email they sent Ali in the window (not de-duplicated). */
  emails: InternEmail[];
  replies: OurReply[];
  activityDays: Array<{ date: string; events: number; by_category: Record<string, number> }>;
  training: TrainingView;
  awaitingReply: boolean;
  /** Artifacts they published, with the link that opens each (optional for older callers). */
  artifacts?: Array<{ at: string; kind: string; title: string; url: string }>;
}

const ROUTINE = new Set<EventKind>(['commit', 'verified', 'artifact', 'training', 'update']);
const plural = (n: number, w: string, many = `${w}s`): string => `${n} ${n === 1 ? w : many}`;

/**
 * Collapse a row's events into one chip per kind where that reads better: all commits become
 * "N commits", all training "Training on N days", and in a multi-day span the verified stories
 * become one "Verified N" chip listing them. Story moments are never merged.
 */
export function summarize(evs: TimelineEvent[], span: boolean): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const of = (k: EventKind): TimelineEvent[] => evs.filter((e) => e.kind === k);
  const latestOf = (xs: TimelineEvent[]): TimelineEvent => [...xs].sort((a, b) => b.at.localeCompare(a.at))[0];
  const commits = of('commit');
  if (commits.length) {
    const n = commits.reduce((s, e) => s + (Number(e.label.replace(/\D/g, '')) || 1), 0);
    const latest = latestOf(commits);
    out.push({ ...latest, label: plural(n, 'commit'), detail: `latest: ${latest.detail ?? ''}` });
  }
  out.push(...of('artifact'));
  const verified = of('verified');
  if (verified.length > 1 && span) out.push({ ...verified[0], label: `Verified ${verified.length}`, detail: verified.map((v) => v.detail).join('; ') });
  else out.push(...verified);
  // Training only shows on routine rows; on a story day the strip already carries it, and a chip
  // there would compete with the stuck / reply / question that day is about.
  const training = of('training');
  const story = evs.some((e) => !ROUTINE.has(e.kind));
  if (training.length && !story) {
    const days = new Set(training.map((t) => t.day)).size;
    out.push({ ...training[0], label: days === 1 ? 'Training' : `Training on ${days} days` });
  }
  const updates = of('update');
  if (updates.length > 1) out.push({ ...latestOf(updates), label: `${updates.length} updates`, detail: `latest: ${latestOf(updates).detail ?? ''}` });
  else out.push(...updates);
  out.push(...of('late'), ...of('stuck'), ...of('unstuck'));
  const questions = of('question');
  if (questions.length > 2) out.push({ ...latestOf(questions), label: `Asked x${questions.length}`, detail: `latest: ${latestOf(questions).detail ?? ''}` });
  else out.push(...questions);
  // Replies merge into one chip per row; it keeps the waiting time of the reply that answered a
  // question (and its amber ring if that took 2+ days), because that is the number Ali watches.
  const replies = of('reply');
  if (replies.length > 1) {
    const timed = replies.find((r) => r.meta) ?? latestOf(replies);
    out.push({ ...timed, label: `You replied x${replies.length}`, detail: `latest: ${latestOf(replies).detail ?? ''}` });
  } else out.push(...replies);
  return out;
}

const TALK = new Set<EventKind>(['update', 'reply', 'training', 'artifact']);
/** build = only routine build work; talk = only their updates and your replies; story = anything else. */
export function rowMode(evs: TimelineEvent[]): TimelineRow['mode'] {
  if (evs.every((e) => ROUTINE.has(e.kind))) return 'build';
  if (evs.every((e) => TALK.has(e.kind))) return 'talk';
  return 'story';
}

export function buildTimeline(i: TimelineInput): Timeline {
  const today = dayKey(i.nowMs);
  const start = dayKey(i.nowMs - (WINDOW_DAYS - 1) * DAY);
  const inWindow = (d: string): boolean => d >= start && d <= today;
  const events: TimelineEvent[] = [];
  // Timestamps arrive as Date objects from a live query and as strings from saved JSON; normalize
  // once here so every comparison below works on ISO strings.
  const add = (e: TimelineEvent): void => {
    if (!inWindow(e.day)) return;
    const t = new Date(e.at as unknown as string | Date);
    events.push({ ...e, at: Number.isNaN(t.getTime()) ? String(e.at) : t.toISOString() });
  };

  // Build work: commits grouped per day, verified stories one each.
  const p = i.project;
  const commitsByDay = new Map<string, Array<{ date: string; message: string }>>();
  for (const c of p?.commitsRecent ?? []) {
    const d = dayKey(c.date);
    commitsByDay.set(d, [...(commitsByDay.get(d) ?? []), c]);
  }
  for (const [d, cs] of commitsByDay) add({ kind: 'commit', day: d, at: cs[0].date, label: cs.length === 1 ? '1 commit' : `${cs.length} commits`, detail: cs[0].message });
  for (const v of p?.verifiedRecent ?? []) add({ kind: 'verified', day: dayKey(v.at), at: v.at, label: 'Verified', detail: v.title });

  // Their emails, classified; our replies, with how long they waited.
  const theirs = [...i.emails].sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
  for (const e of theirs) {
    const kind = classifyEmail(e.subject, e.snippet);
    add({ kind, day: dayKey(e.received_at), at: e.received_at, label: kind === 'stuck' ? 'Stuck' : kind === 'question' ? 'Asked' : 'Update', detail: strip(e.subject) });
  }
  const asks = theirs.filter((e) => classifyEmail(e.subject, e.snippet) !== 'update');
  let answeredUpTo = 0;
  for (const r of [...i.replies].sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at))) {
    const rMs = Date.parse(r.received_at);
    const waiting = asks.filter((a) => { const t = Date.parse(a.received_at); return t > answeredUpTo && t < rMs; });
    const oldest = waiting[0];
    const waited = oldest ? daysBetween(dayKey(oldest.received_at), dayKey(rMs)) : null;
    if (oldest) answeredUpTo = rMs;
    add({
      kind: 'reply', day: dayKey(rMs), at: r.received_at, label: 'You replied', detail: strip(r.subject),
      meta: waited === null ? undefined : waited === 0 ? 'same day' : `after ${waited}d`, slow: waited !== null && waited >= SLOW_REPLY_DAYS,
    });
  }

  // Published artifacts: each its own chip, because each one opens.
  for (const a of i.artifacts ?? []) {
    add({ kind: 'artifact', day: dayKey(a.at), at: a.at, label: 'Published', detail: a.title, href: a.url });
  }

  // Training days: a light chip, never a row of its own story.
  for (const d of i.activityDays) {
    const n = d.by_category?.training ?? 0;
    if (n > 0) add({ kind: 'training', day: d.date, at: `${d.date}T12:00:00Z`, label: `Training x${n}` });
  }

  // Late: tasks whose due date falls in the window are marked on that day.
  const lateBeforeWindow: Array<{ title: string; due: string }> = [];
  for (const t of p?.overdueTasks ?? []) {
    if (t.due_on >= start) add({ kind: 'late', day: t.due_on, at: `${t.due_on}T12:00:00Z`, label: 'Due, missed', detail: t.title });
    else lateBeforeWindow.push({ title: t.title, due: t.due_on });
  }

  // De-duplicate: the same message lands once per recipient (BCC copies) and threads get re-sent.
  // One chip per (day, kind, subject) is the truth Ali cares about.
  const seenEv = new Set<string>();
  for (let k = events.length - 1; k >= 0; k -= 1) {
    const e = events[k];
    if (e.kind === 'commit' || e.kind === 'training') continue;
    const key = `${e.day}|${e.kind}|${(e.detail ?? '').toLowerCase()}`;
    if (seenEv.has(key)) events.splice(k, 1); else seenEv.add(key);
  }

  // Stuck gaps and unstuck moments, measured on build work only.
  const buildDays = [...new Set(events.filter((e) => e.kind === 'commit' || e.kind === 'verified').map((e) => e.day))].sort();
  const stuckEmailDays = events.filter((e) => e.kind === 'stuck').map((e) => e.day).sort();
  let stuckSpells = 0;
  for (let k = 0; k < buildDays.length; k += 1) {
    const d = buildDays[k];
    const prev = buildDays[k - 1];
    const gap = prev ? daysBetween(prev, d) : null;
    const blockerBefore = stuckEmailDays.find((s) => s < d && (!prev || s >= prev));
    if (gap !== null && gap >= STUCK_GAP_DAYS) {
      stuckSpells += 1;
      add({ kind: 'unstuck', day: d, at: `${d}T23:59:00Z`, label: 'Unstuck', detail: `building again after ${gap} days` });
    } else if (blockerBefore) {
      add({ kind: 'unstuck', day: d, at: `${d}T23:59:00Z`, label: 'Unstuck', detail: `moving again after reporting a blocker on ${blockerBefore.slice(5)}` });
    }
  }
  const lastBuild = buildDays[buildDays.length - 1] ?? null;
  const quietNow = p ? (lastBuild ? daysBetween(lastBuild, today) : null) : null;
  if (p && (quietNow === null || quietNow >= STUCK_GAP_DAYS)) stuckSpells += 1;

  // Rows: one per day that has something, oldest first, with the gap to the previous row.
  const byDay = new Map<string, TimelineEvent[]>();
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const ORDER: EventKind[] = ['late', 'stuck', 'unstuck', 'verified', 'artifact', 'commit', 'question', 'update', 'reply', 'training'];
  const days = [...byDay.keys()].sort();
  // Rows. Story moments (stuck, unstuck, a question, something late) keep their own date. Days of
  // routine BUILD work (commits, verified stories, training, plain updates) that follow each other
  // with at most a 1-day break collapse into ONE "building" span; days that are only back-and-forth
  // (their updates and your replies) collapse into ONE "conversation" span. The timeline then reads
  // as a handful of chapters instead of a list of dates.
  const rows: TimelineRow[] = [];
  for (const d of days) {
    const evs = byDay.get(d) ?? [];
    const mode = rowMode(evs);
    // A lone training-only day right after another row folds into it: the strip already shows the
    // training, and a row of its own would interrupt the story for no reason.
    const lastRow = rows[rows.length - 1];
    if (lastRow && lastRow.mode !== 'build' && evs.every((e) => e.kind === 'training') && daysBetween(lastRow.dayEnd, d) <= 1) {
      lastRow.events.push(...evs);
      continue;
    }
    const routine = mode === 'build';
    const last = rows[rows.length - 1];
    if (mode !== 'story' && last && last.mode === mode && daysBetween(last.dayEnd, d) <= 2) {
      last.dayEnd = d;
      last.events.push(...evs);
      continue;
    }
    const prevEnd = last ? last.dayEnd : start;
    // The first row has no gap: what happened before the window is unknown, so a leading "10 days,
    // no build work" would be a claim the data cannot support.
    const gap = last ? daysBetween(prevEnd, d) : 0;
    const prevBuild = buildDays.filter((b) => b < d).pop();
    rows.push({
      day: d, dayEnd: d, routine, mode, gapBefore: gap,
      // A gap is a "stuck" gap only when it is a stretch with no build work for a project-holder.
      gapStuck: !!p && gap >= STUCK_GAP_DAYS && (!prevBuild || daysBetween(prevBuild, d) >= STUCK_GAP_DAYS),
      onlyTraining: false,
      events: [...evs],
    });
  }
  for (const r of rows) {
    r.onlyTraining = r.events.every((e) => e.kind === 'training');
    r.events = summarize(r.events, r.day !== r.dayEnd).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  }
  const sinceLastRow = rows.length ? daysBetween(rows[rows.length - 1].dayEnd, today) : WINDOW_DAYS;

  // What comes next, most urgent first.
  const next: TimelineNext[] = [];
  if (i.awaitingReply) {
    const last = theirs[theirs.length - 1];
    next.push({ kind: 'owed', label: 'You owe a reply', detail: `${strip(last?.subject)} (${daysBetween(dayKey(last.received_at), today)}d waiting)` });
  }
  for (const t of p?.overdueTasks ?? []) next.push({ kind: 'late', label: `Late ${daysBetween(t.due_on, today)}d`, detail: t.title });
  // The collector lists the 6 oldest; say how many more there are rather than letting the list undercount.
  const moreLate = (p?.overdue ?? 0) - (p?.overdueTasks ?? []).length;
  if (moreLate > 0) next.push({ kind: 'late', label: `+${moreLate} more late`, detail: 'see the project on the Projects tab in Interns' });
  if (p && quietNow === null) next.push({ kind: 'stuck', label: 'No build work in 21 days', detail: 'no commit or verified story in the window' });
  else if (p && quietNow !== null && quietNow >= STUCK_GAP_DAYS) next.push({ kind: 'stuck', label: `Stuck ${quietNow}d`, detail: `no commit or verified story since ${lastBuild?.slice(5)}` });
  if (!p) next.push({ kind: 'noproject', label: 'No project', detail: 'start one from the Projects tab in Internship' });
  if (p?.next && !(p.overdueTasks ?? []).some((t) => t.title === p.next?.title)) {
    next.push({ kind: 'next', label: 'Up next', detail: `${p.next.title}${p.next.dueOn ? ` (due ${p.next.dueOn.slice(5)})` : ''}` });
  }
  if (!i.training.gateClear && i.training.nextWeek) next.push({ kind: 'training', label: `Training Week ${i.training.nextWeek.week}`, detail: `${i.training.nextWeek.pct}% done; weeks 1-3 gate ${i.training.gateDone}/3` });

  // The counts, ONCE. The story line below and the JSON sidecar both read this object, so the
  // number in the email and the number an agent reads can never be computed two ways.
  const count = (k: EventKind): number => events.filter((e) => e.kind === k).length;
  const counts: TimelineCounts = {
    // Only meaningful with a project; null (not 0) for someone who has none.
    verified: p ? count('verified') : null,
    commits: p ? (p.commitsRecent ?? []).filter((c) => inWindow(dayKey(c.date))).length : null,
    asks: count('question') + count('stuck'),
    blockers: count('stuck'),
    replies: count('reply'),
    stuckSpells,
    // Training counts as activity: without this a no-project intern who trains daily read as "nothing recorded".
    trainingDays: new Set(events.filter((e) => e.kind === 'training').map((e) => e.day)).size,
  };
  const story = storyLine(counts, p ? quietNow : null, !!p);

  // The 21-day strip: every kind that happened each day.
  const stripDays = Array.from({ length: WINDOW_DAYS }, (_, k) => dayKey(i.nowMs - (WINDOW_DAYS - 1 - k) * DAY));
  const strip21 = stripDays.map((d) => ({ day: d, kinds: [...new Set((byDay.get(d) ?? []).map((e) => e.kind))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)) }));

  return { windowDays: WINDOW_DAYS, start, today, rows, sinceLastRow, next, story, strip: strip21, stuckSpells, lateBeforeWindow, quietNow, counts };
}

/** The one-line story, from the counts. PURE; the wording is unchanged from before counts existed. */
export function storyLine(c: TimelineCounts, quietNow: number | null, hasProject: boolean): string {
  const bits: string[] = [];
  if (hasProject) bits.push(`${c.verified ?? 0} verified, ${plural(c.commits ?? 0, 'commit')}`);
  if (c.asks) bits.push(`${plural(c.asks, 'ask')} (${plural(c.blockers, 'blocker')}), ${plural(c.replies, 'reply', 'replies')} from you`);
  if (c.stuckSpells) bits.push(`stuck ${c.stuckSpells === 1 ? 'once' : `${c.stuckSpells} times`}`);
  if (hasProject && quietNow !== null) bits.push(quietNow === 0 ? 'built today' : `last build work ${quietNow}d ago`);
  if (c.trainingDays) bits.push(`training on ${plural(c.trainingDays, 'day')}`);
  return `Last ${WINDOW_DAYS} days: ${bits.join('; ') || 'nothing recorded'}.`;
}

/** One timeline event as one line of text; the plain-text email and the JSON sidecar both use it. */
export function eventText(e: Pick<TimelineEvent, 'label' | 'detail' | 'meta'>): string {
  return `${e.label}${e.detail ? ` ${e.detail}` : ''}${e.meta ? ` (${e.meta})` : ''}`;
}
