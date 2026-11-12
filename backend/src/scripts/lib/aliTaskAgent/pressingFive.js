/**
 * pressingFive - pick the five most pressing tasks, and the ONE move worth making today.
 *
 * Ali, 2026-11-11: "identify the 5 most pressing items, with a walkthrough of said 5 items and the
 * prompt for the single best thing to do". This is a PREVIEW to be finalised, so every weight is
 * named, every pick carries the reasons that put it there, and nothing is a model's opinion.
 *
 * WHAT "PRESSING" MEANS HERE
 *
 * Time pressure first: a task has to be due within two weeks or overdue by up to 60 days to qualify
 * at all. Past 60 days it is dormant, which is a disposition question (keep, re-date, dismiss), not a
 * pressing one; the board handles those. Then four adjustments, each shown on the report:
 *
 *   +20  a decision only Ali can make: the TICKET'S OWN WORDS frame a decision or approval, or it
 *        names a decision owner or a "Decide by" date
 *   +15  needs Ali, not a session: the ticket says a person must do it, or the mirror classifies
 *        it human_required (NOT counted as a decision: on 2026-11-11 the first preview called
 *        "Build the HTML CRM demo" a decision because workOrder folds human_required into "ask")
 *   +15  it sits in an approval-gate LIST (e.g. "MILESTONE APPROVALS"): other work waits on it.
 *        Matched on the list name only, so an "Approve ..." title is not counted twice
 *   +10  a commitment to someone outside (Client delivery, Government contracting)
 *   -25  machine-generated scaffolding
 * A task earns at most one of the first two.
 *
 * The urgency_score column is NOT used: it adds a flat +40 to anything overdue, so it measures
 * neglect rather than urgency (measured 2026-11-11). A ticket's own "Decide by" date outranks its
 * Basecamp due date when both exist, because the ticket's words are the better evidence.
 *
 * At most two picks come from one list, so five siblings of one list cannot crowd out everything.
 * Pure: work orders and summaries in, picks out.
 */

const GATE = /\bapprovals?\b|\bsign[- ]?off\b|\bgo or no-go\b|\bphase gates?\b/i;
/** A decision, read from the ticket's own title. "Approve X" and "Decide Y" are; "Build Z" is not. */
const DECISION = /\bdecisions?\b|\bdecide\b|\bgo or no-go\b|\bapprove\b|\battest\b|\bsign[- ]?off\b|\bchoose\b/i;

/** True when the ticket itself frames a decision: its title, a named owner, or a Decide-by line. */
function isDecision(wo) {
  return DECISION.test(String(wo.title || '')) || Boolean(wo.owner) || Boolean(wo.decideBy);
}
const OUTSIDE = new Set(['delivery', 'government']);
const WEIGHTS = { decision: 20, person: 15, gate: 15, outside: 10, generated: -25 };
const DAY = 86400000;

