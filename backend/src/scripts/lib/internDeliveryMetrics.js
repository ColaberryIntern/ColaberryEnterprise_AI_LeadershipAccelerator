// internDeliveryMetrics.js
//
// Pure transform: raw Basecamp harvest (lib/internDeliveryData.js) -> the single
// data object the dashboard renders from. No I/O, no network, no LLM. Every
// number the HTML shows is computed here exactly once, which is what lets the
// Reference Kit rule "never duplicate data manually" actually hold.
//
// Definitions Ali asked for, made explicit:
//   % complete        = completed delivery tasks / total delivery tasks.
//                       Approval-gate groups (MILESTONE APPROVALS - Ali, phase
//                       gates) are EXCLUDED, because those are Ali's to close,
//                       not the intern's, and counting them punishes the intern
//                       for Ali's queue.
//   not calculable    = a project with fewer than 2 delivery tasks. Reported as
//                       null + reason, never as 0% (which would read as failure).
//   velocity delta    = tasks completed in the last 7 days vs the 7 days before.
//   cadence delta     = updates (comments) in the last 7 days vs the 7 before.
//   active            = at least one update or completion in the lookback window.
//   projected finish  = remaining tasks / completions-per-day over the history
//                       window. Null when velocity is zero (that is "stalled",
//                       not "finishes never").

const { DAY_MS, utcMidnight, isoDay } = require('./internDeliveryData');

// Whose queue is this dashboard about. Ali answers; Ram is the other approver.
const ALI_BC_ID = 17454835;
const RAM_BC_ID = 17346350;

// A comment is a candidate "open question for Ali" if it carries interrogative
// or blocked-on-you signal. Deliberately generous: the LLM pass downstream is
// the precision filter, this is the recall filter. Getting recall from a regex
// and precision from the model is the right way round; the reverse (asking the
// model to volunteer questions while also writing a summary) misses real
// blockers, which is exactly what it did on the first run.
const QUESTION_SIGNAL = /\?|@\s*ali|blocked|waiting on|need your|needs your|your call|your decision|please confirm|please advise|awaiting|unanswered|weigh in|sign off|approve this|can you|could you/i;

// "Akiwam AI" is Akiwam's Claude Code session speaking on her behalf. Those
// comments carry real questions and must not be discarded as bot noise.
function humanNameFor(authorName) {
  return String(authorName || '').replace(/\s+AI$/, '').trim();
}

// --- status model ----------------------------------------------------------
// Ordered worst-first so the dashboard can sort by severity directly.
const STATUS = {
  STALLED: { key: 'STALLED', label: 'Stalled', rank: 0, tone: 'risk' },
  AT_RISK: { key: 'AT_RISK', label: 'At Risk', rank: 1, tone: 'risk' },
  WATCH: { key: 'WATCH', label: 'Watch', rank: 2, tone: 'warning' },
  ON_TRACK: { key: 'ON_TRACK', label: 'On Track', rank: 3, tone: 'good' },
  COMPLETE: { key: 'COMPLETE', label: 'Complete', rank: 4, tone: 'good' },
  NOT_STARTED: { key: 'NOT_STARTED', label: 'Not Started', rank: 5, tone: 'neutral' },
};

function pct(done, total) {
  if (!total) return null;
  return Math.round((done / total) * 1000) / 10;
}

// Percent change with an honest answer for the zero-baseline case. Going 0 -> 3
// is not "infinite% growth"; it is "new activity", and the UI says so.
function deltaPct(current, previous) {
  if (previous === 0 && current === 0) return { value: 0, kind: 'flat' };
  if (previous === 0) return { value: null, kind: 'new' };
  const v = Math.round(((current - previous) / previous) * 1000) / 10;
  return { value: v, kind: v > 0 ? 'up' : v < 0 ? 'down' : 'flat' };
}

function daysBetween(fromIso, toMs) {
  if (!fromIso) return null;
  return Math.max(0, Math.round((utcMidnight(toMs) - utcMidnight(fromIso)) / DAY_MS));
}

function buildDailySeries(timestamps, nowMs, days) {
  const todayUtc = utcMidnight(nowMs);
  const buckets = new Map();
  for (const ts of timestamps) {
    const key = isoDay(utcMidnight(ts));
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayMs = todayUtc - i * DAY_MS;
    const key = isoDay(dayMs);
    series.push({ date: key, count: buckets.get(key) || 0 });
  }
  return series;
}

