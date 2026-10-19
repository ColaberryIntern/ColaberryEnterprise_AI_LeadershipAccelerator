/**
 * C5.3 (/how-it-works) and C5.4 (/accelerator) - THE single source for all four PDFs.
 *
 * ## Nothing in here is typed from memory. It is read out of the repo at build time.
 *
 * Both tickets set the same acceptance criterion: "Page is actually routed, PROVEN BY THE
 * ROUTE TREE not just the file." An artifact that asserted that in prose would be exactly
 * the thing the criterion was written against, so this module opens `App.tsx`, finds the
 * route declarations, and reports their line numbers. If a route is deleted or moved out
 * of the public layout, the BUILD fails and no PDF is produced.
 *
 * The same applies to the three other things the PDFs state as fact:
 *
 *   ROUTE TREE   read from frontend/src/App.tsx
 *   STAGES       read from frontend/src/config/v2Journey.ts, including which are delivered
 *                by people rather than by the platform
 *   REGISTRY     read from frontend/src/config/claimsRegistry.ts, so a quoted claim is the
 *                registry's own `publicWording` rather than a paraphrase of it
 *
 * The one number that is NOT in this repo is ninety days, and that is the finding.
 */

const fs = require('fs');
const path = require('path');

const AS_OF = '18 October 2026';
const ROOT = path.join(__dirname, '..', '..', '..');
const FE = path.join(ROOT, 'frontend', 'src');

const read = (...p) => fs.readFileSync(path.join(FE, ...p), 'utf8');

/** Strip block and line comments, so a grep for copy does not match a comment about it. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/* ------------------------------------------------------------------ *
 * THE ROUTE TREE, read rather than described
 * ------------------------------------------------------------------ */

const APP = read('App.tsx');

/**
 * Find a route declaration and prove it sits inside the public layout block.
 *
 * A page component under `pages/` that nobody mounted renders perfectly in a test and is
 * unreachable to a visitor; both tickets call that failure out by name. A route mounted
 * OUTSIDE `PublicLayoutV2` is a subtler version of the same bug - reachable, but with no
 * site nav and no footer.
 */
function routeProof(routePath, component) {
  const lines = APP.split(/\r?\n/);
  const decl = `<Route path="${routePath}" element={<${component} />} />`;
  const at = lines.findIndex((l) => l.includes(decl));
  const layoutAt = lines.findIndex((l) => l.includes('<Route path="/" element={<PublicLayoutV2 />}>'));
  return {
    decl,
    line: at + 1,
    layoutLine: layoutAt + 1,
    found: at > -1,
    insideLayout: at > -1 && layoutAt > -1 && at > layoutAt,
  };
}

const ROUTES = {
  c53: routeProof('how-it-works', 'HowItWorksV2'),
  c54: routeProof('accelerator', 'AcceleratorV2'),
};

/* ------------------------------------------------------------------ *
 * THE FIVE STAGES, read out of the config the pages render
 * ------------------------------------------------------------------ */

const JOURNEY_SRC = read('config', 'v2Journey.ts');

function stagesFromSource() {
  const re = /key:\s*'([a-z]+)',\s*name:\s*'([A-Za-z]+)',[\s\S]*?delivery:\s*'(platform|people)',/g;
  const out = [];
  let m = re.exec(JOURNEY_SRC);
  while (m) {
    out.push({ key: m[1], name: m[2], delivery: m[3] });
    m = re.exec(JOURNEY_SRC);
  }
  return out;
}

const STAGES = stagesFromSource();

/** The two the C2.2 capability audit found no platform capability for. */
const GAPS = ['deploy', 'manage'];

/* ------------------------------------------------------------------ *
 * THE CLAIM REGISTRY, quoted rather than paraphrased
 * ------------------------------------------------------------------ */

const REGISTRY_SRC = read('config', 'claimsRegistry.ts');

function claimFromRegistry(key) {
  const re = new RegExp(
    `key: '${key.replace('.', '\\.')}',\\s*publicWording:\\s*'([^']*)',\\s*` +
    `verification:\\s*'([A-Z_]+)',\\s*capability:\\s*'([a-z/]+)'`,
  );
  const m = REGISTRY_SRC.match(re);
  if (!m) return null;
  const routes = REGISTRY_SRC.slice(REGISTRY_SRC.indexOf(m[0]));
  const ar = routes.match(/approvedRoutes:\s*\[([^\]]*)\]/);
  return {
    key,
    wording: m[1],
    verification: m[2],
    capability: m[3],
    anyRoute: !!ar && ar[1].includes("'*'"),
  };
}

