/**
 * compose - PURE. Collected facts -> one card per intern: track, training/triage, activity, what
 * they did lately, next steps, the nudge Ali would send, and anything that is Ali's move.
 *
 * No I/O and no clock (`now` is passed in), so every rule is unit-tested in __tests__/compose.test.ts.
 *
 * Every sentence this writes comes from a counted fact. "No commit in 9 days" is said only when the
 * repo shows it. This is why the "lately" text and the nudge are NOT model-written: on the
 * 9 Nov 2026 production dry run the model invented a commit date and gendered an intern.
 */
import type { ConsoleRosterRow } from '../internConsoleRoster';
import type { AgentNudgeState } from '../agentNudgeComposer';
import type { GovPipelineCard } from '../../factory/govPipeline';
import { fallbackSummary } from './summary';
import { chooseAsks, publishedArtifacts } from './artifacts';
import { presentationDue, videoArtifacts } from './presentations';
import { buildTimeline, dayKey, daysBetween, STUCK_GAP_DAYS } from './timeline';
import { answeredInThread, cleanSubject, newestReplyByThread } from './threadReply';
import type {
  ActivityTotals, AgentTab, CollectedPortfolio, CommitSummary, EmailView, FeedItem, FeedView, InternCard,
  InternEmail, OurReply, PortfolioReport, ProjectFacts, ProjectView, StatusKey, Track, TrainingView, WeWrote,
} from './types';

// Re-exported because it moved to threadReply.ts, where the thread rule that uses it lives.
export { cleanSubject };

const DAY = 86400000;
export const OWED_WINDOW_DAYS = 7;          // matches agentNudgeState.OWED_WINDOW_DAYS
export const TRAINING_GATE_DAY = 21;        // weeks 1-3 are three weeks of training
export const COMMIT_QUIET_DAYS = 3;         // the nudge asks for a commit after this many quiet days
/** The status calls it stuck at the same point the timeline does (timeline.STUCK_GAP_DAYS). */
export const BUILD_QUIET_REASON_DAYS = STUCK_GAP_DAYS;

const PLATFORM_AUTHOR = /build bot|colaberry|github-actions|\[bot\]/i;
const PLATFORM_MESSAGE = /^chore\(colaberry\)|^Merge (pull request|branch)/i;

/** Feed events that are bookkeeping, not work. */
const NOISE_TYPES = new Set(['daily_streak', 'xp_builder', 'xp_learning', 'xp_community', 'project_story_verified', 'task_verified']);

const TRACK_ORDER: Track[] = ['agent', 'gov', 'other', 'none'];
const TRACK_TITLE: Record<Track, string> = {
  agent: 'Agent projects',
  gov: 'Gov contract projects',
  other: 'Other projects',
  none: 'No project yet',
};

const lc = (s: unknown): string => String(s ?? '').trim().toLowerCase();
const ms = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
};
const calendarDaysAgo = (iso: string, nowMs: number): number => daysBetween(dayKey(iso), dayKey(nowMs));
const daysAgo = (v: unknown, nowMs: number): number | null => {
  const t = ms(v);
  return t === null ? null : Math.floor((nowMs - t) / DAY);
};

/** First name for a greeting. The roster holds some names as "LAST, FIRST" ("OBI, ANAMELECHI. K"). */
export function firstName(name: unknown): string {
  const n = String(name ?? '').trim();
  const raw = n.includes(',') ? (n.split(',')[1] ?? '').trim().split(/[\s.]+/)[0] : n.split(/\s+/)[0];
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : '';
}