// The person credited with a project is whoever owns the most delivery tasks on
// it. Ties break toward the person with the most recent activity, then by name
// so the output is deterministic across runs (required for idempotency).
function resolveOwner(todos, peopleById, commentsByAuthor) {
  const tally = new Map();
  for (const t of todos) {
    if (t.groupKind === 'approval_gate') continue;
    for (const a of t.assignees || []) {
      if (!peopleById.has(a.id)) continue;
      tally.set(a.id, (tally.get(a.id) || 0) + 1);
    }
  }
  if (tally.size === 0) return null;
  const ranked = [...tally.entries()].sort((x, y) => {
    if (y[1] !== x[1]) return y[1] - x[1];
    const xa = commentsByAuthor.get(x[0]) || 0;
    const ya = commentsByAuthor.get(y[0]) || 0;
    if (ya !== xa) return ya - xa;
    const xn = (peopleById.get(x[0]) || {}).name || '';
    const yn = (peopleById.get(y[0]) || {}).name || '';
    return xn.localeCompare(yn);
  });
  return ranked[0][0];
}

function summariseReleases(project) {
  const byGroup = new Map();
  for (const t of project.todos) {
    if (t.groupKind !== 'release') continue;
    if (!byGroup.has(t.groupId)) {
      byGroup.set(t.groupId, {
        groupId: t.groupId,
        name: t.groupName,
        index: t.releaseIndex,
        position: t.groupPosition,
        total: 0,
        done: 0,
        url: null,
      });
    }
    const g = byGroup.get(t.groupId);
    g.total += 1;
    if (t.completed) g.done += 1;
  }
  const releases = [...byGroup.values()].sort(
    (a, b) => (a.index ?? 999) - (b.index ?? 999) || a.position - b.position
  );
  for (const r of releases) r.pct = pct(r.done, r.total);
  return releases;
}

function summariseGates(project, nowMs) {
  return project.todos
    .filter((t) => t.groupKind === 'approval_gate')
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      url: t.url,
      completed: t.completed,
      dueOn: t.dueOn,
      ageDays: daysBetween(t.createdAt, nowMs),
      projectName: project.name,
      projectUrl: project.url,
      stream: project.stream,
    }));
}

// Find questions aimed at Ali that he has not answered.
//
// "Unanswered" is decided by the record, not by the model: a question is open
// if Ali has not commented in that same todo thread AFTER it was asked. That
// single rule kills the false positives (already handled) and the false
// negatives (buried three comments deep) that a pure LLM pass produces.
function findOpenQuestions(project, nowMs) {
  const byTodo = new Map();
  for (const c of project.comments) {
    if (!byTodo.has(c.todoId)) byTodo.set(c.todoId, []);
    byTodo.get(c.todoId).push(c);
  }
  for (const list of byTodo.values()) list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  const candidates = [];
  for (const [todoId, thread] of byTodo.entries()) {
    const aliReplies = thread.filter((c) => c.authorId === ALI_BC_ID).map((c) => c.createdAt);
    const lastAliReply = aliReplies.length ? aliReplies[aliReplies.length - 1] : null;
    for (const c of thread) {
      if (c.authorId === ALI_BC_ID || c.authorId === RAM_BC_ID) continue;
      if (!QUESTION_SIGNAL.test(c.text)) continue;
      const answered = !!lastAliReply && lastAliReply > c.createdAt;
      if (answered) continue;
      candidates.push({
        commentId: c.id,
        todoId,
        todoTitle: c.todoTitle,
        todoUrl: c.todoUrl,
        askedBy: humanNameFor(c.authorName),
        askedById: c.authorId,
        askedAt: c.createdAt,
        ageDays: daysBetween(c.createdAt, nowMs),
        url: c.url,
        text: c.text.slice(0, 1600),
      });
    }
  }
  // Newest first, and cap so one chatty thread cannot flood the queue.
  return candidates.sort((a, b) => (a.askedAt < b.askedAt ? 1 : -1)).slice(0, 12);
}

