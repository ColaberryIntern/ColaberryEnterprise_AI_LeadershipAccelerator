// internDeliveryCoachNote.js
//
// Composes the Basecamp comment Ali posts on an intern's project list.
//
// Asked for on 2026-08-25: "a bc message from Ali with a message about their
// project. The goal should be to support but also outline if things are running
// behind. We are striving for accountability and working towards our goals. I
// want the comment to also include what part they are working on and where it
// is relative to the entire completion. Also calculate the projected completion
// date and add that into the messaging. Feel free to quote some of the KPI's we
// have."
//
// DETERMINISTIC ON PURPOSE. Everything upstream of the narrative layer is
// arithmetic and this module stays on that side of the line, even though an LLM
// sits one file away. Three reasons:
//
//   1. The note states a projected completion date and a completion percentage
//      to a named person who will be held to them. A model that rounds 46.5% to
//      "about half" or nudges a date by a week is not an acceptable failure
//      mode here, and "never invents facts" is a weaker guarantee than "cannot
//      invent facts".
//   2. Same snapshot in, same note out. Ali can regenerate the page, reread the
//      message, and paste it an hour later without the wording having shifted
//      underneath him.
//   3. It works with no OPENAI_API_KEY, which is the state this script runs in
//      whenever the dashboard is rebuilt from a cached harvest.
//
// The judgement that would otherwise need a model is encoded as tone branching
// on the computed status, which is the same signal the model would have been
// reading anyway.

const DAY_MS = 86400000;

// Ali's house style, enforced rather than requested: no em-dashes, ever.
function noEmDash(s) {
  return String(s == null ? '' : s).replace(/—/g, '-').replace(/–/g, '-');
}

