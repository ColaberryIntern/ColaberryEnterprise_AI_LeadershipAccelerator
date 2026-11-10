/**
 * build - PURE. The composed report (the exact object render.ts turns into HTML) -> the JSON sidecar.
 *
 * One source of truth: every value below is READ from the report the HTML is rendered from, or
 * computed from it here once (triage, pacing, classification, delta, last_ask, open_questions),
 * never recomputed a second way. Missing data is null. No images, no base64.
 *
 * Determinism: for the same report and the same previous snapshot the output is byte-identical
 * except `generated_at` (key order is fixed by these literals; arrays keep the report's order).
 */
import { WRONG_FORMAT, kindLabel } from '../artifacts';
import { classifyEmail, eventText } from '../timeline';
import type { Conversation, InternCard, LastOutbound, PortfolioReport, TimelineNext } from '../types';
import { classifyArtifact } from './classify';
import { delta } from './delta';
import { pacing } from './pacing';
import { TOP_N, rankCommunications, type Communication } from './communications';
import { highlights } from './highlights';
import { triage } from './triage';
import { REQUIRED_INTERN_KEYS, SIDECAR_VERSION, type PreviousSnapshot, type Sidecar, type SidecarIntern, type SidecarTimelineRow, type SnapshotIntern } from './types';

export interface SidecarInputs {
  /** The Central-time report date, YYYY-MM-DD (the same date in the email subject and filename). */
  reportDate: string;
  previous: PreviousSnapshot | null;
  lastOutbound: LastOutbound[];
  /** Both sides of the email window (collect COMMS_SQL); optional so older saved collections still build. */
  conversations?: Conversation[];
}

const lc = (s: unknown): string => String(s ?? '').trim().toLowerCase();
const next = (n: TimelineNext): { kind: string; label: string; detail: string } => ({ kind: n.kind, label: n.label, detail: n.detail });

/** The timeline exactly as the HTML draws it: newest first, a gap line wherever the HTML has one. */
function timelineRows(c: InternCard): SidecarTimelineRow[] {
  const t = c.timeline;
  const out: SidecarTimelineRow[] = [];
  const gap = (days: number, stuck: boolean, before: string): void => {
    if (days >= 2) out.push({ date: before, date_end: before, kind: stuck ? 'gap_no_build_work' : 'gap', text: stuck ? `${days} days, no build work` : `${days} days`, href: null });
  };
  gap(t.sinceLastRow, t.quietNow !== null && t.quietNow >= 4 && t.sinceLastRow >= 4, t.today);
  for (const r of [...t.rows].reverse()) {
    for (const e of r.events) out.push({ date: r.day, date_end: r.dayEnd, kind: e.kind, text: eventText(e), href: e.href && /^https:\/\//.test(e.href) ? e.href : null });
    gap(r.gapBefore, r.gapStuck, r.day);
  }
  return out;
}

/** Their question / blocker emails with nothing sent to them since: verbatim subject and text. */
function openQuestions(c: InternCard): SidecarIntern['open_questions'] {
  const answeredUpTo = c.emails.lastWeWrote ? Date.parse(c.emails.lastWeWrote) : null;
  return c.emails.threads
    .filter((th) => answeredUpTo === null || Date.parse(th.date) > answeredUpTo)
    .map((th) => ({ th, kind: classifyEmail(th.subject, th.snippet) }))
    .filter((x): x is { th: typeof x.th; kind: 'question' | 'stuck' } => x.kind === 'question' || x.kind === 'stuck')
    .map(({ th, kind }) => ({ received_at: new Date(th.date).toISOString(), subject: th.subject, text: th.snippet, kind }));
}

/**
 * The most recent message sent to them, and whether anything came back after it. "Satisfied" =
 * a commit, a verified story or an email from them dated after it. When nothing came back and the
 * message is older than the data window, the answer is unknown (null), not "no".
 */
function lastAsk(c: InternCard, rows: LastOutbound[], nowMs: number, windowDays: number): SidecarIntern['last_ask'] {
  const row = rows.find((r) => lc(r.email) === c.email);
  if (!row) return null;
  const sent = Date.parse(String(row.sent_at));
  const after = (iso: string | null | undefined): number | null => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) && t > sent ? t : null; };
  const evidence: Array<{ at: number; by: string }> = [];
  for (const x of c.project?.commitsRecent ?? []) { const t = after(x.date); if (t) evidence.push({ at: t, by: 'commit' }); }
  for (const v of c.project?.verifiedRecent ?? []) { const t = after(v.at); if (t) evidence.push({ at: t, by: 'verified_story' }); }
  const theirs = after(c.emails.lastTheyWrote);
  if (theirs) evidence.push({ at: theirs, by: 'reply' });
  evidence.sort((a, b) => a.at - b.at);
  const covered = nowMs - sent <= windowDays * 86400000;
  return {
    sent_at: new Date(sent).toISOString(),
    from: row.from_address,
    subject: row.subject,
    body_text: row.body_text,
    body_truncated: !!row.body_truncated,
    satisfied: evidence.length ? true : covered ? false : null,
    satisfied_by: evidence[0]?.by ?? null,
  };
}