const CLAIMS = {
  positioning: claimFromRegistry('positioning.primary'),
  duration: claimFromRegistry('program.duration'),
};

/* ------------------------------------------------------------------ *
 * THE TAKEAWAY
 * ------------------------------------------------------------------ */

function headline() {
  const d = CLAIMS.duration ? CLAIMS.duration.wording : 'no verified duration';
  return 'Both pages are built, routed and tested. Building them turned up a number the '
    + 'business sells and the registry cannot source: the ticket says ninety days, and the '
    + 'only duration we have verified is ' + d + '.';
}

const SO_WHAT = [
  'The duration has no row, so the page does not state it. C5.4 is titled "90-Day '
    + 'Accelerator" and the C2.2 blueprint is a ninety-day one, but the only verified '
    + 'duration in the C0.6 registry is program.duration, public wording "12 weeks", '
    + 'evidenced by curriculum_blueprints weeks 0 to 12 and by the live program page. '
    + 'Twelve weeks is eighty-four days. CLM-029 is the control: a figure with no source '
    + 'row does not go out. The page renders the registry claim, and a test asserts no '
    + 'other duration appears anywhere on it.',
  'Two of the five stages have no platform capability, and the page says which two. The '
    + 'C2.2 audit found deployment candidate selection has no capability at all and the '
    + 'executive impact report has no generator, both sitting at day eighty to ninety, '
    + 'which is exactly where a sponsor decides whether to run it again. Both tickets say '
    + 'never describe roadmap as live, so every stage carries a visible label in text '
    + 'rather than in colour: the platform does this, or our team does this.',
  'Routing is proven from the route tree, because the ticket asked for that and not for a '
    + 'file. Both tickets warn that a page under pages/ may be unrouted; such a page '
    + 'renders perfectly in a test and is unreachable to a visitor. The test reads App.tsx '
    + 'as text, asserts the Route element is declared, and asserts it sits inside the '
    + 'public layout block rather than merely somewhere in the file.',
];

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

/*
 * ONE constant, because the first cut of this file spelled the number in four places and
 * the number changed. PR 3191 merged the C5.2 split while these commits were still being
 * written, so they went into a second PR, and four literals had to agree. A guard below
 * fails the build if any other PR number is spelled anywhere in these two modules.
 */
const PR_NUM = 3198;
const PR = 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/'
  + PR_NUM;

function criteria(id) {
  const r = ROUTES[id];
  const cta = id === 'c53' ? 'how_it_works_enquiry' : 'accelerator_enquiry';
  const claims = id === 'c53'
    ? 'positioning.primary'
    : 'positioning.primary and program.duration';
  return [
    {
      c: 'Page is actually routed, proven by the route tree not just the file',
      e: 'App.tsx line ' + r.line + ' declares ' + r.decl + ', inside the PublicLayoutV2 '
        + 'block opened at line ' + r.layoutLine + '. A test reads App.tsx as text and '
        + 'asserts both facts, so deleting the route fails the suite.',
      kind: KIND.SOURCE,
    },
    {
      c: 'Every claim traces to the registry',
      e: 'The page renders ' + claims + ' through the <Claim> component, which resolves '
        + 'through the registry and renders nothing for a key that may not ship. No other '
        + 'claim string is hardcoded. Tests assert the registry wording IS present and the '
        + 'prohibited words are not.',
      kind: KIND.REGISTRY,
    },
    {
      c: 'CTA instrumented',
      e: "trackEvent('cta_click', { cta_name: '" + cta + "' }) fires on the single enquiry "
        + 'link. A test asserts exactly one /contact link exists, and a click test asserts '
        + 'the event fires with that name.',
      kind: KIND.TEST,
    },
    {
      c: 'PR open, not merged',
      e: 'PR ' + PR_NUM + ', open. Both tickets say open a PR and do not merge, and both name copy '
        + 'approval before merge as your decision.',
      kind: KIND.LINK,
    },
    {
      c: 'Production URL recorded after deploy',
      e: 'NOT YET SATISFIED, and cannot be until the PR merges. Recorded here as pending '
        + 'rather than filled in, because the route is not live and saying otherwise would '
        + 'be the exact defect these tickets guard against.',
      kind: KIND.PENDING,
    },
  ];
}

