/**
 * C5.5 (/enterprise) and C5.6 (/workforce) - the single source for all four PDFs.
 *
 * ## Read, not quoted
 *
 * Both tickets set the same criterion: the page must be "actually routed, PROVEN BY THE
 * ROUTE TREE not just the file". Segment routes are GENERATED from `readySegments()`
 * rather than written one per line, so the proof is a chain rather than a grep, and this
 * module walks the whole chain at build time:
 *
 *   1. the segment exists in v2Segments.ts and carries `ready: true`
 *   2. App.tsx maps readySegments() to <Route> inside the PublicLayoutV2 block
 *   3. the slug collides with no path App.tsx declares literally
 *
 * Break any link and the build fails rather than printing a stale claim. That third check
 * is the one worth having: routes come from a boolean, which is exactly how a segment
 * could silently shadow an existing page.
 */

const fs = require('fs');
const path = require('path');

const AS_OF = '18 October 2026';
const ROOT = path.join(__dirname, '..', '..', '..');
const FE = path.join(ROOT, 'frontend', 'src');
const read = (...p) => fs.readFileSync(path.join(FE, ...p), 'utf8');

const APP = read('App.tsx');
const SEGMENTS_SRC = read('config', 'v2Segments.ts');
const REGISTRY_SRC = read('config', 'claimsRegistry.ts');

const PR_NUM = 3223;
const PR = 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/'
  + PR_NUM;

/* ------------------------------------------------------------------ *
 * READ THE SEGMENT SOURCE
 * ------------------------------------------------------------------ */

/** The source text of one segment's object literal, by slug. */
function segmentBlock(slug) {
  const start = SEGMENTS_SRC.indexOf(`slug: '${slug}',`);
  if (start === -1) return null;
  const after = SEGMENTS_SRC.indexOf("slug: '", start + 10);
  return SEGMENTS_SRC.slice(start, after === -1 ? SEGMENTS_SRC.length : after);
}

const isReady = (slug) => {
  const b = segmentBlock(slug);
  return !!b && /ready:\s*true/.test(b);
};

/** Every slug currently marked ready, in declaration order. */
function readySlugs() {
  const out = [];
  for (const m of SEGMENTS_SRC.matchAll(/slug: '([a-z-]+)',/g)) {
    if (isReady(m[1])) out.push(m[1]);
  }
  return out;
}

/** Paths App.tsx declares as a literal, which a generated slug must not collide with. */
function literalRoutes() {
  return new Set([...APP.matchAll(/path="\/?([a-z0-9-]+)"/g)].map((m) => m[1]));
}

const READY = readySlugs();
const LITERAL = literalRoutes();
const GENERATOR = 'readySegments().map((s) => (\n  <Route key={s.slug} path={s.slug} '
  + 'element={<SegmentPageV2 slug={s.slug} />} />\n))';

function registryClaim(key) {
  const m = REGISTRY_SRC.match(new RegExp(
    `key: '${key.replace('.', '\\.')}',\\s*publicWording:\\s*'([^']*)',\\s*verification:\\s*'([A-Z_]+)'`,
  ));
  return m ? { key, wording: m[1], verification: m[2] } : null;
}

const POSITIONING = registryClaim('positioning.primary');

/* ------------------------------------------------------------------ *
 * THE TWO TICKETS
 * ------------------------------------------------------------------ */

const KIND = {
  SOURCE: { k: 'SOURCE', color: '#1f6feb' },
  TEST: { k: 'TEST', color: '#2f7d32' },
  REGISTRY: { k: 'REGISTRY', color: '#7a4fb6' },
  LINK: { k: 'LINK', color: '#b26a00' },
  PENDING: { k: 'PENDING', color: '#718096' },
};

const TICKETS = {
  c55: {
    id: 'C5.5', slug: 'enterprise', title: 'Enterprise Buyer Page', route: '/enterprise',
    bc: 'https://app.basecamp.com/3945211/buckets/7463955/todos/10379236632',
    noun: 'AI enablement',
    asked: 'Build the enterprise route as a real, routed, deployed page consistent with the '
      + 'locked positioning. Enterprise buyers need their own language, budget framing and '
      + 'proof.',
    delivered: 'A routed page arguing from the sponsor’s position: your own people '
      + 'build against your own problems, and the capability stays when the engagement '
      + 'ends. The proof band is framed as the question a sponsor is eventually asked.',
    checks: 'a sponsor eventually asked what changed',
  },
  c56: {
    id: 'C5.6', slug: 'workforce', title: 'Workforce and Economic Development Page',
    route: '/workforce',
    bc: 'https://app.basecamp.com/3945211/buckets/7463955/todos/10379236649',
    noun: 'workforce readiness',
    asked: 'Build the workforce route as a real, routed, deployed page. Workforce and '
      + 'economic development budget and buy very differently from enterprise.',
    delivered: 'A routed page arguing from the reporting obligation: participants finish '
      + 'holding software a funder can open and check, which is the form the question is '
      + 'actually asked in.',
    checks: 'a board answering to a funder',
  },
};