function internJson(c: InternCard, report: PortfolioReport, inp: SidecarInputs, nowMs: number, comms: Communication[]): SidecarIntern {
  const p = c.project;
  const artifacts = c.artifacts.published.map((a) => ({
    id: a.id, kind: a.kind, kind_label: kindLabel(a.kind), title: a.title, published_at: a.at, url: a.url,
    source: a.source, provenance: a.provenance, file_type: a.fileType, wrong_format: WRONG_FORMAT.has(a.fileType),
    classification: classifyArtifact({ kind: a.kind, source: a.source, repoPath: a.repoPath ?? null, uploadName: a.uploadName ?? null, title: a.title }),
  }));
  const tr = triage(c);
  const storiesVerified = p ? p.tasksDone : null;
  const quiet = p ? c.timeline.quietNow : null;
  const base = {
    name: c.name,
    first_name: c.firstName,
    enrollment_id: c.enrollmentId,
    track: c.track,
    track_label: c.trackLabel,
    link: c.agentTabUrl || c.govUrl || null,
    day: c.day,
    status: { key: c.status.key, label: c.status.label },
    chips: [...c.status.reasons],
    narrative: c.summary,
    narrative_from_model: c.summaryFromModel,
    story: c.timeline.story,
    project: p ? { name: p.name, id: p.id ?? null, kind: p.kind ?? 'console', repo_url: p.repoUrl, command_center_url: p.commandCenterUrl, stage: p.stage } : null,
    stories_verified: storiesVerified,
    stories_total: p ? p.tasksTotal : null,
    percent_built: p ? p.pct : null,
    overdue_tasks: p ? p.overdue : null,
    training: { weeks_completed: c.training.weeksCompleted, weeks_total: c.training.weeksTotal, gate_cleared: c.training.gateClear, gate_done: c.training.gateDone, gate_of: 3 as const },
    days_since_build_work: quiet,
    build_work_in_window: p ? c.timeline.quietNow !== null : null,
    counts: {
      verified: c.timeline.counts.verified, commits: c.timeline.counts.commits, asks: c.timeline.counts.asks, blockers: c.timeline.counts.blockers,
      replies_from_ali: c.timeline.counts.replies, stuck_events: c.timeline.counts.stuckSpells, training_days: c.timeline.counts.trainingDays,
    },
    most_urgent: c.timeline.next[0] ? next(c.timeline.next[0]) : null,
    most_urgent_overflow: c.timeline.next.slice(1).map(next),
    timeline: timelineRows(c),
    asking_you: [...c.asks],
    asking_you_from_model: c.asksFromModel,
    open_questions: openQuestions(c),
    nudge: c.nudge,
    artifacts,
    artifacts_raw_count: artifacts.length,
    artifacts_real_count: artifacts.filter((a) => a.classification !== 'test_or_scratch').length,
    asks: c.artifacts.asks.map((k) => ({ key: k.key, name: k.name, why: k.why, prompt: k.prompt, nudge: k.nudge })),
    triage: tr,
    pacing: pacing(c),
    last_ask: lastAsk(c, inp.lastOutbound, nowMs, report.lookbackDays),
    communications: comms.slice(0, TOP_N),
  };
  return { ...base, delta: delta(c, { stories_verified: storiesVerified, days_since_build_work: quiet, triage: tr }, inp.previous, nowMs, report.lookbackDays) };
}

