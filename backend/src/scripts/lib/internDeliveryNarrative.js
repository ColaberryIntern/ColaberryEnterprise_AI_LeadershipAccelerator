// internDeliveryNarrative.js
//
// The judgement layer. Everything upstream of this is arithmetic; this module
// is the only place an LLM touches the dashboard, and it is confined to three
// jobs Ali asked for by name:
//
//   1. a 2-3 sentence "where is this actually at" summary per project
//   2. sentiment of the intern's own updates (are they stuck, confident, quiet)
//   3. open questions aimed at Ali, lifted out of comment threads, each one
//      carrying the Basecamp link that answers it
//
// Design rules:
//   - Fails soft. No OpenAI key, a timeout, or a malformed response degrades to
//     a deterministic fallback summary. The dashboard must still render.
//   - Never invents facts. The prompt carries the computed numbers and the raw
//     comment text; the model narrates, it does not calculate.
//   - Deterministic ordering + temperature 0.2 so two runs on the same snapshot
//     read the same way (idempotency, per CLAUDE.md).

const MODEL = process.env.INTERN_DASHBOARD_MODEL || 'gpt-4o-mini';
const CONCURRENCY = 5;
const LLM_TIMEOUT_MS = 45000;

function loadOpenAI() {
  const path = require('path');
  try { return require('openai').default || require('openai'); }
  catch (_e) {
    const mod = require(path.resolve(__dirname, '../../../../node_modules/openai'));
    return mod.default || mod;
  }
}

function stripEmDashes(s) {
  return String(s || '').replace(/—/g, '-').replace(/–/g, '-');
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try { out[i] = await fn(items[i], i); }
      catch (e) { out[i] = { __error: e.message }; }
    }
  }));
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks. These are what ships when the LLM is unavailable,
// and they are written to be genuinely useful rather than a placeholder.
// ---------------------------------------------------------------------------
function fallbackProjectSummary(p) {
  const bits = [];
  if (p.percentCalculable) {
    bits.push(`${p.name} is ${p.percentComplete}% complete (${p.taskDone} of ${p.taskTotal} tasks closed).`);
  } else {
    bits.push(`${p.name} has ${p.taskTotal} task${p.taskTotal === 1 ? '' : 's'}, too few to compute a meaningful percentage.`);
  }
  if (p.currentRelease) bits.push(`Work sits in ${p.currentRelease.name} (${p.currentRelease.done}/${p.currentRelease.total}).`);
  if (p.daysSinceActivity === null) bits.push('There has been no recorded activity in the window.');
  else if (p.daysSinceActivity === 0) bits.push('It was updated today.');
  else bits.push(`Last update was ${p.daysSinceActivity} day${p.daysSinceActivity === 1 ? '' : 's'} ago.`);
  return stripEmDashes(bits.join(' '));
}

