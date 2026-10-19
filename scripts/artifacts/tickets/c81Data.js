/**
 * C8.1 - Commercialization Command Center UX and architecture. Source for all deliverables.
 *
 * ## The ticket's rule, and what applying it honestly produced
 *
 * "Every tile must name the data source that will populate it, and any tile with no source
 * is marked NOT YET MEASURABLE rather than mocked." Its named failure mode is "designing
 * for metrics we cannot populate".
 *
 * Applying that to the ten metrics the ticket requires gives an uncomfortable answer: ONE
 * is populatable from production today, ONE has a proxy that is not the thing asked for,
 * and EIGHT have no source at all. So the deliverable is a design that shows what is real
 * and labels the rest, plus the schema work C8.2 actually depends on.
 *
 * ## Every figure here was measured on the production database, read-only, 18 October 2026
 *
 * `assertNoMockedNumbers()` fails the build if a tile without a real source ever carries a
 * number, which is the ticket's criterion expressed as code rather than as care.
 */

const fs = require('fs');
const path = require('path');

const AS_OF = '18 October 2026';
const ROOT = path.join(__dirname, '..', '..', '..');
const TOKENS_CSS = path.join(ROOT, 'frontend', 'src', 'styles', 'tokens.css');

const STATUS = {
  LIVE: { k: 'LIVE', color: '#2f7d32', note: 'populatable from production today' },
  PROXY: { k: 'PROXY ONLY', color: '#b26a00', note: 'a near neighbour exists, not the metric asked for' },
  NONE: { k: 'NOT YET MEASURABLE', color: '#b3261e', note: 'no source exists' },
};

/* ------------------------------------------------------------------ *
 * THE TEN REQUIRED TILES
 * ------------------------------------------------------------------ */

const TILES = [
  {
    key: 'annualised_revenue', label: 'Annualised revenue', status: STATUS.LIVE,
    value: '$143,136', sub: '54 active subscriptions at $11,928 per month',
    source: 'subscriptions WHERE status = \'active\', sum(amount_cents) x 12.',
    caveat: 'The revenue rule is app-originated checkout only, and this table has NO origin '
      + 'column: all 54 active rows carry a paysimple_payment_id, so SQL cannot separate a '
      + 'checkout that started in our app from one that started on a PaySimple hosted page. '
      + 'The number is real; the attribution rule cannot be enforced until an origin column '
      + 'exists.',
  },
  {
    key: 'qualified_pipeline', label: 'Qualified pipeline', status: STATUS.NONE, value: null,
    sub: null,
    source: 'revenue_opportunities has estimated_value, confidence and status and would be '
      + 'the right table.',
    caveat: 'It holds ZERO rows and nothing in the codebase writes it. A pipeline tile today '
      + 'would read $0 forever, which is worse than reading "not measured".',
  },
  {
    key: 'paid_pilots', label: 'Paid pilots', status: STATUS.NONE, value: null, sub: null,
    source: 'No table. Searched all 562 production tables for pilot: none exists.',
    caveat: 'There is no pilot entity in the schema at all, so neither the count nor the '
      + 'paid/unpaid distinction can be derived. C7.2 and C7.3 define the pilot paperwork; '
      + 'nothing records a pilot as a row.',
  },
  {
    key: 'active_pilots', label: 'Active pilots', status: STATUS.PROXY, value: null,
    sub: null,
    source: 'delivery_engagements WHERE status = \'active\' is the nearest neighbour.',
    caveat: 'Measured today it holds 2 rows, both engagement_type = \'commercial_client\', '
      + 'not \'pilot\'. Labelling those two as pilots would be inventing a category. Shown '
      + 'as a proxy with its real name, or left blank.',
  },
  {
    key: 'partner_conversations', label: 'Strategic partner conversations', status: STATUS.NONE,
    value: null, sub: null,
    source: 'No table. Searched all 562 production tables for partner: none exists.',
    caveat: 'C3.7 maps partners in a document. Nothing records a conversation with one, so '
      + 'this tile cannot be computed even in principle today.',
  },
  {
    key: 'meetings', label: 'Executive meetings', status: STATUS.NONE, value: null, sub: null,
    source: 'No sales-meeting record. workforce_meetings (50 rows) and zoom_meeting_requests '
      + 'exist.',
    caveat: 'workforce_meetings is internal staff meetings. Counting those as executive '
      + 'meetings would make the tile read 50 and mean nothing. C9.5 targets the first ten '
      + 'executive meetings, and there is nowhere to record one.',
  },
  {
    key: 'demos', label: 'Demos delivered', status: STATUS.NONE, value: null, sub: null,
    source: 'No sales-demo record. A \'demo\' event type does exist in the learner points '
      + 'system.',
    caveat: 'That is a STUDENT demo in the curriculum, a different thing entirely. Wiring it '
      + 'to this tile would be a category error that reads as traction.',
  },
  {
    key: 'proposal_value', label: 'Proposal value out', status: STATUS.NONE, value: null,
    sub: null,
    source: 'gov_proposal_response and its siblings exist for the government bid motion.',
    caveat: 'Those are government bids, a separate motion with its own board. There is no '
      + 'commercial proposal entity and no value field for one. C9.6 targets the first five '
      + 'pilot proposals with nowhere to record them.',
  },
  {
    key: 'win_rate', label: 'Win rate', status: STATUS.NONE, value: null, sub: null,
    source: 'Requires closed-won and closed-lost counts, which require a deal entity.',
    caveat: 'There is no deal or opportunity-stage table, so the denominator does not exist. '
      + 'This tile is downstream of qualified pipeline and cannot precede it.',
  },
  {
    key: 'deployment_outcomes', label: 'Deployment outcomes', status: STATUS.NONE, value: null,
    sub: null,
    source: 'No source. campaign_deployments exists but is marketing campaign delivery.',
    caveat: 'The C2.2 capability audit already found deployment candidate selection has no '
      + 'platform capability at all, and C8.11 is the ticket to build it. This tile is '
      + 'blocked on that work, not on dashboard work.',
  },
];