const TICKETS = {
  c53: {
    id: 'C5.3',
    title: 'How It Works - Learn, Build, Prove, Deploy, Manage',
    route: '/how-it-works',
    bc: 'https://app.basecamp.com/3945211/buckets/7463955/todos/10379236598',
    asked: 'Build the how-it-works route as a real, routed, deployed page consistent with '
      + 'the locked positioning, reusing the shared design system rather than inventing a '
      + 'visual language.',
    delivered: 'A routed page carrying the five-stage model, each stage labeled with who '
      + 'actually delivers it today, and the mechanism argument pointed at the published '
      + 'proof records. Routing is proven from App.tsx, not asserted.',
    files: [
      ['frontend/src/pages/publicV2/HowItWorksV2.tsx', 'the page'],
      ['frontend/src/config/v2Journey.ts', 'the five stages, shared with C5.4'],
      ['frontend/src/pages/publicV2/journeyV2.css', 'styles, shared with C5.4'],
      ['frontend/src/App.tsx', 'the route'],
    ],
  },
  c54: {
    id: 'C5.4',
    title: '90-Day Accelerator Landing Page',
    route: '/accelerator',
    bc: 'https://app.basecamp.com/3945211/buckets/7463955/todos/10379236612',
    asked: 'Build the accelerator route as a real, routed, deployed page a buyer can be '
      + 'sent to, with every externally visible claim present in the C0.6 registry.',
    delivered: 'A routed page carrying the offer, the customer obligations from C7.2, and '
      + 'the registry duration. No price, no unsourced duration, and no mention of Demo '
      + 'Day, each enforced by a test rather than by care.',
    files: [
      ['frontend/src/pages/publicV2/AcceleratorV2.tsx', 'the page'],
      ['frontend/src/config/v2Journey.ts', 'the offer and the obligations'],
      ['frontend/src/pages/publicV2/journeyV2.css', 'styles, shared with C5.3'],
      ['frontend/src/App.tsx', 'the route'],
    ],
  },
};

const MANIFEST = (id) => {
  const t = TICKETS[id];
  return [
    ['repo', 'ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator'],
    ['branch', 'workstream/c52-homepage'],
    ['PR', PR],
    ['files changed', t.files.map((f) => f[0]).join(', ')],
    ['route', t.route],
    ['production URL', 'pending merge and deploy. Not live, and not recorded as live.'],
    ['auth / role', 'none. Public route under PublicLayoutV2.'],
    ['feature flag', 'none.'],
    ['data source', 'static config in frontend/src/config/v2Journey.ts, plus the C0.6 '
      + 'claim registry. No API call, no database read.'],
    ['screenshot evidence', 'pending deploy, for the same reason as the URL.'],
    ['production verification', 'pending deploy.'],
    ['rollback', 'revert the merge commit on main and redeploy. The pages are additive and '
      + 'nothing else imports them, so removing the two route lines also suffices.'],
  ];
};

const LIMITS = [
  'The copy is not approved. Both tickets name copy approval before merge as your '
    + 'decision, and that has not happened, so this is a draft a reviewer reads rather '
    + 'than a page a buyer reads.',
  'There is no production URL, no screenshot and no production verification, because the '
    + 'PR is open and unmerged exactly as both tickets instruct. Three of the five '
    + 'acceptance criteria are met now; the fourth is met by the PR existing; the fifth is '
    + 'met only after you merge.',
  'No conversion data exists and none can until launch. Both tickets say so themselves '
    + 'under missing evidence, so "visitors from this segment reach an enquiry" is '
    + 'instrumented rather than measured.',
  'Demo Day appears on neither page, deliberately. The C2.2 audit says it has schema but '
    + 'has never been run end to end and must not be described to a customer as proven.',
];

const DECISION = 'Ninety days needs a registry row, or the offer needs to be called twelve '
  + 'weeks. The two internal sources disagree, the pages currently follow the registry, and '
  + 'which one is right is a commercial decision rather than a copy edit.';

/* ------------------------------------------------------------------ *
 * ASSERTIONS - the build fails rather than shipping a wrong PDF
 * ------------------------------------------------------------------ */

/** Both routes exist and sit inside the public layout. */
function assertRoutesDeclared() {
  for (const [id, r] of Object.entries(ROUTES)) {
    if (!r.found) throw new Error(id + ': route not found in App.tsx: ' + r.decl);
    if (!r.insideLayout) throw new Error(id + ': route is declared OUTSIDE the PublicLayoutV2 block');
  }
  return Object.values(ROUTES).map((r) => r.line).join(' and ');
}