function fallbackSentiment(p) {
  if (p.status === 'STALLED') return { score: -0.6, label: 'Stalled', rationale: 'No activity in the window.' };
  if (p.status === 'AT_RISK') return { score: -0.3, label: 'Slipping', rationale: 'Activity has thinned out.' };
  if (p.status === 'COMPLETE') return { score: 0.8, label: 'Delivered', rationale: 'All tasks closed.' };
  if (p.doneLast7 > 0) return { score: 0.5, label: 'Progressing', rationale: 'Tasks closed in the last 7 days.' };
  return { score: 0, label: 'Neutral', rationale: 'Insufficient signal.' };
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------
function projectPrompt(p, ownerName) {
  const facts = [
    `Project: ${p.name}`,
    `Stream: ${p.stream}`,
    `Owner: ${ownerName || 'unassigned'}`,
    p.percentCalculable
      ? `Completion: ${p.percentComplete}% (${p.taskDone}/${p.taskTotal} tasks)`
      : `Completion: not calculable (${p.taskTotal} task(s) total)`,
    p.currentRelease ? `Current release: ${p.currentRelease.name} at ${p.currentRelease.done}/${p.currentRelease.total}` : 'No release structure',
    `Tasks closed last 7 days: ${p.doneLast7} (prior 7 days: ${p.donePrior7})`,
    `Updates last 7 days: ${p.updatesLast7} (prior 7 days: ${p.updatesPrior7})`,
    `Days since last activity: ${p.daysSinceActivity === null ? 'no activity recorded' : p.daysSinceActivity}`,
    p.overdue.length ? `Past-due tasks: ${p.overdue.length}` : null,
    p.openGateCount ? `Approval gates waiting on Ali: ${p.openGateCount}` : null,
    p.projectedFinish ? `Projected finish at current pace: ${p.projectedFinish}` : 'Projected finish: not computable at current pace',
  ].filter(Boolean).join('\n');

  const threads = p.recentComments.length
    ? p.recentComments.map((c, i) => `[${i + 1}] ${c.author} on ${String(c.createdAt).slice(0, 10)} (task: ${c.todoTitle})\n${c.text}`).join('\n\n')
    : '(no comments in the window)';

  return `FACTS (already computed - do not recalculate, do not contradict):\n${facts}\n\nMOST RECENT UPDATE THREADS:\n${threads}\n\nReturn JSON with exactly these keys:\n{\n  "summary": "2 to 3 sentences on where this project actually stands, what moved recently, and what is blocking it. Written for a busy executive about to run a scrum call. Concrete. No filler.",\n  "sentiment_score": <number between -1 and 1>,\n  "sentiment_label": "<one of: Confident, Progressing, Neutral, Uncertain, Frustrated, Stalled, Delivered>",\n  "sentiment_rationale": "<under 15 words, cite what in the updates drove the read>",\n  "headline": "<under 9 words, the single most important thing about this project right now>",\n  "next_action": "<the one concrete next step, under 16 words>",\n  "risk_note": "<the single biggest risk to this project landing, under 18 words, or empty string if none>"\n}\n\nNever use em-dashes.`;
}

// The question is already known to be open (Ali never replied after it was
// asked). The model's only job is to state it in one line Ali can act on, and
// to drop the ones that are not actually addressed to him.
function questionPrompt(q) {
  return `A team member posted this update on a Basecamp task. Our records show Ali has NOT replied in that thread since.\n\nTask: ${q.taskTitle}\nProject: ${q.projectName}\nAsked by: ${q.askedBy}\nAsked: ${String(q.askedAt).slice(0, 10)} (${q.ageDays} days ago)\n\nUPDATE TEXT:\n${q.rawText}\n\nReturn JSON:\n{\n  "is_for_ali": <true only if this genuinely needs a decision, approval, answer, access, or review FROM Ali. false if it is a status report, a question aimed at someone else, or rhetorical>,\n  "question": "<the ask, restated as one clear sentence in the asker's voice, under 28 words>",\n  "why_it_matters": "<what is blocked until Ali answers, under 16 words>",\n  "urgency": "high|medium|low"\n}\nNever use em-dashes.`;
}

function personPrompt(person, theirProjects) {
  const lines = theirProjects.map((p) => `- ${p.name}: ${p.percentCalculable ? p.percentComplete + '%' : 'n/a'}, status ${p.statusLabel}, ${p.doneLast7} closed last 7d, last activity ${p.daysSinceActivity === null ? 'none' : p.daysSinceActivity + 'd ago'}`).join('\n');
  return `Person: ${person.name}\nProjects they hold:\n${lines}\n\nCadence: ${person.updatesLast7} updates last 7 days vs ${person.updatesPrior7} the week before.\nTasks closed: ${person.doneLast7} last 7 days vs ${person.donePrior7} the week before.\nTrajectory (already computed from those figures, treat as fact): ${person.trajectory}\nLast activity: ${person.daysSinceUpdate === null ? 'none on record' : person.daysSinceUpdate + ' days ago'}\n\nReturn JSON:\n{\n  "summary": "2 to 3 sentences on how this person is tracking across their work and what Ali should say to them on the scrum call. Must be consistent with the trajectory given above.",\n  "talking_point": "<the one thing Ali should raise with them, under 18 words>"\n}\nNever use em-dashes.`;
}

// ---------------------------------------------------------------------------
async function callJson(openai, prompt, systemPrompt) {
  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
  }, { timeout: LLM_TIMEOUT_MS });
  const text = resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
  return JSON.parse(text);
}