/* ------------------------------------------------------------------ *
 * WHAT C8.2 ACTUALLY NEEDS FIRST
 * ------------------------------------------------------------------ */

const PREREQS = [
  ['A commercial opportunity record', 'One row per real deal with stage, value, owner and '
    + 'close date. It unlocks qualified pipeline, win rate and proposal value in one move, '
    + 'three of the eight blank tiles. revenue_opportunities is close enough to extend '
    + 'rather than replace.'],
  ['A pilot entity', 'Pilots are the product C7.x defines on paper and the schema has never '
    + 'heard of. Needed for both pilot tiles and for C9.7.'],
  ['An interaction record for meetings and demos', 'One row per externally-facing meeting or '
    + 'demo with the account and the person. C9.5 and C9.2 are measured in these and there '
    + 'is nowhere to write one.'],
  ['An origin column on subscriptions', 'Without it the one tile that works cannot honour '
    + 'the app-originated-only revenue rule, and the number silently includes payments that '
    + 'rule excludes.'],
];

const ROUTE = {
  path: '/admin/commercialization',
  auth: 'requireAdmin, plus requireSection(\'revenue\') so a sales role does not see the '
    + 'full board by default.',
  note: 'C8.2 builds this route. The route tree is frontend/src/App.tsx and the admin '
    + 'sub-router is backend/src/routes/adminRoutes.ts; the section gate already exists.',
};

/* ------------------------------------------------------------------ *
 * THE TAKEAWAY
 * ------------------------------------------------------------------ */

function counts() {
  const by = (s) => TILES.filter((t) => t.status === s).length;
  return { live: by(STATUS.LIVE), proxy: by(STATUS.PROXY), none: by(STATUS.NONE), total: TILES.length };
}

function headline() {
  const c = counts();
  return `Of the ${c.total} metrics this command centre is required to show, ${c.live} can be `
    + `computed from production today, ${c.proxy} has only a near neighbour, and ${c.none} have `
    + 'no source at all. The design is therefore mostly a specification for the data we have '
    + 'not captured yet, and the honest dashboard says so on its face.';
}

const SO_WHAT = [
  'THE TICKET’S OWN RULE PRODUCES THIS ANSWER. It says every tile must name its data '
    + 'source and anything without one is marked NOT YET MEASURABLE rather than mocked, and '
    + 'it names "designing for metrics we cannot populate" as the way this work goes wrong. '
    + 'Applying that honestly to the required metric set leaves one populated tile. The '
    + 'alternative was a board of plausible numbers, which is the thing the rule forbids.',
  'BUILDING C8.2 FIRST WOULD PRODUCE AN EMPTY DASHBOARD. C8.2 is due 20 October and builds '
    + 'this route. It would ship eight tiles reading "not measured", and the fix is not '
    + 'front-end work: it is four small schema additions, listed in this document, that '
    + 'between them unlock seven of the eight. A commercial opportunity record alone unlocks '
    + 'three.',
  'THE ONE WORKING TILE HAS AN ATTRIBUTION HOLE WORTH KNOWING ABOUT. Annualised revenue '
    + 'computes to $143,136 from 54 active subscriptions. The standing rule is that revenue '
    + 'counts app-originated checkout only, and the subscriptions table has no origin '
    + 'column, so that rule cannot be applied in SQL. The number is real and the filter the '
    + 'rule asks for does not exist.',
];