/** The five stages parsed, and the two audit gaps are not claimed as platform capability. */
function assertStagesMatchAudit() {
  if (STAGES.length !== 5) {
    throw new Error('expected 5 stages parsed from v2Journey.ts, got ' + STAGES.length);
  }
  for (const key of GAPS) {
    const s = STAGES.find((x) => x.key === key);
    if (!s) throw new Error('gap stage missing from source: ' + key);
    if (s.delivery !== 'people') {
      throw new Error(key + ' is marked ' + s.delivery + ', but the C2.2 audit found no '
        + 'platform capability for it');
    }
  }
  return STAGES.filter((s) => s.delivery === 'people').map((s) => s.name).join(' and ');
}

/** Every claim quoted here resolves in the registry and is publishable. */
function assertClaimsVerified() {
  for (const [name, c] of Object.entries(CLAIMS)) {
    if (!c) throw new Error('claim not found in the registry: ' + name);
    if (c.verification !== 'VERIFIED') {
      throw new Error(c.key + ' is ' + c.verification + ', not VERIFIED');
    }
    if (!c.anyRoute) throw new Error(c.key + ' is not approved for all routes');
  }
  return CLAIMS.duration.wording;
}

/** The page source states no duration the registry has not verified. */
function assertNoUnsourcedDurationInSource() {
  const files = ['pages/publicV2/AcceleratorV2.tsx', 'pages/publicV2/HowItWorksV2.tsx',
    'config/v2Journey.ts'];
  for (const f of files) {
    const copy = stripComments(read(...f.split('/')));
    if (/90[\s-]?day|\bninety\b/i.test(copy)) {
      throw new Error(f + ' states a duration the registry cannot source');
    }
  }
  return files.length;
}

/** Nothing is recorded as live while the PR is unmerged. */
function assertNothingClaimedLive() {
  for (const id of Object.keys(TICKETS)) {
    const url = MANIFEST(id).find((r) => r[0] === 'production URL')[1];
    if (/https?:\/\//.test(url)) {
      throw new Error(id + ': a production URL is recorded while the PR is unmerged');
    }
    const rows = criteria(id);
    const last = rows[4];
    if (last.kind !== KIND.PENDING) {
      throw new Error(id + ': the production criterion is not marked pending');
    }
    /*
     * The chip is not enough. A break test rewrote this row's PROSE to claim production
     * verification while leaving the PENDING chip in place; the guard passed, and a reader
     * believes the sentence rather than the chip. So the sentence has to say it too.
     */
    if (!/NOT YET SATISFIED/.test(last.e)) {
      throw new Error(id + ': the production criterion is chipped PENDING but its evidence '
        + 'does not say it is unsatisfied');
    }
    for (const row of rows) {
      if (/verified in production|live in production|production[- ]verified/i.test(row.e)) {
        throw new Error(id + ': "' + row.c + '" claims production verification while the '
          + 'PR is unmerged');
      }
    }
  }
  return true;
}

/**
 * No PR number is spelled anywhere in these modules except the one constant.
 *
 * This guard exists because the number DID drift: four literals said 3191 after the work
 * had moved to a second PR, and the PDFs would have sent a reviewer to a merged PR that
 * does not contain the code they were asked to review.
 */
function assertOnePrNumber() {
  const sources = ['c53c54Data.js', 'c53c54Render.js'];
  for (const f of sources) {
    // Comments are stripped first, as in the duration guard: a note explaining WHY the
    // number changed is exactly the context a later reader needs, and must not be the
    // thing that fails the build.
    const src = stripComments(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    const found = new Set();
    for (const m of src.matchAll(/(?:pull\/|PR )(\d{3,6})/g)) found.add(Number(m[1]));
    found.delete(PR_NUM);
    if (found.size) {
      throw new Error(f + ' spells PR number(s) ' + [...found].join(', ')
        + ' but the artifact cites PR ' + PR_NUM);
    }
  }
  return PR_NUM;
}

/** Every acceptance criterion carries evidence, and every evidence line names something. */
function assertEveryCriterionHasEvidence() {
  let n = 0;
  for (const id of Object.keys(TICKETS)) {
    for (const row of criteria(id)) {
      if (!row.e || row.e.length < 40) throw new Error(id + ': thin evidence for ' + row.c);
      if (!row.kind) throw new Error(id + ': no evidence kind for ' + row.c);
      n += 1;
    }
  }
  return n;
}

module.exports = {
  AS_OF, PR, PR_NUM, STAGES, GAPS, CLAIMS, ROUTES, TICKETS, KIND,
  SO_WHAT, LIMITS, DECISION,
  headline, criteria, MANIFEST,
  assertRoutesDeclared, assertStagesMatchAudit, assertClaimsVerified,
  assertNoUnsourcedDurationInSource, assertNothingClaimedLive, assertEveryCriterionHasEvidence,
  assertOnePrNumber,
};