export function buildSidecar(report: PortfolioReport, inp: SidecarInputs): Sidecar {
  const nowMs = Date.parse(report.generatedAt);
  const t = report.totals;
  const k = (report.counts || {}) as Record<string, number | undefined>;
  const cards = report.groups.flatMap((g) => g.interns);
  const ranked = rankCommunications(inp.conversations ?? [], cards.map((c) => ({ enrollmentId: c.enrollmentId, name: c.name, email: lc(c.email) })), nowMs);
  const interns = cards.map((c) => internJson(c, report, inp, nowMs, ranked.get(c.enrollmentId) ?? []));
  return {
    sidecar_version: SIDECAR_VERSION,
    generated_at: report.generatedAt,
    report_date: inp.reportDate,
    window_days: report.groups.flatMap((g) => g.interns)[0]?.timeline.windowDays ?? 21,
    previous_report_date: inp.previous?.report_date ?? null,
    // The seven tiles, as the HTML shows them; a tile the HTML shows as "-" is null here.
    counts: {
      interns: t.interns, on_track: t.onTrack, need_attention: t.attention, stalled: t.stalled,
      weeks_1_3_cleared: typeof k.weeks_1_3_clear === 'number' ? k.weeks_1_3_clear : null,
      no_project: typeof k.no_project === 'number' ? k.no_project : null,
      replies_owed: t.repliesOwed,
    },
    your_move: [...report.aliMoves],
    operators_excluded: [...report.operatorsExcluded],
    highlights: highlights(cards, interns),
    interns,
  };
}

/**
 * The contract, checked before the sidecar is attached: it parses, it has the top-level keys, every
 * interns[] entry has every required key, and it carries no inline image data. Returns the problems
 * (empty = valid) so the script can fail loud with all of them at once.
 */
export function sidecarProblems(text: string): string[] {
  let s: Sidecar;
  try { s = JSON.parse(text) as Sidecar; } catch (err) { return [`does not parse: ${(err as Error).message}`]; }
  const problems: string[] = [];
  for (const k of ['sidecar_version', 'generated_at', 'report_date', 'window_days', 'counts', 'interns'] as const) {
    if (!(k in s)) problems.push(`missing top-level key ${k}`);
  }
  (s.interns ?? []).forEach((i, n) => {
    for (const k of REQUIRED_INTERN_KEYS) if (!(k in i)) problems.push(`interns[${n}] (${i.enrollment_id ?? '?'}) missing ${k}`);
  });
  if (/data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(text)) problems.push('contains inline base64 data');
  return problems;
}

/** Stable text: 2-space JSON plus a trailing newline. */
export const serializeSidecar = (s: Sidecar): string => `${JSON.stringify(s, null, 2)}\n`;

/** What the next run needs to compute `delta`. */
export function snapshotOf(s: Sidecar): PreviousSnapshot {
  return {
    report_date: s.report_date,
    generated_at: s.generated_at,
    interns: s.interns.map((i): SnapshotIntern => {
      // Destructured, not read as a property: this is the TRIAGE tier, and the free-account
      // consumer scan (enumerateFreeAccountConsumers) tracks every property read of an enrollment's
      // tier. A triage tier there would be a false consumer.
      const { tier: triageTier } = i.triage;
      return {
        enrollment_id: i.enrollment_id, stories_verified: i.stories_verified, days_since_build_work: i.days_since_build_work,
        artifacts_raw_count: i.artifacts_raw_count, triage_tier: triageTier,
      };
    }),
  };
}
