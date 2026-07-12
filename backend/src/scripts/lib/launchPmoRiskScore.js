// Launch PMO - deterministic task risk scorer.
//
// PMBOK 8th ed. Risk Performance Domain, expressed as a 5x5 probability-impact
// matrix (Figure 5-14). This is intentionally NOT an LLM call: production
// systems must be deterministic (see CLAUDE.md Core Principle). Given the same
// task + context it always returns the same score, and every point is
// explained in `drivers` so a human can audit why a task is flagged.
//
//   probability (1-5) = how likely is this task to SLIP?
//   impact      (1-5) = if it slips, how much does the launch hurt?
//   score       = probability * impact (1-25)
//   band        = LOW | MEDIUM | HIGH | CRITICAL  (standard green/amber/red)
//
// Works on two task shapes without an adapter:
//   - generator output: { content, tier:'ai'|'human', owner_handle, due_on, dependencies }
//   - daily-update read: { content, tier:'AI'|'HUMAN'|'EITHER', assignees:[], due_on }
// Graph-aware signals (onCriticalPath, downstreamCount) are optional and come
// from launchPmoCriticalPath at read time; at generation time they are absent
// and impact leans on launch-gate + proximity, which is the honest first pass.
//
// Failure-first: bad/empty input never throws. A null task returns a LOW/0
// score with a 'no task' driver. Missing due date is itself treated as a
// probability driver (untracked work slips). No Date.now() - the caller passes
// todayIso/launchIso so the score is reproducible in tests and across reruns.

const BANDS = [
  { band: 'CRITICAL', min: 15 },
  { band: 'HIGH', min: 9 },
  { band: 'MEDIUM', min: 4 },
  { band: 'LOW', min: 0 },
];

// Content that gates the launch: if this slips, the launch date itself moves.
const LAUNCH_GATE_RE = /\b(launch|go[- ]?live|golive|ship|submit|publish|cut ?over|cutover|gate|final(ize)?|sign[- ]?off)\b/i;
const APPROVAL_RE = /^(review|approve|review and approve|finalize|sign[- ]?off|conduct (final )?review)\b/i;

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Whole-calendar-days from bIso to aIso (a - b). null on unparseable input.
function daysBetween(aIso, bIso) {
  const a = parseYmd(aIso);
  const b = parseYmd(bIso);
  if (a === null || b === null) return null;
  return Math.round((a - b) / 86400000);
}
function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

function bandFor(score) {
  return BANDS.find((b) => score >= b.min).band;
}

// Normalize either task shape into the fields the scorer reads.
function normalize(task) {
  const t = task || {};
  const tierRaw = String(t.tier || '').toUpperCase();
  const tier = tierRaw === 'AI' ? 'AI' : tierRaw === 'HUMAN' ? 'HUMAN' : tierRaw === 'EITHER' ? 'EITHER' : 'EITHER';
  const owner = t.owner_handle != null
    ? String(t.owner_handle)
    : (Array.isArray(t.assignees) ? t.assignees.join(', ') : '');
  const unassigned = !owner || /^unassigned$/i.test(owner.trim());
  const depsRaw = String(t.dependencies || '').trim();
  const hasDeps = depsRaw !== '' && !/^none\.?$/i.test(depsRaw);
  return { content: String(t.content || ''), tier, unassigned, hasDeps, due_on: t.due_on || null };
}

/**
 * Score a single task. ctx: { todayIso, launchIso, onCriticalPath?, downstreamCount? }.
 * Returns { probability, impact, score, band, drivers:[...] }.
 */
function scoreTaskRisk(task, ctx = {}) {
  if (!task || (!task.content && !task.due_on)) {
    return { probability: 1, impact: 1, score: 1, band: 'LOW', drivers: ['no task data'] };
  }
  const n = normalize(task);
  const drivers = [];

  // ----- Probability: how likely to slip -----
  let p = 1;
  if (n.tier === 'HUMAN') { p += 1; drivers.push('human task (slips more than deterministic AI runs)'); }
  if (n.unassigned) { p += 1; drivers.push('no owner assigned'); }
  const daysToDue = ctx.todayIso ? daysBetween(n.due_on, ctx.todayIso) : null;
  if (!n.due_on) { p += 1; drivers.push('no due date (untracked work slips)'); }
  else if (daysToDue !== null) {
    if (daysToDue < 0) { p += 3; drivers.push(`already overdue by ${Math.abs(daysToDue)}d`); }
    else if (daysToDue <= 2) { p += 2; drivers.push('due in <=2 days, little lead time'); }
    else if (daysToDue <= 5) { p += 1; drivers.push('due within a week'); }
  }
  if (n.hasDeps) { p += 1; drivers.push('waits on upstream dependency'); }
  const probability = clamp(p, 1, 5);

  // ----- Impact: consequence if it slips -----
  let i = 1;
  const isGate = LAUNCH_GATE_RE.test(n.content);
  if (isGate) { i += 2; drivers.push('launch-gate task (slip moves the launch date)'); }
  if (ctx.onCriticalPath) { i += 1; drivers.push('on the critical path'); }
  const down = Number(ctx.downstreamCount || 0);
  if (down >= 3) { i += 2; drivers.push(`${down} tasks depend on this`); }
  else if (down >= 1) { i += 1; drivers.push(`${down} task(s) depend on this`); }
  const launchBuffer = ctx.launchIso && n.due_on ? daysBetween(ctx.launchIso, n.due_on) : null;
  if (launchBuffer !== null && launchBuffer >= 0 && launchBuffer <= 5) { i += 1; drivers.push('lands in the final launch week, little recovery room'); }
  if (APPROVAL_RE.test(n.content) && down >= 1) { i += 1; drivers.push('approval gate blocking downstream work'); }
  const impact = clamp(i, 1, 5);

  const score = probability * impact;
  return { probability, impact, score, band: bandFor(score), drivers };
}

/**
 * Score a list of tasks and return them sorted most-risky first. Each element
 * is { ...task, risk }. ctxFor(task) may return per-task graph context; if
 * omitted, sharedCtx is used for all.
 */
function rankTasksByRisk(tasks, sharedCtx = {}, ctxFor = null) {
  return (tasks || [])
    .map((t) => ({ task: t, risk: scoreTaskRisk(t, ctxFor ? { ...sharedCtx, ...ctxFor(t) } : sharedCtx) }))
    .sort((a, b) => b.risk.score - a.risk.score || (a.task.due_on || '9999').localeCompare(b.task.due_on || '9999'));
}

module.exports = { scoreTaskRisk, rankTasksByRisk, bandFor, daysBetween, BANDS, LAUNCH_GATE_RE };