const SYSTEM_PROJECT = 'You are a delivery analyst briefing a CEO before a scrum call. You are given precomputed facts and raw update threads. You never recalculate numbers and never contradict the facts given. You are concrete and unsentimental. You output valid JSON only. Never use em-dashes.';
const SYSTEM_PERSON = 'You are a delivery analyst briefing a CEO about one team member before a scrum call. Concrete, fair, unsentimental. Output valid JSON only. Never use em-dashes.';
const SYSTEM_QUESTION = 'You triage a CEO\'s decision inbox. You are strict: only things genuinely requiring Ali personally get through. You output valid JSON only. Never use em-dashes.';

/**
 * Enrich the computed dashboard data in place.
 * Always resolves; degrades to deterministic fallbacks on any failure.
 */
async function enrichNarrative(data, { onProgress = () => {} } = {}) {
  const peopleById = new Map(data.people.map((p) => [p.personId, p]));
  const hasKey = !!process.env.OPENAI_API_KEY;

  if (!hasKey) {
    onProgress('OPENAI_API_KEY absent - using deterministic summaries');
    for (const p of data.projects) {
      p.summary = fallbackProjectSummary(p);
      p.sentiment = fallbackSentiment(p);
      p.headline = p.statusLabel;
      p.nextAction = p.currentRelease ? `Close out ${p.currentRelease.name}` : 'Confirm next task with owner';
      p.riskNote = '';
      p.openQuestionCount = p.openQuestionCandidates.length;
    }
    // Untriaged, but present: better a slightly noisy decision queue than a
    // silently empty one.
    for (const q of data.decisionQueue) if (q.kind === 'open_question') q.triage = 'unreviewed';
    data.screenedOut = [];
    for (const person of data.people) {
      person.summary = `${person.name} holds ${person.projectCount} project${person.projectCount === 1 ? '' : 's'} and posted ${person.updatesInLookback} update${person.updatesInLookback === 1 ? '' : 's'} in the last ${data.lookbackDays} days. Trajectory is ${person.trajectory.toLowerCase()}.`;
      person.talkingPoint = person.openGateCount ? 'They are blocked on your approval gate.' : 'Confirm the next milestone date.';
    }
    data.meta.narrativeMode = 'deterministic';
    return data;
  }

  const OpenAI = loadOpenAI();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  onProgress(`narrating ${data.projects.length} projects with ${MODEL}`);
  const projectResults = await mapLimit(data.projects, CONCURRENCY, async (p) => {
    const owner = p.ownerId ? peopleById.get(p.ownerId) : null;
    return callJson(openai, projectPrompt(p, owner && owner.name), SYSTEM_PROJECT);
  });

  data.projects.forEach((p, i) => {
    const r = projectResults[i];
    if (!r || r.__error || !r.summary) {
      p.summary = fallbackProjectSummary(p);
      p.sentiment = fallbackSentiment(p);
      p.headline = p.statusLabel;
      p.nextAction = p.currentRelease ? `Close out ${p.currentRelease.name}` : 'Confirm next task with owner';
      p.riskNote = '';
      p.narrativeDegraded = true;
      return;
    }
    p.summary = stripEmDashes(r.summary);
    p.headline = stripEmDashes(r.headline || p.statusLabel);
    p.nextAction = stripEmDashes(r.next_action || '');
    p.riskNote = stripEmDashes(r.risk_note || '');
    p.sentiment = {
      score: typeof r.sentiment_score === 'number' ? Math.max(-1, Math.min(1, r.sentiment_score)) : 0,
      label: stripEmDashes(r.sentiment_label || 'Neutral'),
      rationale: stripEmDashes(r.sentiment_rationale || ''),
    };
  });

  // Sharpen the deterministic decision queue. The entries already exist; this
  // pass only rewrites their wording and drops the ones not actually for Ali.
  const questions = data.decisionQueue.filter((q) => q.kind === 'open_question');
  onProgress(`triaging ${questions.length} candidate questions`);
  const questionResults = await mapLimit(questions, CONCURRENCY, (q) => callJson(openai, questionPrompt(q), SYSTEM_QUESTION));

  questions.forEach((q, i) => {
    const r = questionResults[i];
    if (!r || r.__error) { q.triage = 'unreviewed'; return; }
    if (r.is_for_ali === false) { q.triage = 'not_for_ali'; return; }
    q.triage = 'for_ali';
    if (r.question) q.title = stripEmDashes(r.question);
    if (r.why_it_matters) q.whyItMatters = stripEmDashes(r.why_it_matters);
    if (['high', 'medium', 'low'].includes(r.urgency)) q.urgency = r.urgency;
  });

  // Questions the model ruled out stay in the object (never delete evidence)
  // but move to a separate list so the headline queue is trustworthy.
  data.screenedOut = data.decisionQueue.filter((q) => q.triage === 'not_for_ali');
  data.decisionQueue = data.decisionQueue.filter((q) => q.triage !== 'not_for_ali');

  onProgress(`narrating ${data.people.length} people`);
  const personResults = await mapLimit(data.people, CONCURRENCY, async (person) => {
    const theirs = data.projects.filter((p) => person.projectIds.includes(p.projectId));
    if (theirs.length === 0) return null;
    return callJson(openai, personPrompt(person, theirs), SYSTEM_PERSON);
  });

  data.people.forEach((person, i) => {
    const r = personResults[i];
    if (!r || r.__error || !r.summary) {
      person.summary = `${person.name} holds ${person.projectCount} project${person.projectCount === 1 ? '' : 's'} and posted ${person.updatesInLookback} update${person.updatesInLookback === 1 ? '' : 's'} in the last ${data.lookbackDays} days. Trajectory is ${person.trajectory.toLowerCase()}.`;
      person.talkingPoint = person.openGateCount ? 'They are blocked on your approval gate.' : 'Confirm the next milestone date.';
      person.narrativeDegraded = true;
      return;
    }
    // person.trajectory stays as computed. The model describes it, never sets it.
    person.summary = stripEmDashes(r.summary);
    person.talkingPoint = stripEmDashes(r.talking_point || '');
  });

  const urgencyRank = { high: 0, medium: 1, low: 2 };
  data.decisionQueue.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'open_question' ? -1 : 1) ||
      (urgencyRank[a.urgency] ?? 3) - (urgencyRank[b.urgency] ?? 3) ||
      (b.ageDays || 0) - (a.ageDays || 0)
  );

  // Re-point each project's risk flag at the post-triage count so the project
  // cards and the decision queue can never disagree.
  const survivingByProject = new Map();
  for (const q of data.decisionQueue) {
    if (q.kind !== 'open_question') continue;
    survivingByProject.set(q.projectId, (survivingByProject.get(q.projectId) || 0) + 1);
  }
  for (const p of data.projects) {
    const n = survivingByProject.get(p.projectId) || 0;
    p.openQuestionCount = n;
    p.riskFlags = p.riskFlags.filter((f) => f.code !== 'awaiting_ali');
    if (n > 0) p.riskFlags.push({ code: 'awaiting_ali', label: `${n} unanswered question${n === 1 ? '' : 's'} for you`, tone: 'risk' });
  }

  data.meta.narrativeMode = 'llm';
  data.meta.narrativeModel = MODEL;
  data.meta.narrativeDegradedCount = data.projects.filter((p) => p.narrativeDegraded).length;
  data.meta.questionsScreenedOut = (data.screenedOut || []).length;
  return data;
}

module.exports = { enrichNarrative, fallbackProjectSummary, fallbackSentiment, stripEmDashes };
