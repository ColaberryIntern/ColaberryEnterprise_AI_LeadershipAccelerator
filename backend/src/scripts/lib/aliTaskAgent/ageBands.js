/**
 * ageBands - separate "late" from "abandoned", because the queue currently cannot tell them apart.
 *
 * WHY THIS EXISTS
 *
 * `scoreTask` in queueBuilder.js adds a FLAT +40 for `dueIn < 0`. One day overdue and one hundred
 * days overdue score identically, and the stored `urgency_score` behaves the same way. So the
 * priority queue sorts by how long something has been ignored and calls the result urgency.
 *
 * Measured on production 2026-11-11: of 4,070 active todos, 3,395 are overdue, 3,217 by more than
 * thirty days, and 3,105 by more than sixty. Seventy-six percent of everything "active" has been
 * sitting for over two months. A top-ten built from that is a list of the most abandoned tickets,
 * not the most important ones - which is how "Review Women Applying AI Pilot draft", due 29 July,
 * reaches the front page at urgency 85.
 *
 * This module does not rescore anything. It PARTITIONS, so the two questions can be asked
 * separately:
 *
 *   - the live queue answers "what dies today"
 *   - the dormant pile answers "is this still real at all"
 *
 * Those deserve different screens and different decisions, and mixing them is what makes both
 * useless.
 *
 * Pure: no I/O, no clock of its own (today is injected), so it is fully unit-testable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The bands, in severity order. `dormant` is deliberately LAST and deliberately NEUTRAL-coloured:
 * an item nobody has touched in two months is not an emergency, it is a decision waiting to be
 * made. Painting it red would repeat the exact error this module exists to correct.
 */
const BANDS = [
  { key: 'fresh', label: 'Not yet due', icon: '○', min: -Infinity, max: 0 },
  { key: 'overdue', label: 'Overdue', icon: '◔', min: 1, max: 30 },
  { key: 'aging', label: 'Aging', icon: '◑', min: 31, max: 60 },
  { key: 'dormant', label: 'Dormant', icon: '●', min: 61, max: Infinity },
];

const BAND_KEYS = BANDS.map((b) => b.key);

function startOfUtcDay(d) {
  const t = new Date(d);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

/**
 * Whole days a todo is past its due date. Negative means still in the future, null means no due
 * date at all - which is NOT the same as zero and must not be bucketed as if it were.
 * @param {string|null|undefined} dueOn ISO date
 * @param {Date|string|number} today
 * @returns {number|null}
 */
function daysOverdue(dueOn, today) {
  if (!dueOn) return null;
  const due = startOfUtcDay(dueOn);
  if (Number.isNaN(due)) return null;
  return Math.round((startOfUtcDay(today) - due) / DAY_MS);
}

/**
 * Which band a todo falls in. An item with no due date is `fresh`: it has never been promised by
 * a date, so it cannot be late. Calling it dormant would manufacture neglect out of an absence.
 * @returns {{key:string,label:string,icon:string}}
 */
function bandFor(dueOn, today) {
  const d = daysOverdue(dueOn, today);
  if (d === null || d <= 0) return BANDS[0];
  return BANDS.find((b) => d >= b.min && d <= b.max) || BANDS[BANDS.length - 1];
}

/**
 * Split a queue into the part worth acting on and the part worth deciding about.
 *
 * `dormantAfterDays` defaults to 60. It is a parameter rather than a constant because the right
 * cut depends on the cadence of the work, and a number baked into the code is a number nobody
 * revisits.
 *
 * @param {Array<{todo?:{due_on?:string|null}}>} items queue items from queueBuilder
 * @param {Date|string|number} today
 * @param {{dormantAfterDays?:number}} [opts]
 * @returns {{live:Array, dormant:Array}}
 */
function partition(items, today, opts = {}) {
  const cut = opts.dormantAfterDays == null ? 60 : opts.dormantAfterDays;
  const live = [];
  const dormant = [];
  for (const it of Array.isArray(items) ? items : []) {
    const d = daysOverdue(it && it.todo && it.todo.due_on, today);
    (d !== null && d > cut ? dormant : live).push(it);
  }
  return { live, dormant };
}

/**
 * Counts per band plus a histogram of overdue age, for the chart.
 *
 * The histogram buckets are deliberately uneven and widen as they go: the interesting resolution
 * is at the recent end, where a decision is still live. Equal 30-day buckets would compress
 * everything that matters into one bar and spread the dead tail across many.
 */
const HISTOGRAM = [
  { label: 'Not due', min: -Infinity, max: 0 },
  { label: '1-7d', min: 1, max: 7 },
  { label: '8-30d', min: 8, max: 30 },
  { label: '31-60d', min: 31, max: 60 },
  { label: '61-120d', min: 61, max: 120 },
  { label: '120d+', min: 121, max: Infinity },
];

function summarize(items, today, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const bands = Object.fromEntries(BAND_KEYS.map((k) => [k, 0]));
  const histogram = HISTOGRAM.map((h) => ({ ...h, n: 0 }));
  let noDueDate = 0;
  let worst = null;

  for (const it of list) {
    const dueOn = it && it.todo && it.todo.due_on;
    const d = daysOverdue(dueOn, today);
    if (d === null) noDueDate += 1;
    bands[bandFor(dueOn, today).key] += 1;
    const slot = histogram.find((h) => (d === null ? h.max === 0 : d >= h.min && d <= h.max));
    if (slot) slot.n += 1;
    if (d !== null && (worst === null || d > worst.days)) {
      worst = { days: d, title: (it.todo && (it.todo.title || it.todo.content)) || 'untitled' };
    }
  }

  const { live, dormant } = partition(list, today, opts);
  return {
    total: list.length,
    bands,
    histogram,
    noDueDate,
    worst,
    liveCount: live.length,
    dormantCount: dormant.length,
    dormantShare: list.length ? dormant.length / list.length : 0,
  };
}

/**
 * Does urgency actually track lateness? Returns the points for the scatter that answers it.
 *
 * This is the chart that makes the defect visible rather than asserted: if the scoring were
 * measuring urgency, points would fan out; because overdue is a flat +40, they stack into a band
 * regardless of how late anything is.
 */
function urgencyVsAge(items, today) {
  return (Array.isArray(items) ? items : [])
    .map((it) => {
      const d = daysOverdue(it && it.todo && it.todo.due_on, today);
      if (d === null) return null;
      return {
        days: d,
        score: Number(it.score) || 0,
        title: (it.todo && (it.todo.title || it.todo.content)) || 'untitled',
      };
    })
    .filter(Boolean);
}

module.exports = { BANDS, BAND_KEYS, HISTOGRAM, DAY_MS, daysOverdue, bandFor, partition, summarize, urgencyVsAge };
