/**
 * C124: the decision story. Reads story/decisions.json (append-only), grades every open hypothesis against this week's
 * snapshot, and says which moves are still inside their measure window so the recommendation engine leaves them alone.
 * Pure apart from load(): ledger + snapshot in, view model out.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pct } = require('./model');
const { rateOf } = require('./metrics');

const LEDGER = path.join(__dirname, '..', 'story', 'decisions.json');
const KINDS = {
  decision: { icon: '🧭', label: 'Decision' }, pivot: { icon: '🔀', label: 'Change of direction' },
  build: { icon: '🛠️', label: 'Built' }, measurement: { icon: '📏', label: 'Measured' },
  correction: { icon: '✏️', label: 'Correction' }, retraction: { icon: '↩️', label: 'Retracted' },
  hypothesis: { icon: '🔬', label: 'Hypothesis' },
};

function load(file = LEDGER) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  validate(raw);
  return raw.entries;
}

/** Fail loud on a malformed ledger: a silent skip would quietly drop part of the story. */
function validate(raw) {
  if (!raw || !Array.isArray(raw.entries)) throw new Error('decisions.json: "entries" must be an array');
  const ids = new Set();
  for (const e of raw.entries) {
    for (const k of ['id', 'date', 'kind', 'title']) if (!e[k]) throw new Error(`decisions.json: entry missing "${k}": ${JSON.stringify(e).slice(0, 80)}`);
    if (!KINDS[e.kind]) throw new Error(`decisions.json: unknown kind "${e.kind}" on ${e.id}`);
    if (ids.has(e.id)) throw new Error(`decisions.json: duplicate id ${e.id}`);
    ids.add(e.id);
    if (e.kind === 'hypothesis' && (!e.test || !e.test.metric || !['>=', '<='].includes(e.test.op) || typeof e.test.value !== 'number')) {
      throw new Error(`decisions.json: hypothesis ${e.id} needs test {metric, op ">=" or "<=", value number}`);
    }
  }
}

/** Ids that a later retraction/pivot/correction superseded, so the timeline can strike them through. */
function supersededIds(entries) {
  return new Set(entries.filter((e) => e.supersedes).map((e) => e.supersedes));
}

/** Grade one hypothesis: supported / not yet / too few / retracted, with this week's number. */
function gradeHypothesis(h, w, email, targets, retracted) {
  if (retracted.has(h.id) || h.status === 'retracted') return { status: 'retracted', label: 'Retracted' };
  // A bet about a move not made yet: grading it now would judge the fix by the numbers from before it.
  if (h.status === 'proposed') return { status: 'none', label: 'Proposed: graded once the move ships' };
  if (h.status === 'confirmed') return { status: 'good', label: 'Confirmed' };
  if (h.status === 'rejected') return { status: 'bad', label: 'Rejected' };
  const r = rateOf(h.test.metric, w, email);
  if (!r || !r.d) return { status: 'none', label: 'No data yet', n: 0, d: 0 };
  const p = pct(r.n, r.d);
  if (r.d < targets.minSample) return { status: 'low', label: 'Too few to judge', n: r.n, d: r.d, pct: p };
  const ok = h.test.op === '>=' ? p >= h.test.value : p <= h.test.value;
  return { status: ok ? 'good' : 'bad', label: ok ? 'Holding so far' : 'Not holding', n: r.n, d: r.d, pct: p };
}

/** Moves (rate keys) that a build or decision is still measuring on `today` (YYYY-MM-DD). */
function movesInFlight(entries, today) {
  const gone = supersededIds(entries);
  return entries.filter((e) => e.move && e.measure_until && e.measure_until >= today && !gone.has(e.id))
    .map((e) => ({ move: e.move, id: e.id, title: e.title, until: e.measure_until }));
}

function build(entries, w, email, targets, today) {
  const gone = supersededIds(entries);
  const retracted = new Set(entries.filter((e) => e.kind === 'retraction' && e.supersedes).map((e) => e.supersedes));
  const timeline = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e) => ({ ...e, ...KINDS[e.kind], superseded: gone.has(e.id) }));
  const hypotheses = entries.filter((e) => e.kind === 'hypothesis')
    .map((h) => ({ ...h, grade: gone.has(h.id) ? { status: 'retracted', label: 'Superseded' } : gradeHypothesis(h, w, email, targets, retracted) }));
  return { timeline, hypotheses, inFlight: movesInFlight(entries, today) };
}

module.exports = { load, validate, build, gradeHypothesis, movesInFlight, supersededIds, KINDS, LEDGER };