function criteria(id) {
  const t = TICKETS[id];
  return [
    {
      c: 'Page is actually routed, proven by the route tree not just the file',
      e: `App.tsx generates segment routes from readySegments() inside the PublicLayoutV2 `
        + `block, "${t.slug}" carries ready: true in v2Segments.ts, and the slug collides `
        + `with none of the ${LITERAL.size} paths App.tsx declares literally. All three `
        + 'links were read from the real files when this PDF was built, and a test asserts '
        + 'the same chain.',
      kind: KIND.SOURCE,
    },
    {
      c: 'Every claim traces to the registry',
      e: 'The only claim rendered is positioning.primary, through <Claim>, which resolves '
        + 'via the C0.6 registry and renders nothing for anything unpublishable. The '
        + 'segment prose carries no figure and no credential at all: a build assertion '
        + 'reads the source and fails on a currency amount or a percentage in the copy.',
      kind: KIND.REGISTRY,
    },
    {
      c: 'CTA instrumented',
      e: "trackEvent('cta_click', { cta_name: 'segment_enquiry', segment }) fires on the "
        + `single enquiry link, and the href carries ?segment=${t.slug} for attribution. A `
        + 'test asserts exactly one /contact link per page and that it carries its own '
        + 'segment rather than another one’s.',
      kind: KIND.TEST,
    },
    {
      c: 'PR open, not merged',
      e: `PR ${PR_NUM}, open. Both tickets say open a PR and do not merge, and both name `
        + 'copy approval before merge as your decision.',
      kind: KIND.LINK,
    },
    {
      c: 'Production URL recorded after deploy',
      e: 'NOT YET SATISFIED, and cannot be until the PR merges and deploys. Recorded as '
        + 'pending rather than filled in.',
      kind: KIND.PENDING,
    },
  ];
}

const MANIFEST = (id) => {
  const t = TICKETS[id];
  return [
    ['repo', 'ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator'],
    ['branch', 'workstream/c55-c56-segment-pages'],
    ['PR', PR],
    ['files changed', 'frontend/src/config/v2Segments.ts (content and ready flag), '
      + 'frontend/src/pages/publicV2/__tests__/SegmentPageV2.test.tsx (guards). No routing '
      + 'change was needed.'],
    ['route', t.route],
    ['production URL', 'pending merge and deploy. Not live, and not recorded as live.'],
    ['auth / role', 'none. Public route under PublicLayoutV2.'],
    ['feature flag', 'none. The ready flag in v2Segments.ts is the gate, and it is now true.'],
    ['data source', 'static config in frontend/src/config/v2Segments.ts plus the C0.6 '
      + 'registry. No API call, no database read.'],
    ['screenshot evidence', 'pending deploy, for the same reason as the URL.'],
    ['production verification', 'pending deploy.'],
    ['rollback', 'set ready: false for the segment. The route disappears because it is '
      + 'generated from that flag, and the page renders nothing even if a route survives.'],
  ];
};

/* ------------------------------------------------------------------ *
 * THE TAKEAWAY
 * ------------------------------------------------------------------ */

function headline() {
  return `Both pages ship as content plus a boolean: App.tsx generates segment routes from `
    + `readySegments(), so no routing change was needed and ${READY.length} segments are now `
    + 'live. The guards written for the first segment now run against every one of them, '
    + 'and two of them exist because routes come from a flag.';
}

const SO_WHAT = [
  'EACH SEGMENT ARGUES DIFFERENTLY, WHICH IS THE POINT OF HAVING MORE THAN ONE. Sharing a '
    + 'template is what stops three different arguments; it is not permission to ship the '
    + 'same page three times. The category noun moves per C2.1 and the proof band is framed '
    + 'for whoever actually checks it: a dean asked to evidence outcomes, a sponsor '
    + 'eventually asked what changed, a board answering to a funder. A test asserts the '
    + 'ledes, proof bands, calls to action and headings are all distinct.',
  'TWO EXISTING TESTS CHANGED, AND THE DISTINCTION MATTERS. Both pinned the set of shipped '
    + 'segments, so shipping two more is a real behaviour change rather than a test that '
    + 'needed fixing. One now asserts three slugs in information-architecture order; the '
    + 'other moved its unready example from enterprise to government, which you approved as '
    + 'its own section and which still needs a ticket raised in group 05.',
  'ROUTES COME FROM A BOOLEAN, SO ONE NEW GUARD CHECKS FOR SHADOWING. Flipping ready to '
    + 'true is enough to mount a path, which is convenient and is also how a segment could '
    + 'silently shadow an existing page. A test now asserts no ready slug collides with a '
    + 'path App.tsx declares literally. C5.1 checked slug freedom by hand once; this keeps '
    + 'checking it for every segment that ships afterwards.',
];