const IRREGULAR: Record<string, string> = { story: 'stories', reply: 'replies', activity: 'activities' };
export function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : IRREGULAR[word] ?? `${word}s`}`;
}

/** The intern's own commits in the window, newest first. Platform/bot commits are not their work. */
export function ownCommits(commits: CommitSummary[] | null | undefined, nowMs: number, lookbackDays: number): CommitSummary[] {
  return (Array.isArray(commits) ? commits : [])
    .filter((c) => c && !PLATFORM_AUTHOR.test(String(c.author ?? '')) && !PLATFORM_MESSAGE.test(String(c.message ?? '').trim()))
    .filter((c) => { const t = ms(c.date); return t !== null && t > nowMs - lookbackDays * DAY; })
    .sort((a, b) => (ms(b.date) ?? 0) - (ms(a.date) ?? 0));
}

export function trainingView(training: ConsoleRosterRow['training'] | null | undefined): TrainingView {
  const weeks = (training?.weeks ?? []).filter((w) => w.week !== null && w.week !== undefined) as Array<{ week: number; publishedCardCount: number; completedPct: number; weekDone: boolean }>;
  const next = weeks.find((w) => w.week >= 1 && !w.weekDone) ?? null;
  return {
    weeksCompleted: training?.weeks_completed ?? 0,
    // The curriculum length is whatever has published cards (12 weeks as of Nov 2026), never a constant.
    weeksTotal: weeks.filter((w) => w.week >= 1).length,
    gateClear: !!training?.weeks_1_3_clear,
    gateDone: weeks.filter((w) => w.week >= 1 && w.week <= 3 && w.weekDone).length,
    strip: weeks.map((w) => ({ week: w.week, pct: Math.round(w.completedPct || 0), done: !!w.weekDone })),
    nextWeek: next ? { week: next.week, pct: Math.round(next.completedPct || 0), cards: next.publishedCardCount } : null,
    // scheduledWeek: the week the cohort's live sessions have reached; the sidecar paces on it.
    pace: training?.pace ? { band: String(training.pace.band), scheduledWeek: training.pace.scheduled_week } : null,
    paceUnavailable: training?.pace_unavailable ?? null,
  };
}

/**
 * Their emails to Ali, newest first, one per subject, and whether a reply is owed: we have not
 * written back IN THEIR THREAD since their latest message, AND it is under OWED_WINDOW_DAYS old
 * (a months-old miss is fixed by a reply, not flagged forever).
 *
 * The thread clause replaced "newer than anything colaberry.com sent them" on 2026-11-11. The old
 * test counted a NUDGE as a reply, so our own nudge run answered every outstanding question in the
 * data without answering any of them in fact: by 11 Nov no intern was `blocked_waiting_on_ali`,
 * nothing reached the `answer_owed` focus, and "Replies you owe" read lower than the truth. See
 * threadReply.ts for why the thread is both the available evidence and the right evidence.
 *
 * `lastWeWrote` below deliberately keeps its plain meaning - the last time we sent them anything
 * at all, nudge included - because it reports what we did, not whether we answered.
 */
export function emailView(email: string, emails: InternEmail[], weWrote: WeWrote[], nowMs: number, replies: ReadonlyArray<OurReply> = []): EmailView {
  const mine = emails.filter((e) => lc(e.email) === email).sort((a, b) => (ms(b.received_at) ?? 0) - (ms(a.received_at) ?? 0));
  const seen = new Set<string>();
  const threads: EmailView['threads'] = [];
  for (const e of mine) {
    const subject = cleanSubject(e.subject);
    if (seen.has(subject.toLowerCase())) continue;
    seen.add(subject.toLowerCase());
    threads.push({ subject, date: e.received_at, snippet: String(e.snippet ?? '').slice(0, 300) });
  }
  const lastTheyMs = mine.length ? ms(mine[0].received_at) : null;
  const we = weWrote.find((w) => lc(w.email) === email);
  const lastWeMs = we ? ms(we.last_we_wrote) : null;
  const byThread = newestReplyByThread(replies);
  const awaitingReply = lastTheyMs !== null
    && !answeredInThread(mine[0].subject, lastTheyMs, byThread)
    && nowMs - lastTheyMs <= OWED_WINDOW_DAYS * DAY;
  return {
    threads,
    count: mine.length,
    lastTheyWrote: lastTheyMs !== null ? new Date(lastTheyMs).toISOString() : null,
    lastWeWrote: lastWeMs !== null ? new Date(lastWeMs).toISOString() : null,
    awaitingReply,
    awaitingSubject: awaitingReply ? cleanSubject(mine[0].subject) : null,
  };
}

function feedView(feed: FeedItem[] | undefined): FeedView {
  const work = (feed ?? []).filter((f) => !NOISE_TYPES.has(f.type));
  const count = (re: RegExp): number => work.filter((f) => re.test(f.type)).reduce((n, f) => n + (f.occurrences || 1), 0);
  return {
    cards: count(/^card_complete/),
    certPractice: count(/^cert_practice_complete$/),
    artifacts: count(/^artifact_/),
    community: work.filter((f) => f.domain === 'community' || /^community_/.test(f.type)).length,
    mentorAsks: count(/^mentor_ask$/),
    absences: count(/^class_absent$/),
  };
}

type Day = InternCard['activity']['days'][number];
function activityTotals(days: Day[], lastN: number): ActivityTotals {
  const t: ActivityTotals = { training: 0, project: 0, certification: 0, community: 0, other: 0, activeDays: 0 };
  for (const d of days.slice(-lastN)) {
    for (const k of ['training', 'project', 'certification', 'community', 'other'] as const) t[k] += d.by_category?.[k] ?? 0;
    if (d.events > 0) t.activeDays += 1;
  }
  return t;
}

/**
 * Days since the last sign of build work: a commit OR a verified story, whichever is newer (some
 * stories are documents, not code). null = neither has happened. Shared by status and nudge so
 * the two can never disagree about how quiet someone is.
 */
export function buildQuietDays(p: Pick<ProjectView, 'lastCommitDays' | 'lastVerifiedDays'>): number | null {
  const a = p.lastCommitDays;
  const b = p.lastVerifiedDays;
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

type CardCore = Omit<InternCard, 'artifacts' | 'summary' | 'summaryFromModel' | 'timeline' | 'status' | 'lately' | 'nextSteps' | 'nudge' | 'aliMoves' | 'asks' | 'asksFromModel'>;

function latelyFacts(c: CardCore, lookbackDays: number): string[] {
  const out: string[] = [];
  const p = c.project;
  if (p) {
    if (p.verifiedRecent.length) out.push(`Verified ${plural(p.verifiedRecent.length, 'story')}: ${p.verifiedRecent.slice(0, 3).map((v) => `"${v.title}"`).join(', ')}${p.verifiedRecent.length > 3 ? ', ...' : ''}.`);
    if (p.commitsRecent.length) out.push(`${plural(p.commitsRecent.length, 'commit')} to the repo, latest: "${p.commitsRecent[0].message}".`);
    if (!p.verifiedRecent.length && !p.commitsRecent.length) out.push(`No commits or verified stories in the last ${lookbackDays} days.`);
  }
  const f = c.feed;
  const bits: string[] = [];
  if (f.cards) bits.push(plural(f.cards, 'training card'));
  if (f.certPractice) bits.push(plural(f.certPractice, 'cert practice set'));
  if (f.artifacts) bits.push(plural(f.artifacts, 'artifact'));
  if (f.community) bits.push(plural(f.community, 'community post/comment'));
  if (bits.length) out.push(`Completed ${bits.join(', ')}.`);
  if (f.absences) out.push(`Marked absent from ${plural(f.absences, 'class')}.`);
  if (c.emails.count) out.push(`Sent Ali ${plural(c.emails.count, 'email')} (latest: "${c.emails.threads[0].subject}").`);
  return out;
}

/** Status plus its reasons. The reasons are the point: "Needs attention" alone tells Ali nothing. */
export function statusFor(c: CardCore): InternCard['status'] {
  const lvl = c.activity.level;
  const p = c.project;
  const projectQuiet = !!p && !p.verifiedRecent.length && !p.commitsRecent.length;
  const reasons: string[] = [];
  if (lvl === 'red' || lvl === 'black') reasons.push(`${c.activity.daysSince} days with no platform activity`);
  else if (lvl === 'orange') reasons.push(`quiet ${c.activity.daysSince} days`);
  if (!p) reasons.push('no project');
  if (projectQuiet) reasons.push('no commits or verified stories in 3 weeks');
  const quiet = p ? buildQuietDays(p) : null;
  if (p && !projectQuiet && quiet !== null && quiet >= BUILD_QUIET_REASON_DAYS) reasons.push(`stuck ${quiet}d (no commit or verified story)`);
  if (p && p.overdue > 0) reasons.push(plural(p.overdue, 'overdue task'));
  if (!c.training.gateClear && (c.day ?? 0) > TRAINING_GATE_DAY + 7) reasons.push(`training behind (weeks 1-3 gate ${c.training.gateDone}/3)`);
  if (c.emails.awaitingReply) reasons.push('waiting on a reply from Ali');

  let key: StatusKey = 'on_track';
  if (lvl === 'red' || lvl === 'black' || (projectQuiet && (c.activity.daysSince === null || c.activity.daysSince >= 4))) key = 'stalled';
  else if (reasons.length) key = 'attention';
  return { key, label: key === 'stalled' ? 'Stalled' : key === 'attention' ? 'Needs attention' : 'On track', reasons };
}

export function nextStepsFor(c: CardCore): string[] {
  const steps: string[] = [];
  const p = c.project;
  if (!p) steps.push('Start a project from the Projects tab in Internship.');
  if (p && p.overdue > 0) steps.push(`Clear ${plural(p.overdue, 'overdue task')}.`);
  if (p && p.next) steps.push(`Build next: "${p.next.title}"${p.next.dueOn ? ` (due ${p.next.dueOn})` : ''}.`);
  if (c.gov && c.gov.total > 0 && c.gov.verified < c.gov.total && c.gov.pct >= 75) {
    steps.push(`Close the last ${plural(c.gov.total - c.gov.verified, 'story')} so the build can move to the proposal.`);
  }
  const nw = c.training.nextWeek;
  if (!c.training.gateClear && nw) steps.push(`Finish Week ${nw.week} training (${nw.pct}% of ${nw.cards} cards) to clear the weeks 1-3 gate.`);
  else if (c.training.gateClear && nw) steps.push(`Keep training moving: Week ${nw.week} is ${nw.pct}% done.`);
  if (c.cert && c.cert.sittings === 0 && c.training.weeksCompleted >= 3) steps.push('Start certification prep (first diagnostic sitting).');
  return steps.slice(0, 3);
}

/** The one message Ali would send. Leads with the single most important thing. */
export function nudgeFor(c: CardCore): string {
  const hi = `Hi ${c.firstName || 'there'},`;
  const p = c.project;
  const next = p?.next ? `"${p.next.title}"` : null;
  if (!p) return `${hi} you do not have a project yet. Pick one with me this week so your build can start; your training is at ${c.training.weeksCompleted} of ${c.training.weeksTotal} weeks.`;
  const quietDays = buildQuietDays(p);
  if (p.overdue > 0) return `${hi} you have ${plural(p.overdue, 'overdue task')} on ${p.name}. Clear those first${next ? `, then ${next} is next` : ''}. Reply with a date you will have them done.`;
  if (quietDays === null) return `${hi} I do not see any commits from you on ${p.name} yet. Push your first commit${next ? ` on ${next}` : ''} today so the platform can verify it.`;
  if (quietDays >= COMMIT_QUIET_DAYS) return `${hi} I have not seen a commit or a verified story on ${p.name} in ${quietDays} days.${next ? ` Next up is ${next}:` : ''} push a commit today, even a partial one, and tell me what is blocking you if anything is.`;
  if (c.gov && c.gov.pct >= 75 && c.gov.verified < c.gov.total) return `${hi} strong work, ${c.gov.pct}% of the build is verified. Close the last ${plural(c.gov.total - c.gov.verified, 'story')} this week so we can move to the proposal.`;
  if (!c.training.gateClear && c.training.nextWeek && (c.day ?? 0) > TRAINING_GATE_DAY) return `${hi} good momentum on the build. Your training is behind: finish Week ${c.training.nextWeek.week} (${c.training.nextWeek.pct}% done) this week to clear the weeks 1-3 gate.`;
  return `${hi} good pace on ${p.name}. Keep going${next ? ` with ${next}` : ''}, and send me a short update when it verifies.`;
}

function aliMovesFor(c: CardCore, status: InternCard['status']): string[] {
  const moves: string[] = [];
  if (c.emails.awaitingReply) moves.push(`Reply to ${c.firstName}: "${c.emails.awaitingSubject}" (sent ${String(c.emails.lastTheyWrote).slice(0, 10)}).`);
  if (!c.project) moves.push(`Start a project for ${c.firstName}.`);
  if (status.key === 'stalled') moves.push(`Check in with ${c.firstName}: stalled.`);
  return moves;
}

interface Lookups {
  agentByEmail: Map<string, AgentNudgeState>;
  tabByEmail: Map<string, AgentTab>;
  govByEmail: Map<string, GovPipelineCard>;
  projectById: Map<string, ProjectFacts>;
}

function projectFor(r: ConsoleRosterRow, agent: AgentNudgeState | null, tab: AgentTab | null, gov: GovPipelineCard | null, l: Lookups, nowMs: number, lookback: number): ProjectView | null {
  // Agent builders are reported on their agent tab's project, gov interns on the pursuit's build,
  // everyone else on their newest console project (for an agent builder that can be a side project).
  const projectId = tab?.student_project_id || gov?.build?.studentProjectId || r.project?.project_id || null;
  if (!projectId) return null;
  const pr: Partial<ProjectFacts> = l.projectById.get(projectId) ?? {};
  const cp = r.project && r.project.project_id === projectId ? r.project : null;
  const nextTask = (pr.next_tasks ?? [])[0] ?? null;
  const own = ownCommits(pr.commits, nowMs, 3650);
  const verified = pr.recently_verified ?? [];
  return {
    id: projectId,
    kind: tab?.student_project_id ? 'agent' : gov?.build?.studentProjectId ? 'gov' : 'console',
    name: gov?.title || tab?.project_name || cp?.name || gov?.build?.studentProjectName || 'Project',
    stage: cp ? cp.stage : gov ? gov.stage : null,
    tasksTotal: agent ? agent.stories : gov?.build ? gov.build.total : cp ? cp.tasks_total : null,
    tasksDone: agent ? agent.verified : gov?.build ? gov.build.verified : cp ? cp.tasks_complete : null,
    pct: agent ? (agent.stories ? Math.round((agent.verified / agent.stories) * 100) : 0) : gov?.build ? gov.build.pct : cp ? cp.tasks_pct : null,
    repoUrl: pr.repo_url ?? null,
    overdue: pr.overdue ?? 0,
    commitsRecent: ownCommits(pr.commits, nowMs, lookback).map((c) => ({ sha: c.sha, date: String(c.date), message: String(c.message ?? '').split('\n')[0].slice(0, 120) })),
    // Central calendar days, the same measure the timeline uses, so the status chip, the nudge and
    // the timeline's "Stuck Nd" can never disagree by one.
    lastCommitDays: own.length ? calendarDaysAgo(String(own[0].date), nowMs) : null,
    lastVerifiedDays: verified.length ? calendarDaysAgo(verified[0].verified_at, nowMs) : null,
    verifiedRecent: verified.map((v) => ({ storyId: v.story_id, title: v.title, at: v.verified_at })),
    overdueTasks: (pr.overdue_tasks ?? []).map((t) => ({ title: t.title, due_on: t.due_on })),
    // Only an https link is offered as a button; anything else in that free-form variable is ignored.
    commandCenterUrl: pr.command_center_url && /^https:\/\//.test(pr.command_center_url) ? pr.command_center_url : null,
    next: agent?.nextStory ? { title: agent.nextStory.title, dueOn: agent.nextStory.dueOn ?? null } : nextTask ? { title: nextTask.title, dueOn: nextTask.due_on } : null,
  };
}

function cardFor(r: ConsoleRosterRow, data: CollectedPortfolio, l: Lookups, nowMs: number): InternCard {
  const lookback = data.lookbackDays || 14;
  const email = lc(r.email);
  const agent = l.agentByEmail.get(email) ?? null;
  const tab = l.tabByEmail.get(email) ?? null;
  const gov = l.govByEmail.get(email) ?? null;
  const project = projectFor(r, agent, tab, gov, l, nowMs, lookback);
  const track: Track = agent ? 'agent' : gov ? 'gov' : project ? 'other' : 'none';
  const days = (r.activity?.days ?? []) as unknown as Day[];
  const readiness = data.readiness.find((x) => x.enrollment_id === r.enrollment_id);
  // Everything colaberry.com sent THIS intern in the window, with subjects. Filtered once here
  // because three things need it: the reply-owed rule, the timeline, and the card itself.
  const ourReplies = (data.replies ?? []).filter((x) => lc(x.email) === email);

  const core: CardCore = {
    enrollmentId: r.enrollment_id,
    name: r.name,
    firstName: firstName(r.name),
    email,
    day: r.day,
    track,
    trackLabel: agent ? `Agent: ${agent.agent ? `${agent.agent} - ` : ''}${tab?.project_name ?? agent.domain}`
      : gov ? `Gov contract: ${gov.title ?? gov.key}` : project ? 'Other project' : 'No project',
    agentTabUrl: tab?.agent_id ? `https://enterprise.colaberry.ai/admin/agents/${tab.agent_id}` : null,
    govUrl: gov ? `https://enterprise.colaberry.ai/admin/gov-qualification?gws=${encodeURIComponent(gov.key)}` : null,
    gov: gov ? { title: gov.title ?? gov.key, stage: String(gov.stage), decision: gov.decision, pct: gov.build?.pct ?? 0, verified: gov.build?.verified ?? 0, total: gov.build?.total ?? 0 } : null,
    activity: {
      level: String(r.activity?.level ?? 'unknown'),
      daysSince: r.activity?.days_since ?? null,
      lastSource: r.activity?.last_activity_source ?? null,
      days,
      last7: activityTotals(days, 7),
      last28: activityTotals(days, 28),
    },
    training: trainingView(r.training),
    sessions: readiness ? readiness.sessions_attended : null,
    cert: r.cert ? { sittings: r.cert.sittings, completed: r.cert.completed, available: r.cert.available } : null,
    project,
    feed: feedView(data.feeds[r.enrollment_id]),
    emails: emailView(email, data.emails, data.weWrote, nowMs, ourReplies),
    subscriptions: tab?.subscriptions ?? [],
  };
  const status = statusFor(core);
  const published = publishedArtifacts(r.enrollment_id, data.artifacts ?? [], videoArtifacts(r.enrollment_id, data.videos ?? []));
  // Their next presentation, only once their own PREP due date makes it due (presentations.ts).
  const presentation = project ? presentationDue(r.enrollment_id, data.prepTasks ?? [], data.videos ?? [], nowMs) : null;
  const timeline = buildTimeline({
    nowMs, firstName: core.firstName, project, training: core.training, awaitingReply: core.emails.awaitingReply, activityDays: days,
    emails: data.emails.filter((e) => lc(e.email) === email),
    replies: ourReplies,
    artifacts: published,
  });
  const artifacts = { published, asks: chooseAsks({ ...core, timeline }, published, nowMs, presentation) };
  const card: InternCard = {
    ...core,
    // Carried onto the card so the sidecar can apply the same thread rule this file applies.
    // Previously only `CollectedPortfolio` held these, so `openQuestions` had no per-thread
    // evidence and fell back to "did we send them anything since", which a nudge satisfies.
    replies: ourReplies,
    timeline,
    presentation,
    summary: '',
    summaryFromModel: false,
    artifacts,
    status,
    lately: latelyFacts(core, lookback),
    nextSteps: nextStepsFor(core),
    nudge: nudgeFor(core),
    aliMoves: aliMovesFor(core, status),
    asks: [],
    asksFromModel: false,
  };
  // Every card always has a paragraph; summary.ts upgrades it with the model when one is available.
  card.summary = fallbackSummary(card);
  return card;
}