// Basecamp names arrive in whatever shape the person typed at signup, including
// "OBI, ANAMELECHI KINGSLEY". Flip the comma form and de-shout all-caps so the
// greeting reads like a person wrote it.
function normalizeName(raw) {
  let name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return '';
  if (name.includes(',')) {
    const [last, rest] = name.split(',', 2);
    if (rest && rest.trim()) name = `${rest.trim()} ${last.trim()}`;
  }
  const shouted = name === name.toUpperCase() && /[A-Z]{2,}/.test(name);
  if (shouted) {
    name = name
      .toLowerCase()
      .replace(/(^|[\s'-])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
  }
  return name;
}

// The given name only, for the greeting. This is not the nickname-shortening
// the naming rule forbids (never "Kesetebirhan" to "Kes"); it is the first
// given name exactly as they wrote it.
function greetingName(raw) {
  const norm = normalizeName(raw);
  if (!norm) return 'there';
  return norm.split(' ')[0];
}

function longDate(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function shortDate(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }

// The reply-by date on every ask. Next Friday, never today, never a weekend.
function nextFriday(nowMs) {
  const d = new Date(nowMs);
  const dow = d.getUTCDay();
  let delta = (5 - dow + 7) % 7;
  if (delta === 0) delta = 7;
  return isoDay(nowMs + delta * DAY_MS);
}

function plural(n, one, many) { return n === 1 ? one : (many || `${one}s`); }

// Basecamp list names carry build-system suffixes that read as noise in a
// message to a person. "Selective Service Modernization - BUILD (story-driven)"
// becomes "Selective Service Modernization (build)"; the build/proposal
// distinction is kept because most of these interns hold one of each.
function projectDisplayName(raw) {
  const name = String(raw || '').trim();
  const m = name.match(/^(.*?)\s*-\s*(BUILD|PROPOSAL)\b.*$/i);
  if (!m) return name;
  return `${m[1].trim()} (${m[2].toLowerCase()})`;
}

// How far into the whole build the current release sits. This is the answer to
// "where is it relative to the entire completion", and it is the number an
// intern almost never has: they know their own release, not what finishing it
// buys against the total.
function releasePosition(project) {
  const releases = Array.isArray(project.releases) ? project.releases : [];
  if (!releases.length || !project.currentRelease) return null;
  const idx = releases.findIndex((r) => r.name === project.currentRelease.name);
  if (idx === -1) return null;
  let tasksThrough = 0;
  for (let i = 0; i <= idx; i++) tasksThrough += releases[i].total || 0;
  return {
    index: idx + 1,
    count: releases.length,
    name: project.currentRelease.name,
    done: project.currentRelease.done,
    total: project.currentRelease.total,
    pctAtReleaseEnd: project.taskTotal ? Math.round((tasksThrough / project.taskTotal) * 100) : null,
  };
}

// Closing rate implied by the forecast, expressed per week because that is the
// unit an intern plans in.
function pacePerWeek(project) {
  if (!project.projectedDays || project.projectedDays <= 0) return null;
  const remaining = project.taskRemaining;
  if (!remaining) return null;
  const perWeek = (remaining / project.projectedDays) * 7;
  return Math.round(perWeek * 10) / 10;
}

// What they would have to close weekly to land inside a sensible horizon. Used
// only when there is no credible forecast, so the note still ends with a number
// rather than a shrug.
const RECOVERY_HORIZON_DAYS = 60;
function requiredPerWeek(remaining) {
  if (!remaining) return null;
  return Math.ceil(remaining / (RECOVERY_HORIZON_DAYS / 7));
}

/**
 * Build the note.
 *
 * @param {object} project      a computed project from internDeliveryMetrics
 * @param {object} opts
 * @param {Array}  opts.people  computed people (for names and holdings)
 * @param {object} opts.portfolio  portfolio aggregate, for the cohort benchmark
 * @param {string} opts.generatedAt  ISO timestamp of the snapshot
 * @param {number} [opts.focusPersonId]  scope the note to one person's tasks on
 *                                       a shared list
 * @returns {object} { recipientName, scope, listUrl, paragraphs, plainText, html }
 */
function buildCoachNote(project, { people = [], portfolio = {}, generatedAt, focusPersonId = null } = {}) {
  const nowMs = generatedAt ? new Date(generatedAt).getTime() : Date.now();
  const byId = new Map(people.map((p) => [p.personId, p]));

  const shared = project.ownershipModel === 'shared';
  const focus = focusPersonId ? byId.get(focusPersonId) : null;
  const holding = focus ? (focus.holdings || []).find((h) => h.projectId === project.projectId) : null;

  // Who is being addressed, and about what.
  //   - a focused person on a shared list gets a note about THEIR tasks
  //   - an owned project gets a note to the owner about the whole build
  //   - an unfocused shared list gets a note to everyone on it
  const scope = holding && !holding.isWholeList ? 'person_on_shared_list' : shared ? 'shared_list' : 'project';

  const owner = project.ownerId ? byId.get(project.ownerId) : null;
  const recipient = focus || owner || null;
  const recipientName = recipient ? normalizeName(recipient.name) : null;

  const holders = Array.isArray(project.holders) ? project.holders : [];
  const greeting = scope === 'shared_list'
    ? (holders.length ? `Hi ${holders.map((h) => greetingName(h.name)).join(', ')},` : 'Hi all,')
    : `Hi ${greetingName(recipient ? recipient.name : '')},`;

  // ---- the numbers this note is built on -----------------------------------
  const taskDone = scope === 'person_on_shared_list' ? holding.taskDone : project.taskDone;
  const taskTotal = scope === 'person_on_shared_list' ? holding.taskTotal : project.taskTotal;
  const remaining = taskTotal - taskDone;
  const percent = taskTotal >= 2 ? Math.round((taskDone / taskTotal) * 1000) / 10 : null;
  const pos = scope === 'person_on_shared_list' ? null : releasePosition(project);
  const pace = pacePerWeek(project);
  const finish = project.projectedFinish;
  const quiet = project.daysSinceActivity;
  const overdue = (project.overdue || []).length;

  const label = projectDisplayName(project.name);
  const paras = [];

  // ---- 1. what this is -----------------------------------------------------
  if (scope === 'person_on_shared_list') {
    paras.push(
      `Checking in on your piece of ${label}. You hold ${taskTotal} ${plural(taskTotal, 'task')} on this list `
      + `and this note is about ${plural(taskTotal, 'that one', 'those')}, not the rest of the list.`
    );
  } else if (scope === 'shared_list') {
    paras.push(
      `Checking in on ${label}. This list carries ${holders.length} separate ${plural(holders.length, 'build')}, `
      + `so read the part that is yours: ${holders.map((h) => `${greetingName(h.name)} ${h.doneCount}/${h.taskCount}`).join(', ')}.`
    );
  } else {
    paras.push(`Checking in on ${label}, and I want to give you the real numbers rather than a general nudge.`);
  }

  // ---- 2. where it stands, relative to the whole ---------------------------
  // On a shared list "you" is three different people, so the subject changes.
  const subject = scope === 'shared_list' ? 'The list is' : 'You are';
  const standing = [];
  if (scope === 'person_on_shared_list') {
    // Their tasks by name. On a list where each todo is somebody's whole build,
    // the title IS the project, and naming it is the difference between a form
    // letter and a message about their work.
    const theirs = (project.tasks || []).filter(
      (t) => t.groupKind !== 'approval_gate' && (t.assigneeIds || []).includes(focusPersonId)
    );
    const titles = theirs.slice(0, 3).map((t) => `"${t.title}"`).join(', ');
    if (theirs.length === 1) {
      standing.push(`That task is ${titles}, and it is ${theirs[0].completed ? 'closed' : 'still open'}.`);
    } else {
      standing.push(`${titles}${theirs.length > 3 ? ', and others' : ''}. ${taskDone} of ${taskTotal} closed.`);
    }
  } else if (taskDone === 0 && taskTotal >= 2) {
    // "You are 0% of the way through, with 0 of 48 closed and 48 open" says the
    // same thing three times. Say it once.
    standing.push(`Nothing has been closed on this yet. All ${taskTotal} tasks are still open.`);
  } else if (percent !== null) {
    standing.push(`${subject} ${percent}% of the way through, with ${taskDone} of ${taskTotal} tasks closed and ${remaining} still open.`);
  } else if (taskTotal === 1) {
    standing.push(`You hold a single task here, ${taskDone === 1 ? 'and it is closed' : 'and it is still open'}.`);
  } else {
    standing.push(`There ${plural(taskTotal, 'is', 'are')} ${taskTotal} ${plural(taskTotal, 'task')} on this, ${taskDone} closed.`);
  }
  if (pos) {
    standing.push(
      `The part you are in right now is ${pos.name}, sitting at ${pos.done} of ${pos.total}. `
      + `That is release ${pos.index} of ${pos.count}${pos.pctAtReleaseEnd !== null ? `, so finishing it puts the whole build at roughly ${pos.pctAtReleaseEnd}%` : ''}.`
    );
  } else if (scope === 'project' && !project.releases.length) {
    standing.push('This list has no release structure, so progress is tracked task by task rather than by milestone.');
  }
  paras.push(standing.join(' '));

  // ---- 3. the KPIs ---------------------------------------------------------
  //
  // Scoped notes quote the PERSON's rates, not the list's. Telling Harpreet
  // "2 tasks closed in the last 7 days" because Meera closed two of hers, on a
  // list where they share nothing but the container, is precisely the
  // misattribution this whole change exists to stop.
  const scoped = scope === 'person_on_shared_list';
  const src = scoped && focus ? focus : project;
  const quietDays = scoped && focus ? focus.daysSinceUpdate : quiet;
  const kpi = [];
  kpi.push(
    `On the numbers we track${scoped ? ' for your part' : ''}: ${src.doneLast7} ${plural(src.doneLast7, 'task')} closed in the last 7 days `
    + `against ${src.donePrior7} the week before, on ${src.updatesLast7} ${plural(src.updatesLast7, 'update')} posted.`
  );
  if (quietDays !== null && quietDays !== undefined) {
    kpi.push(quietDays === 0 ? 'Last activity was today.' : `Last activity was ${quietDays} ${plural(quietDays, 'day')} ago.`);
  } else {
    kpi.push('There is no recorded activity in the window at all.');
  }
  const overdueShown = scoped && holding ? holding.overdueCount : overdue;
  if (overdueShown > 0) {
    kpi.push(`${overdueShown} ${plural(overdueShown, 'task')} ${plural(overdueShown, 'is', 'are')} past the due date${scoped ? '' : ' on the list'}.`);
  }
  if (portfolio && portfolio.doneLast7 !== undefined) {
    kpi.push(`For context, the whole intern portfolio closed ${portfolio.doneLast7} tasks last week.`);
  }
  paras.push(kpi.join(' '));

  // ---- 4. the projected finish --------------------------------------------
  if (remaining === 0) {
    paras.push('Projected finish: everything assigned to you here is closed, so there is nothing left to forecast.');
  } else if (remaining === 1) {
    // "You would need to close about 1 a week to land 1 task in 60 days" is
    // arithmetically true and reads as a joke. One task gets one sentence.
    paras.push('Projected finish: this is a single open task, so the finish date is whenever you close it. Closing it this week clears your part of this list entirely.');
  } else if (finish && scope !== 'person_on_shared_list') {
    paras.push(
      `Projected finish: at your current rate of about ${pace} ${pace === 1 ? 'task' : 'tasks'} a week, this lands on `
      + `${longDate(finish)}. That is the date I am working to, and if it does not match the date in your head, I need to hear which one is wrong.`
    );
  } else {
    const need = requiredPerWeek(remaining);
    paras.push(
      `Projected finish: I cannot give you one. Nothing has closed recently enough to forecast from, which is itself the finding. `
      + `To land the remaining ${remaining} ${plural(remaining, 'task')} inside the next ${RECOVERY_HORIZON_DAYS} days you would need to close about ${need} a week.`
    );
  }

  // ---- 5. the read, supportive or direct depending on what is true ---------
  // Scoped notes read the person's status, not the list's. Meera has closed
  // everything of hers on Autonomous; a note telling her the list is at risk
  // would be true about the container and unfair to her.
  const status = scoped && focus ? focus.status : project.status;
  if (status === 'COMPLETE') {
    paras.push(
      'Everything on this is closed, and I want that said plainly before anything else. Finishing a build end to end is the '
      + 'part most people never get to. Send me a short wrap-up when you can: what shipped, what you would do differently, '
      + 'and anything still open that never made it onto the list as a task.'
    );
  } else if (status === 'ON_TRACK') {
    paras.push(
      'This is what on track looks like and I would rather tell you that now than only speak up when something slips. '
      + 'You are closing work every week and the updates are landing where I can see them. Hold the cadence exactly where it is.'
    );
  } else if (status === 'WATCH') {
    const why = overdue > 0
      ? `${overdue} ${plural(overdue, 'task')} ${plural(overdue, 'has', 'have')} gone past the due date`
      : 'the closing rate has dropped week over week';
    paras.push(
      `The build is moving and I am not worried about the direction, but ${why}. That is a this-week fix rather than a `
      + 'next-week one. If a due date is simply wrong, move it and say why. Leaving it red hides the real signal.'
    );
  } else if (status === 'AT_RISK') {
    // A build that has never closed a task has not "slowed", and telling
    // someone their velocity dropped when it was never above zero reads as a
    // form letter. Different problem, different sentence.
    paras.push(taskDone === 0
      ? 'I want to be straight with you rather than diplomatic: this has not started moving yet, and the gap between the '
        + 'plan and the first closed task is where builds quietly die. The fix is not a big push, it is one task closed this '
        + 'week so we have a real rate to plan from. If something is blocking you, name it and I will clear it.'
      : 'I want to be straight with you rather than diplomatic: this has slowed enough that the finish date is drifting, and '
        + 'a date that moves quietly is worse for both of us than one we reset on purpose. I am not looking for an explanation '
        + 'so much as a plan. If something is blocking you, name it and I will clear it.');
  } else if (status === 'STALLED') {
    paras.push(
      `This has been quiet for ${quiet === null || quiet === undefined ? 'the whole window' : `${quiet} days`}, and that is the part I need to change. `
      + 'I would much rather hear that you are stuck than hear nothing. Being blocked is normal and usually fixable in a day. '
      + 'Going dark is the part that actually costs us, because it removes the chance to help while helping is still cheap.'
    );
  } else {
    paras.push(
      'Nothing has moved on this yet. If the scope or the setup is what is in the way, say so and I will clear it. '
      + 'If it is time, tell me what you can realistically commit to each week and we will size the plan to that number '
      + 'rather than to an ambition neither of us believes.'
    );
  }

  // ---- 6. the standard and the ask ----------------------------------------
  if (status !== 'COMPLETE') {
    paras.push(
      'So the standard is clear: I am reading closed tasks and posted updates, not hours or effort. Those two numbers are '
      + 'what every intern build on this programme is measured on, and they are the ones above.'
    );
    paras.push(
      `By ${shortDate(nextFriday(nowMs))}, reply here with two things: the date you believe this finishes, and the one thing `
      + 'most likely to stop that happening. If those two lines are all you have time for, they are enough.'
    );
  }

  paras.push('Ali');

  const plainText = noEmDash([greeting, ...paras].join('\n\n'));

  // Basecamp renders rich HTML in comments, so ship both. The plain-text branch
  // is the fallback for clipboards that will not take text/html.
  const html = noEmDash(
    `<div>${[greeting].concat(paras).map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</div>`
  );

  return {
    projectId: project.projectId,
    projectName: project.name,
    listUrl: project.url,
    recipientName,
    recipientId: recipient ? recipient.personId : null,
    scope,
    greeting,
    paragraphs: paras.map(noEmDash),
    plainText,
    html,
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = {
  buildCoachNote,
  normalizeName,
  greetingName,
  projectDisplayName,
  releasePosition,
  pacePerWeek,
  requiredPerWeek,
  nextFriday,
  noEmDash,
  RECOVERY_HORIZON_DAYS,
};