function computeProject(project, ctx) {
  const { nowMs, lookbackDays, historyDays, peopleById, commentsByAuthor } = ctx;
  const lookbackCutoff = nowMs - lookbackDays * DAY_MS;
  const week1Cutoff = nowMs - 7 * DAY_MS;
  const week2Cutoff = nowMs - 14 * DAY_MS;

  const delivery = project.todos.filter((t) => t.groupKind !== 'approval_gate');
  const done = delivery.filter((t) => t.completed);
  const total = delivery.length;

  const calculable = total >= 2;
  const percentComplete = calculable ? pct(done.length, total) : null;
  const percentReason = calculable
    ? null
    : total === 1
      ? 'Single task only - percentage is not meaningful'
      : 'No delivery tasks on this list';

  // Velocity: completions per 7-day bucket.
  const completionTimes = done.map((t) => new Date(t.completedAt || t.updatedAt || t.createdAt).getTime()).filter((n) => !Number.isNaN(n));
  const doneLast7 = completionTimes.filter((ts) => ts >= week1Cutoff).length;
  const donePrior7 = completionTimes.filter((ts) => ts >= week2Cutoff && ts < week1Cutoff).length;
  const velocityDelta = deltaPct(doneLast7, donePrior7);

  // Cadence: comments per 7-day bucket (all authors, this project).
  const commentTimes = project.comments.map((c) => new Date(c.createdAt).getTime()).filter((n) => !Number.isNaN(n));
  const updatesLast7 = commentTimes.filter((ts) => ts >= week1Cutoff).length;
  const updatesPrior7 = commentTimes.filter((ts) => ts >= week2Cutoff && ts < week1Cutoff).length;
  const cadenceDelta = deltaPct(updatesLast7, updatesPrior7);

  const lastCommentAt = project.comments.reduce((max, c) => (!max || c.createdAt > max ? c.createdAt : max), null);
  const lastCompletionAt = done.reduce((max, t) => {
    const v = t.completedAt || null;
    return !max || (v && v > max) ? v || max : max;
  }, null);
  const lastActivityAt = [lastCommentAt, lastCompletionAt].filter(Boolean).sort().pop() || null;
  const daysSinceActivity = daysBetween(lastActivityAt, nowMs);

  // Current release = lowest-index release still carrying open work.
  const releases = summariseReleases(project);
  const currentRelease = releases.find((r) => r.done < r.total) || null;

  // Forecast. completions/day over the history window; deliberately conservative
  // (uses the whole window, not the best week).
  const completionsInHistory = completionTimes.filter((ts) => ts >= nowMs - historyDays * DAY_MS).length;
  const perDay = completionsInHistory / historyDays;
  const remaining = total - done.length;
  let projectedFinish = null;
  let projectedDays = null;
  if (remaining === 0) {
    projectedFinish = lastCompletionAt ? isoDay(new Date(lastCompletionAt).getTime()) : null;
    projectedDays = 0;
  } else if (perDay > 0) {
    projectedDays = Math.ceil(remaining / perDay);
    // Cap the horizon: anything past ~2 years is noise, report it as such.
    if (projectedDays <= 730) projectedFinish = isoDay(nowMs + projectedDays * DAY_MS);
  }

  const overdue = delivery.filter((t) => !t.completed && t.dueOn && t.dueOn < isoDay(nowMs));
  const gates = summariseGates(project, nowMs);
  const openGates = gates.filter((g) => !g.completed);

  // Status model.
  let status;
  if (total === 0) status = STATUS.NOT_STARTED;
  else if (remaining === 0) status = STATUS.COMPLETE;
  else if (done.length === 0 && (daysSinceActivity === null || daysSinceActivity > lookbackDays)) status = STATUS.NOT_STARTED;
  else if (daysSinceActivity === null || daysSinceActivity >= 14) status = STATUS.STALLED;
  else if (daysSinceActivity >= 7 || (doneLast7 === 0 && donePrior7 === 0)) status = STATUS.AT_RISK;
  else if (overdue.length > 0 || (velocityDelta.kind === 'down' && velocityDelta.value !== null && velocityDelta.value <= -50)) status = STATUS.WATCH;
  else status = STATUS.ON_TRACK;

  const riskFlags = [];
  if (daysSinceActivity !== null && daysSinceActivity >= 14) riskFlags.push({ code: 'dark', label: `No update in ${daysSinceActivity} days`, tone: 'risk' });
  else if (daysSinceActivity !== null && daysSinceActivity >= 7) riskFlags.push({ code: 'slowing', label: `Last update ${daysSinceActivity} days ago`, tone: 'warning' });
  if (overdue.length) riskFlags.push({ code: 'overdue', label: `${overdue.length} task${overdue.length === 1 ? '' : 's'} past due`, tone: 'risk' });
  if (openGates.length) riskFlags.push({ code: 'gate', label: `${openGates.length} approval gate${openGates.length === 1 ? '' : 's'} waiting on you`, tone: 'warning' });
  if (doneLast7 === 0 && remaining > 0 && total >= 2) riskFlags.push({ code: 'no_progress', label: 'No tasks closed in 7 days', tone: 'warning' });
  if (velocityDelta.value !== null && velocityDelta.value <= -50) riskFlags.push({ code: 'velocity_drop', label: `Velocity down ${Math.abs(velocityDelta.value)}%`, tone: 'warning' });

  const openQuestionCandidates = findOpenQuestions(project, nowMs);
  if (openQuestionCandidates.length) {
    riskFlags.push({ code: 'awaiting_ali', label: `${openQuestionCandidates.length} unanswered question${openQuestionCandidates.length === 1 ? '' : 's'} for you`, tone: 'risk' });
  }

  const ownerId = resolveOwner(project.todos, peopleById, commentsByAuthor);
  if (!ownerId && total > 0) riskFlags.push({ code: 'unowned', label: 'No one is assigned to this work', tone: 'risk' });
  const contributorIds = [...new Set(
    project.todos.flatMap((t) => (t.assignees || []).map((a) => a.id)).filter((id) => peopleById.has(id))
  )];

  // First activity anchors the gantt bar.
  const startCandidates = [project.createdAt, ...project.todos.map((t) => t.createdAt)].filter(Boolean).sort();
  const startedOn = startCandidates.length ? isoDay(new Date(startCandidates[0]).getTime()) : null;

  return {
    projectId: project.projectId,
    name: project.name,
    stream: project.stream,
    bucketId: project.bucketId,
    bucketName: project.bucketName,
    url: project.url,
    ownerId,
    contributorIds,
    startedOn,
    taskTotal: total,
    taskDone: done.length,
    taskRemaining: remaining,
    percentComplete,
    percentCalculable: calculable,
    percentReason,
    releases,
    releaseCount: releases.length,
    currentRelease: currentRelease
      ? { name: currentRelease.name, index: currentRelease.index, done: currentRelease.done, total: currentRelease.total, pct: currentRelease.pct }
      : null,
    doneLast7,
    donePrior7,
    velocityDelta,
    updatesLast7,
    updatesPrior7,
    cadenceDelta,
    updatesInLookback: commentTimes.filter((ts) => ts >= lookbackCutoff).length,
    lastActivityAt,
    daysSinceActivity,
    projectedFinish,
    projectedDays,
    overdue: overdue.map((t) => ({ taskId: t.id, title: t.title, url: t.url, dueOn: t.dueOn })),
    gates,
    openGateCount: openGates.length,
    status: status.key,
    statusLabel: status.label,
    statusTone: status.tone,
    statusRank: status.rank,
    riskFlags,
    openQuestionCandidates,
    dailyCompletions: buildDailySeries(completionTimes, nowMs, lookbackDays),
    dailyUpdates: buildDailySeries(commentTimes, nowMs, lookbackDays),
    // Task list retained in full - the Reference Kit forbids summarising detail away.
    tasks: project.todos.map((t) => ({
      taskId: t.id,
      title: t.title,
      completed: t.completed,
      completedAt: t.completedAt,
      dueOn: t.dueOn,
      createdAt: t.createdAt,
      url: t.url,
      groupName: t.groupName,
      groupKind: t.groupKind,
      releaseIndex: t.releaseIndex,
      commentsCount: t.commentsCount,
      assignees: (t.assignees || []).map((a) => a.name),
      overdue: !t.completed && !!t.dueOn && t.dueOn < isoDay(nowMs),
    })),
    recentComments: project.comments
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 12)
      .map((c) => ({
        author: c.authorName,
        authorId: c.authorId,
        createdAt: c.createdAt,
        text: c.text.slice(0, 700),
        todoTitle: c.todoTitle,
        url: c.url,
      })),
  };
}