const LIMITS = [
  'Every count here was read from the production database on ' + AS_OF + ' with SELECT '
    + 'statements only. Nothing was written and no schema was changed.',
  'This is a design and a data audit, not an implementation. No route was added; the route '
    + 'named above is the one C8.2 is expected to build.',
  'The metric set itself is the ticket’s, not mine. If a metric here is not the one you '
    + 'want on the board, that is the decision this artifact is meant to surface.',
  'The HTML prototype uses the real design tokens from frontend/src/styles/tokens.css so it '
    + 'can be dropped into the admin shell, but it is a static prototype: it fetches nothing '
    + 'and the single live figure is written into it as the measured value with its date.',
];

const DECISION = 'The metric set, and the order. My recommendation is to add the commercial '
  + 'opportunity record and the interaction record before C8.2 builds anything, because they '
  + 'turn five blank tiles into real ones and the dashboard is worth building the day it has '
  + 'something to show. If you would rather see the shell first with eight honest blanks, '
  + 'that is a defensible call and the prototype attached is exactly what it would look like.';

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** The ten metrics the ticket names are all present, none quietly dropped. */
const REQUIRED = ['annualised revenue', 'qualified pipeline', 'paid pilots', 'active pilots',
  'strategic partner conversations', 'meetings', 'demos', 'proposal value', 'win rate',
  'deployment outcomes'];

function assertRequiredMetricsPresent() {
  const labels = TILES.map((t) => `${t.label} ${t.key}`.toLowerCase().replace(/_/g, ' '));
  for (const r of REQUIRED) {
    const stem = r.split(' ').filter((w) => w.length > 4);
    const found = labels.some((l) => stem.every((w) => l.includes(w)));
    if (!found) throw new Error(`the required metric "${r}" is missing from the tile set`);
  }
  if (TILES.length !== REQUIRED.length) {
    throw new Error(`${TILES.length} tiles for ${REQUIRED.length} required metrics`);
  }
  return TILES.length;
}

/** Every tile names a source, and every unpopulatable one explains why. */
function assertEveryTileNamesASource() {
  for (const t of TILES) {
    if (!t.source || t.source.length < 20) throw new Error(`${t.key}: no data source named`);
    if (!t.caveat || t.caveat.length < 30) throw new Error(`${t.key}: no explanation given`);
    if (!Object.values(STATUS).includes(t.status)) throw new Error(`${t.key}: invalid status`);
  }
  return TILES.length;
}

/**
 * THE TICKET'S CRITERION AS CODE: a tile with no real source must not carry a number.
 * This is the one that stops a plausible-looking board from being produced by accident.
 */
function assertNoMockedNumbers() {
  for (const t of TILES) {
    if (t.status === STATUS.LIVE) {
      if (!t.value) throw new Error(`${t.key}: marked live but carries no measured value`);
      continue;
    }
    if (t.value !== null) {
      throw new Error(`${t.key}: is ${t.status.k} but carries the value "${t.value}". `
        + 'A tile without a source must be marked, not mocked.');
    }
    if (t.sub !== null) throw new Error(`${t.key}: ${t.status.k} but carries a subtitle figure`);
  }
  return counts().live;
}

/** The prototype uses design tokens that genuinely exist in the app's stylesheet. */
function assertPrototypeUsesRealTokens(html) {
  const css = fs.readFileSync(TOKENS_CSS, 'utf8');
  const used = [...new Set([...html.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))];
  if (used.length < 5) throw new Error('the prototype barely uses the design system');
  const missing = used.filter((v) => !css.includes(`${v}:`));
  if (missing.length) {
    throw new Error('the prototype uses tokens that do not exist in '
      + `frontend/src/styles/tokens.css: ${missing.join(', ')}`);
  }
  return used.length;
}

/** The headline's counts are derived from the tiles, never written. */
function assertHeadlineMatchesTiles() {
  const c = counts();
  if (c.live + c.proxy + c.none !== c.total) throw new Error('tile tally is incomplete');
  const h = headline();
  for (const n of [c.total, c.live, c.proxy, c.none]) {
    if (!new RegExp(`\\b${n}\\b`).test(h)) throw new Error(`headline omits the count ${n}`);
  }
  return `${c.live} live, ${c.proxy} proxy, ${c.none} not yet measurable`;
}

module.exports = {
  AS_OF, STATUS, TILES, PREREQS, ROUTE, SO_WHAT, LIMITS, DECISION, REQUIRED,
  counts, headline,
  assertRequiredMetricsPresent, assertEveryTileNamesASource, assertNoMockedNumbers,
  assertPrototypeUsesRealTokens, assertHeadlineMatchesTiles,
};