/** Days late (positive) or days until due (negative), from a YYYY-MM-DD-ish value. */
function daysLate(due, today) {
  if (!due) return null;
  const d = new Date(`${String(due).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date(today);
  const t0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.round((t0 - d.getTime()) / DAY);
}

/** Time-pressure points. Zero means "not pressing on time", which disqualifies the task. */
function timing(late) {
  if (late == null) return { pts: 0, why: 'no due date' };
  if (late > 60) return { pts: 0, why: `${late} days overdue: dormant, a disposition question` };
  if (late >= 22) return { pts: 25, why: `${late} days overdue` };
  if (late >= 8) return { pts: 40, why: `${late} days overdue` };
  if (late >= 1) return { pts: 50, why: `${late} day${late === 1 ? '' : 's'} overdue` };
  if (late === 0) return { pts: 45, why: 'due today' };
  const until = -late;
  if (until <= 3) return { pts: 35, why: `due in ${until} day${until === 1 ? '' : 's'}` };
  if (until <= 7) return { pts: 20, why: `due in ${until} days` };
  if (until <= 14) return { pts: 8, why: `due in ${until} days` };
  return { pts: 0, why: `due in ${until} days` };
}

/**
 * Score one task.
 * @param {object} wo a work order (workOrder.buildWorkOrder) plus { cat, generated }
 * @param {Date|string} today
 * @returns {{score:number, reasons:Array<{pts:number,why:string}>, late:?number, usedDecideBy:boolean}}
 */
function scoreTask(wo, today) {
  const decideLate = daysLate(wo.decideBy, today);
  const usedDecideBy = decideLate != null;
  const late = usedDecideBy ? decideLate : daysLate(wo.dueOn, today);
  const t = timing(late);
  const reasons = [{ pts: t.pts, why: usedDecideBy ? `${t.why} (the ticket's own "Decide by")` : t.why }];
  const decision = isDecision(wo);
  if (decision) {
    reasons.push({ pts: WEIGHTS.decision, why: 'a decision only you can make (the ticket frames it as one)' });
  } else if (wo.humanOnly || wo.category === 'human_required') {
    reasons.push({ pts: WEIGHTS.person, why: wo.humanOnly ? 'the ticket says a person has to do it' : 'marked as needing you, not a session (human_required)' });
  }
  if (GATE.test(String(wo.list || ''))) reasons.push({ pts: WEIGHTS.gate, why: 'in an approval-gate list: other work waits on it' });
  if (OUTSIDE.has(wo.cat)) reasons.push({ pts: WEIGHTS.outside, why: 'a commitment to someone outside the company' });
  if (wo.generated) reasons.push({ pts: WEIGHTS.generated, why: 'machine-generated scaffolding' });
  const score = t.pts > 0 ? reasons.reduce((a, r) => a + r.pts, 0) : 0;
  return { score, reasons, late, usedDecideBy, isDecision: decision };
}

/** The Basecamp project a work order belongs to: its own field, else the "<project>/<todo>" id. */
const projectOfOrder = (x) => String(x.projectId || String(x.id || '').split('/')[0] || '(no project)');

/**
 * The five. Ties break on lateness (more overdue first), then id, so the order is stable.
 *
 * Spread: at most 2 from one list and 3 from one project (Ali, 2026-11-12, finalizing: the first
 * real run put three MAPLOCA tasks in the five; a client deadline may lead, but it may not crowd
 * out everything else).
 * @param {Array} orders work orders with { cat, generated }
 */
function pickFive(orders, today, opts = {}) {
  const n = opts.n || 5;
  const perList = opts.perList || 2;
  const perProject = opts.perProject || 3;
  const scored = (Array.isArray(orders) ? orders : [])
    .map((wo) => ({ ...wo, ...scoreTask(wo, today) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.late ?? -999) - (a.late ?? -999) || String(a.id).localeCompare(String(b.id)));
  const out = [];
  const byList = {};
  const byProject = {};
  for (const x of scored) {
    const k = x.list || '(no list)';
    const p = projectOfOrder(x);
    if ((byList[k] || 0) >= perList || (byProject[p] || 0) >= perProject) continue;
    byList[k] = (byList[k] || 0) + 1;
    byProject[p] = (byProject[p] || 0) + 1;
    out.push(x);
    if (out.length === n) break;
  }
  return { picks: out, qualified: scored.length };
}

/**
 * The ONE move. Three candidates, chosen by a rule that is printed on the report:
 *
 *   1. if the top pick is a decision only Ali can make and it is already late, make it: a late
 *      decision blocks everything downstream of it, and nothing else on the list can do that
 *   2. else, if one list holds 20+ dormant tasks, decide that list: it is the largest single source
 *      of noise in every future report, and one decision clears it
 *   3. else, work the top pick
 *
 * @param {{picks:Array, lists:Array}} input  lists = list summaries (listLens.byList)
 */
function pickOneMove({ picks, lists }) {
  const top = (picks || [])[0] || null;
  const pile = (lists || [])
    .filter((l) => l.dormant >= 20 && l.total && l.dormant / l.total >= 0.8)
    .sort((a, b) => b.dormant - a.dormant)[0] || null;

  const candidates = [];
  if (top) candidates.push({ kind: 'task', title: `Work #1: ${top.title}`, impact: `score ${top.score}` });
  if (pile) candidates.push({ kind: 'list', title: `Decide the list "${pile.key}"`, impact: `${pile.dormant} dormant tasks` });

  if (top && top.isDecision && top.late != null && top.late > 0) {
    return { kind: 'task', item: top, rule: 1, candidates,
      why: `It is a decision only you can make, and it is ${top.late} day(s) late. A late decision holds up everything downstream of it.` };
  }
  if (pile) {
    return { kind: 'list', list: pile, rule: 2, candidates,
      why: `"${pile.key}" holds ${pile.dormant} dormant tasks. One decision on the list clears more noise from every future report than any single task can.` };
  }
  if (top) {
    return { kind: 'task', item: top, rule: 3, candidates,
      why: 'It is the most pressing task on the board, and nothing structural outranks it today.' };
  }
  return { kind: 'none', rule: 0, candidates, why: 'Nothing qualified as pressing today.' };
}

module.exports = { pickFive, pickOneMove, scoreTask, timing, daysLate, isDecision, WEIGHTS, GATE };