function computePerson(person, projects, comments, ctx) {
  const { nowMs, lookbackDays } = ctx;
  const week1Cutoff = nowMs - 7 * DAY_MS;
  const week2Cutoff = nowMs - 14 * DAY_MS;
  const lookbackCutoff = nowMs - lookbackDays * DAY_MS;

  const mine = projects.filter((p) => p.ownerId === person.id || p.contributorIds.includes(person.id));
  const owned = projects.filter((p) => p.ownerId === person.id);
  const myComments = comments.filter((c) => c.authorId === person.id);
  const times = myComments.map((c) => new Date(c.createdAt).getTime());

  const updatesLast7 = times.filter((t) => t >= week1Cutoff).length;
  const updatesPrior7 = times.filter((t) => t >= week2Cutoff && t < week1Cutoff).length;
  const updatesInLookback = times.filter((t) => t >= lookbackCutoff).length;
  const cadenceDelta = deltaPct(updatesLast7, updatesPrior7);

  // Completions credited to this person, across every project they touch.
  const myCompletions = [];
  for (const p of mine) {
    for (const t of p.tasks) {
      if (!t.completed || !t.completedAt) continue;
      if (!t.assignees.includes(person.name)) continue;
      myCompletions.push(new Date(t.completedAt).getTime());
    }
  }
  const doneLast7 = myCompletions.filter((t) => t >= week1Cutoff).length;
  const donePrior7 = myCompletions.filter((t) => t >= week2Cutoff && t < week1Cutoff).length;
  const velocityDelta = deltaPct(doneLast7, donePrior7);

  const lastActivityAt = [
    myComments.reduce((max, c) => (!max || c.createdAt > max ? c.createdAt : max), null),
    myCompletions.length ? new Date(Math.max(...myCompletions)).toISOString() : null,
  ].filter(Boolean).sort().pop() || null;
  const daysSinceUpdate = daysBetween(lastActivityAt, nowMs);

  // Two distinct signals, deliberately not merged:
  //   hasUpdateInWindow = Ali's literal rule ("gave an update in the past 2 weeks")
  //   active            = that, OR they closed tasks without commenting. Someone
  //                       shipping work silently is still working, and hiding them
  //                       would misreport the portfolio.
  const completionsInLookback = myCompletions.filter((t) => t >= lookbackCutoff).length;
  const hasUpdateInWindow = updatesInLookback > 0;
  const active = hasUpdateInWindow || completionsInLookback > 0;

  const taskTotal = owned.reduce((s, p) => s + p.taskTotal, 0);
  const taskDone = owned.reduce((s, p) => s + p.taskDone, 0);
  const percentComplete = taskTotal >= 2 ? pct(taskDone, taskTotal) : null;

  const worst = mine.slice().sort((a, b) => a.statusRank - b.statusRank)[0] || null;

  // Person-level status, read from THIS PERSON's own signals.
  //
  // Deliberately not the same thing as "worst project they touch". Someone at
  // 80% and shipping daily should not read as Stalled because one dormant list
  // they are a contributor on has not moved. The worst-project figure is still
  // carried (worstStatusLabel) but it is a secondary fact, not their headline.
  // Trajectory, computed rather than narrated. The model kept labelling people
  // "Slowing" whose closure and update counts had both gone UP, which is the
  // exact kind of quietly-wrong signal that erodes trust in the whole report.
  // Arithmetic decides direction; the model only gets to describe it.
  const movedUp = doneLast7 > donePrior7 || (updatesLast7 > updatesPrior7 && doneLast7 >= donePrior7);
  const movedDown = doneLast7 < donePrior7 || (updatesLast7 < updatesPrior7 && doneLast7 <= donePrior7);
  let trajectory;
  if (daysSinceUpdate === null || daysSinceUpdate >= 14) trajectory = 'Stalled';
  else if (updatesLast7 === 0 && doneLast7 === 0) trajectory = 'Stalled';
  else if (updatesPrior7 === 0 && donePrior7 === 0) trajectory = 'Just started';
  else if (movedUp) trajectory = 'Accelerating';
  else if (movedDown) trajectory = 'Slowing';
  else trajectory = 'Steady';

  const ownedOpen = owned.filter((p) => p.taskRemaining > 0);
  let personStatus;
  if (owned.length > 0 && ownedOpen.length === 0) personStatus = STATUS.COMPLETE;
  else if (daysSinceUpdate === null || daysSinceUpdate >= 14) personStatus = STATUS.STALLED;
  else if (daysSinceUpdate >= 7) personStatus = STATUS.AT_RISK;
  else if (doneLast7 === 0 && updatesLast7 === 0) personStatus = STATUS.AT_RISK;
  else if (doneLast7 === 0 || daysSinceUpdate > 3) personStatus = STATUS.WATCH;
  else personStatus = STATUS.ON_TRACK;

  return {
    personId: person.id,
    name: person.name,
    email: person.email,
    streams: person.streams,
    active,
    hasUpdateInWindow,
    completionsInLookback,
    activityState: active ? (hasUpdateInWindow ? 'ACTIVE' : 'SHIPPING_QUIET') : 'DORMANT',
    projectIds: mine.map((p) => p.projectId),
    ownedProjectIds: owned.map((p) => p.projectId),
    projectCount: mine.length,
    taskTotal,
    taskDone,
    percentComplete,
    percentCalculable: taskTotal >= 2,
    percentReason: taskTotal >= 2 ? null : taskTotal === 1 ? 'Single task only - percentage is not meaningful' : 'No owned delivery tasks',
    updatesLast7,
    updatesPrior7,
    updatesInLookback,
    cadenceDelta,
    doneLast7,
    donePrior7,
    velocityDelta,
    lastActivityAt,
    daysSinceUpdate,
    trajectory,
    status: personStatus.key,
    statusLabel: personStatus.label,
    statusTone: personStatus.tone,
    statusRank: personStatus.rank,
    worstStatus: worst ? worst.status : null,
    worstStatusLabel: worst ? worst.statusLabel : null,
    worstStatusTone: worst ? worst.statusTone : 'neutral',
    worstStatusProject: worst ? worst.name : null,
    openGateCount: mine.reduce((s, p) => s + p.openGateCount, 0),
    overdueCount: mine.reduce((s, p) => s + p.overdue.length, 0),
    dailyUpdates: buildDailySeries(times, nowMs, lookbackDays),
    dailyCompletions: buildDailySeries(myCompletions, nowMs, lookbackDays),
  };
}