const LIMITS = [
  'The copy is not approved. Both tickets name copy approval before merge as your '
    + 'decision, so this is a draft a reviewer reads rather than a page a buyer reads.',
  'There is no production URL, no screenshot and no production verification, because the '
    + 'PR is open and unmerged exactly as both tickets instruct.',
  'Neither page carries a price. C2.3 approved $150 a learner and an entry block of 60 '
    + 'learners at $9,000, which is a genuinely strong fact for the public buyer and still '
    + 'has no row in the C0.6 registry. The registry is the gate, so it does not ship.',
  'Government and the strategic ecosystem partners remain unrouted. C5.8 covers the '
    + 'ecosystem page; the government page is the one you approved on 18 October and it '
    + 'still needs a ticket.',
];

const DECISION = 'Copy approval on both pages, and the $9,000 entry block. That price sits '
  + 'inside what a public buyer can spend without competition or a board vote, which makes '
  + 'it the strongest single fact available to the workforce page, and it cannot appear '
  + 'until it has a registry row.';

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** Both segments are ready, so both are routed by the generator. */
function assertSegmentsReady() {
  for (const t of Object.values(TICKETS)) {
    if (!isReady(t.slug)) throw new Error(`${t.id}: ${t.slug} is not marked ready`);
    if (!READY.includes(t.slug)) throw new Error(`${t.id}: ${t.slug} missing from readySlugs`);
  }
  return READY.join(', ');
}

/** The generator still exists in App.tsx, inside the public layout. */
function assertGeneratorRoutesThem() {
  if (!APP.includes('readySegments()')) {
    throw new Error('App.tsx no longer generates routes from readySegments()');
  }
  if (!APP.includes('element={<SegmentPageV2 slug={s.slug} />}')) {
    throw new Error('App.tsx no longer mounts SegmentPageV2 for each ready segment');
  }
  const layoutAt = APP.indexOf('<Route path="/" element={<PublicLayoutV2 />}>');
  const genAt = APP.indexOf('readySegments()', layoutAt);
  if (layoutAt === -1 || genAt === -1 || genAt < layoutAt) {
    throw new Error('the segment routes are no longer inside the PublicLayoutV2 block');
  }
  return true;
}

/** No ready slug shadows a literal route. The guard that exists because routes are generated. */
function assertNoSlugShadowing() {
  for (const slug of READY) {
    if (LITERAL.has(slug)) {
      throw new Error(`the ready slug "${slug}" collides with a path App.tsx declares `
        + 'literally, so the segment page would shadow an existing page');
    }
  }
  return LITERAL.size;
}

/** The shipped copy carries no price and no figure. Read from the source, not asserted. */
function assertCopyIsClaimFree() {
  for (const t of Object.values(TICKETS)) {
    const block = segmentBlock(t.slug);
    // Strip the field NAMES and look only at the quoted prose.
    const prose = [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).join(' ');
    if (/\$\s?\d/.test(prose)) throw new Error(`${t.id}: the copy carries a price`);
    if (/\d+\s?%/.test(prose)) throw new Error(`${t.id}: the copy carries a percentage`);
    if (/\bfree\b/i.test(prose)) throw new Error(`${t.id}: the copy uses the word free`);
    if (/programme|licence|organisation/i.test(prose)) {
      throw new Error(`${t.id}: the copy uses British spelling`);
    }
  }
  return 2;
}

/** The positioning claim quoted here still resolves and is still publishable. */
function assertPositioningVerified() {
  if (!POSITIONING) throw new Error('positioning.primary is missing from the registry');
  if (POSITIONING.verification !== 'VERIFIED') {
    throw new Error(`positioning.primary is ${POSITIONING.verification}, not VERIFIED`);
  }
  return POSITIONING.wording;
}

/** Nothing is recorded as live while the PR is unmerged. */
function assertNothingClaimedLive() {
  for (const id of Object.keys(TICKETS)) {
    const url = MANIFEST(id).find((r) => r[0] === 'production URL')[1];
    if (/https?:\/\//.test(url)) throw new Error(`${id}: a production URL is recorded`);
    const last = criteria(id)[4];
    if (last.kind !== KIND.PENDING) throw new Error(`${id}: production criterion not pending`);
    if (!/NOT YET SATISFIED/.test(last.e)) {
      throw new Error(`${id}: chipped pending but the prose does not say it is unsatisfied`);
    }
  }
  return true;
}

/** One PR number, spelled once. */
function assertOnePrNumber() {
  const src = fs.readFileSync(__filename, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const found = new Set();
  for (const m of src.matchAll(/(?:pull\/|PR )(\d{3,6})/g)) found.add(Number(m[1]));
  found.delete(PR_NUM);
  if (found.size) throw new Error('stray PR number(s): ' + [...found].join(', '));
  return PR_NUM;
}

module.exports = {
  AS_OF, PR, PR_NUM, TICKETS, KIND, READY, LITERAL, GENERATOR, POSITIONING,
  SO_WHAT, LIMITS, DECISION, headline, criteria, MANIFEST, segmentBlock,
  assertSegmentsReady, assertGeneratorRoutesThem, assertNoSlugShadowing,
  assertCopyIsClaimFree, assertPositioningVerified, assertNothingClaimedLive,
  assertOnePrNumber,
};