export function composeInternshipPortfolio(
  data: CollectedPortfolio,
  { now = new Date(), operatorEmails = ['ali@colaberry.com'] }: { now?: Date; operatorEmails?: string[] } = {},
): PortfolioReport {
  const nowMs = now.getTime();
  const govByEmail = new Map<string, GovPipelineCard>();
  for (const g of data.govPursuits ?? []) for (const a of g.assignedInterns ?? []) govByEmail.set(lc(a.email), g);
  const lookups: Lookups = {
    agentByEmail: new Map((data.agentStates ?? []).map((a) => [lc(a.email), a])),
    tabByEmail: new Map((data.agentTabs ?? []).filter((t) => t.email).map((t) => [lc(t.email), t])),
    govByEmail,
    projectById: new Map((data.projects ?? []).map((p) => [p.project_id, p])),
  };

  const cards: InternCard[] = [];
  const operators: string[] = [];
  for (const r of data.roster ?? []) {
    if (operatorEmails.includes(lc(r.email))) { operators.push(r.name); continue; }
    cards.push(cardFor(r, { ...data, readiness: data.readiness ?? [], feeds: data.feeds ?? {}, emails: data.emails ?? [], weWrote: data.weWrote ?? [] }, lookups, nowMs));
  }

  const rank: Record<StatusKey, number> = { stalled: 0, attention: 1, on_track: 2 };
  const groups = TRACK_ORDER.map((key) => ({
    key,
    title: TRACK_TITLE[key],
    interns: cards.filter((c) => c.track === key).sort((a, b) => rank[a.status.key] - rank[b.status.key] || a.name.localeCompare(b.name)),
  })).filter((g) => g.interns.length > 0);

  return {
    generatedAt: now.toISOString(),
    lookbackDays: data.lookbackDays || 14,
    emailLookbackDays: data.emailLookbackDays || 21,
    counts: { ...(data.counts as Record<string, number>) },
    totals: {
      interns: cards.length,
      onTrack: cards.filter((c) => c.status.key === 'on_track').length,
      attention: cards.filter((c) => c.status.key === 'attention').length,
      stalled: cards.filter((c) => c.status.key === 'stalled').length,
      repliesOwed: cards.filter((c) => c.emails.awaitingReply).length,
    },
    aliMoves: cards.flatMap((c) => c.aliMoves),
    groups,
    operatorsExcluded: operators,
  };
}