/**
 * @param {object} raw  output of harvestDelivery()
 * @returns {object} the dashboard data object
 */
function computeDelivery(raw) {
  const nowMs = new Date(raw.generatedAt).getTime();
  const lookbackDays = raw.lookbackDays || 14;
  const historyDays = raw.historyDays || 28;

  const peopleById = new Map(raw.people.map((p) => [p.id, p]));
  const allComments = raw.projects.flatMap((p) => p.comments);

  const commentsByAuthor = new Map();
  for (const c of allComments) {
    if (!peopleById.has(c.authorId)) continue;
    commentsByAuthor.set(c.authorId, (commentsByAuthor.get(c.authorId) || 0) + 1);
  }

  const ctx = { nowMs, lookbackDays, historyDays, peopleById, commentsByAuthor };

  const projects = raw.projects
    .map((p) => computeProject(p, ctx))
    .sort((a, b) => a.statusRank - b.statusRank || (b.taskTotal - a.taskTotal));

  // Only people who actually hold work appear. A Basecamp project member with
  // zero assigned tasks and zero comments is not an intern on a project.
  const candidateIds = new Set([
    ...projects.flatMap((p) => p.contributorIds),
    ...allComments.map((c) => c.authorId),
  ]);
  const people = raw.people
    .filter((p) => candidateIds.has(p.id))
    .map((p) => computePerson(p, projects, allComments, ctx))
    .filter((p) => p.projectCount > 0 || p.updatesInLookback > 0)
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.statusRank - b.statusRank || (b.updatesInLookback - a.updatesInLookback) || a.name.localeCompare(b.name);
    });

  const activePeople = people.filter((p) => p.active);
  const activeProjectIds = new Set(activePeople.flatMap((p) => p.projectIds));

  const portfolio = {
    peopleTotal: people.length,
    peopleActive: activePeople.length,
    peopleReporting: people.filter((p) => p.hasUpdateInWindow).length,
    peopleDormant: people.length - activePeople.length,
    projectsTotal: projects.length,
    projectsActive: activeProjectIds.size,
    taskTotal: projects.reduce((s, p) => s + p.taskTotal, 0),
    taskDone: projects.reduce((s, p) => s + p.taskDone, 0),
    doneLast7: projects.reduce((s, p) => s + p.doneLast7, 0),
    donePrior7: projects.reduce((s, p) => s + p.donePrior7, 0),
    updatesLast7: projects.reduce((s, p) => s + p.updatesLast7, 0),
    updatesPrior7: projects.reduce((s, p) => s + p.updatesPrior7, 0),
    overdueTotal: projects.reduce((s, p) => s + p.overdue.length, 0),
    openGates: projects.reduce((s, p) => s + p.openGateCount, 0),
    byStatus: Object.values(STATUS).reduce((acc, s) => {
      acc[s.key] = projects.filter((p) => p.status === s.key).length;
      return acc;
    }, {}),
    byStream: [...new Set(projects.map((p) => p.stream))].map((stream) => ({
      stream,
      projects: projects.filter((p) => p.stream === stream).length,
      taskTotal: projects.filter((p) => p.stream === stream).reduce((s, p) => s + p.taskTotal, 0),
      taskDone: projects.filter((p) => p.stream === stream).reduce((s, p) => s + p.taskDone, 0),
    })),
  };
  portfolio.percentComplete = pct(portfolio.taskDone, portfolio.taskTotal);
  portfolio.velocityDelta = deltaPct(portfolio.doneLast7, portfolio.donePrior7);
  portfolio.cadenceDelta = deltaPct(portfolio.updatesLast7, portfolio.updatesPrior7);
  portfolio.dailyCompletions = buildDailySeries(
    projects.flatMap((p) => p.tasks.filter((t) => t.completed && t.completedAt).map((t) => new Date(t.completedAt).getTime())),
    nowMs,
    lookbackDays
  );
  portfolio.dailyUpdates = buildDailySeries(
    allComments.map((c) => new Date(c.createdAt).getTime()),
    nowMs,
    lookbackDays
  );

  // Deterministic half of the decision queue: every open approval gate is, by
  // definition, a thing waiting on Ali. The LLM pass adds the questions buried
  // in comment threads on top of this.
  const gateQueue = projects.flatMap((p) =>
    p.gates
      .filter((g) => !g.completed)
      .map((g) => ({
        kind: 'approval_gate',
        source: 'basecamp',
        title: g.title,
        // Story-build gates name their approver in the title ("Ram approves
        // milestone R2..."). Routing them means Ali's queue is Ali's queue.
        approver: /\bram\b/i.test(g.title) ? 'Ram' : 'Ali',
        projectId: p.projectId,
        projectName: p.name,
        projectUrl: p.url,
        stream: p.stream,
        ownerId: p.ownerId,
        url: g.url,
        ageDays: g.ageDays,
        urgency: g.ageDays !== null && g.ageDays > 21 ? 'high' : g.ageDays !== null && g.ageDays > 7 ? 'medium' : 'low',
      }))
  );

  // Deterministic open questions. The narrative pass rewrites `title` into a
  // crisp one-liner where it can, but the entry exists either way, so a blocker
  // can never vanish because an LLM call failed.
  const questionQueue = projects.flatMap((p) =>
    p.openQuestionCandidates.map((q) => ({
      kind: 'open_question',
      source: 'thread',
      approver: 'Ali',
      title: q.text.replace(/\s+/g, ' ').slice(0, 180),
      rawText: q.text,
      askedBy: q.askedBy,
      askedAt: q.askedAt,
      commentId: q.commentId,
      taskTitle: q.todoTitle,
      projectId: p.projectId,
      projectName: p.name,
      projectUrl: p.url,
      stream: p.stream,
      ownerId: p.ownerId,
      url: q.url,
      answerUrl: q.todoUrl,
      ageDays: q.ageDays,
      urgency: q.ageDays !== null && q.ageDays > 14 ? 'high' : q.ageDays !== null && q.ageDays > 5 ? 'medium' : 'low',
    }))
  );

  const urgencyRank = { high: 0, medium: 1, low: 2 };
  const decisionQueue = [...questionQueue, ...gateQueue].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'open_question' ? -1 : 1) ||
      (urgencyRank[a.urgency] ?? 3) - (urgencyRank[b.urgency] ?? 3) ||
      (b.ageDays || 0) - (a.ageDays || 0)
  );

  return {
    generatedAt: raw.generatedAt,
    accountId: raw.accountId,
    lookbackDays,
    historyDays,
    portfolio,
    people,
    projects,
    decisionQueue,
    meta: {
      commentCount: allComments.length,
      scope: raw.scope,
    },
  };
}

module.exports = { computeDelivery, deltaPct, pct, buildDailySeries, STATUS };
