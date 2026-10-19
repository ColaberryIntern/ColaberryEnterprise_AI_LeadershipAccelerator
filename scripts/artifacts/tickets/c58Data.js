/**
 * C5.8 - the strategic AI ecosystem partners page, at /ecosystem.
 *
 * ## Its own module rather than an extension of the C5.5/C5.6 one
 *
 * That module pins a single PR number and asserts no other appears. Adding C5.8 to it
 * would make a regenerated C5.5 artifact cite the PR that shipped C5.8, which is exactly
 * the drift the guard there exists to prevent.
 *
 * ## The route proof is a chain, because segment routes are generated
 *
 * App.tsx maps readySegments() to routes rather than declaring one per line, so proving
 * this page is routed means proving three things, all read from the real files at build
 * time: the segment carries `ready: true`, the generator still runs inside the
 * PublicLayoutV2 block, and the slug collides with no literal path.
 *
 * ## The claim this page must not make
 *
 * It is a page about partnering, and `anthropic.partner` is DO_NOT_PUBLISH in the C0.6
 * registry: no contract, badge asset or authorization was ever located. So the copy never
 * claims a partnership with a lab, uses `anthropic.capability` verbatim instead, and
 * `assertNoLabPartnershipClaimed()` reads the shipped copy to keep it that way.
 */

const fs = require('fs');
const path = require('path');

const AS_OF = '19 October 2026';
const ROOT = path.join(__dirname, '..', '..', '..');
const FE = path.join(ROOT, 'frontend', 'src');
const read = (...p) => fs.readFileSync(path.join(FE, ...p), 'utf8');

const APP = read('App.tsx');
const SEGMENTS_SRC = read('config', 'v2Segments.ts');
const REGISTRY_SRC = read('config', 'claimsRegistry.ts');

const PR_NUM = 3243;
const PR = 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/'
  + PR_NUM;
const SLUG = 'ecosystem';
const ROUTE = '/ecosystem';
const BC = 'https://app.basecamp.com/3945211/buckets/7463955/todos/10379236674';

/* ------------------------------------------------------------------ *
 * READ FROM SOURCE
 * ------------------------------------------------------------------ */

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

function readySlugs() {
  const out = [];
  for (const m of SEGMENTS_SRC.matchAll(/slug: '([a-z-]+)',/g)) {
    if (isReady(m[1])) out.push(m[1]);
  }
  return out;
}

const READY = readySlugs();
const UNREADY = [...SEGMENTS_SRC.matchAll(/slug: '([a-z-]+)',/g)]
  .map((m) => m[1]).filter((s) => !READY.includes(s));
const LITERAL = new Set([...APP.matchAll(/path="\/?([a-z0-9-]+)"/g)].map((m) => m[1]));
const GENERATOR = 'readySegments().map((s) => (\n  <Route key={s.slug} path={s.slug} '
  + 'element={<SegmentPageV2 slug={s.slug} />} />\n))';

function registryClaim(key) {
  const m = REGISTRY_SRC.match(new RegExp(
    `key: '${key.replace('.', '\\.')}',\\s*publicWording:\\s*'([^']*)',\\s*verification:\\s*'([A-Z_]+)'`,
  ));
  return m ? { key, wording: m[1], verification: m[2] } : null;
}

const CAPABILITY = registryClaim('anthropic.capability');
const PARTNER = registryClaim('anthropic.partner');
const POSITIONING = registryClaim('positioning.primary');

/* ------------------------------------------------------------------ *
 * ACCEPTANCE CRITERIA
 * ------------------------------------------------------------------ */

const KIND = {
  SOURCE: { k: 'SOURCE', color: '#1f6feb' },
  TEST: { k: 'TEST', color: '#2f7d32' },
  REGISTRY: { k: 'REGISTRY', color: '#7a4fb6' },
  LINK: { k: 'LINK', color: '#b26a00' },
  PENDING: { k: 'PENDING', color: '#718096' },
};

function criteria() {
  return [
    {
      c: 'Page is actually routed, proven by the route tree not just the file',
      e: `App.tsx generates segment routes from readySegments() inside the PublicLayoutV2 `
        + `block, "${SLUG}" carries ready: true in v2Segments.ts, and the slug collides with `
        + `none of the ${LITERAL.size} paths App.tsx declares literally. All three links `
        + 'were read from the real files when this PDF was built, and a test asserts the '
        + 'same chain.',
      kind: KIND.SOURCE,
    },
    {
      c: 'Every claim traces to the registry',
      e: 'Two claims render, both through <Claim> and the C0.6 registry: '
        + 'positioning.primary, and anthropic.capability quoted verbatim as the one safe way '
        + 'to name what we build with. The segment prose carries no figure and no '
        + 'credential, which a build assertion checks by reading the source.',
      kind: KIND.REGISTRY,
    },
    {
      c: 'CTA instrumented',
      e: "trackEvent('cta_click', { cta_name: 'segment_enquiry', segment }) fires on the "
        + `single enquiry link, which carries ?segment=${SLUG}. A test asserts exactly one `
        + '/contact link per page and that it carries its own segment.',
      kind: KIND.TEST,
    },
    {
      c: 'PR open, not merged',
      e: `PR ${PR_NUM}, open. The ticket says open a PR and do not merge, and names copy `
        + 'approval before merge as your decision.',
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

const MANIFEST = [
  ['repo', 'ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator'],
  ['branch', 'workstream/c58-ecosystem-page'],
  ['PR', PR],
  ['files changed', 'frontend/src/config/v2Segments.ts (content and ready flag), '
    + 'frontend/src/pages/publicV2/__tests__/SegmentPageV2.test.tsx (two new guards). No '
    + 'routing change was needed.'],
  ['route', ROUTE],
  ['production URL', 'pending merge and deploy. Not live, and not recorded as live.'],
  ['auth / role', 'none. Public route under PublicLayoutV2.'],
  ['feature flag', 'none. The ready flag in v2Segments.ts is the gate, and it is now true.'],
  ['data source', 'static config plus the C0.6 registry. No API call, no database read.'],
  ['screenshot evidence', 'pending deploy, for the same reason as the URL.'],
  ['production verification', 'pending deploy.'],
  ['rollback', 'set ready: false for the segment. The route disappears because it is '
    + 'generated from that flag.'],
];

/* ------------------------------------------------------------------ *
 * THE TAKEAWAY
 * ------------------------------------------------------------------ */

function headline() {
  return `The partner page ships as content plus a boolean, which takes the C5.1 doors to `
    + `${READY.length} of five live. The work on this one was not the copy: it is a page `
    + 'about partnering, and the single claim it must never make is that we are a lab '
    + 'partner, which the registry marks DO_NOT_PUBLISH for want of any evidence.';
}

const SO_WHAT = [
  'THE CLAIM THIS PAGE COULD HAVE MADE IS THE ONE THE REGISTRY FORBIDS. '
    + 'anthropic.partner carries DO_NOT_PUBLISH and the reason recorded against it is blunt: '
    + 'no contract, badge asset or authorization was located, and a Partner Network '
    + 'application was submitted in June 2026 with admission not evidenced. A page about '
    + 'partnering is exactly where that would reappear, so the copy uses '
    + 'anthropic.capability instead, whose approved wording is the plain statement of what '
    + 'we build with, and a new test asserts no segment claims a lab partnership at all.',
  'A PARTNER’S FIRST QUESTION IS NOT ABOUT CAPABILITY. It is whether you are going to '
    + 'end up selling to their client. So that is the first thing the page answers, in its '
    + 'own words rather than in a reassuring adjective: we deliver the capability build and '
    + 'nothing else, no parallel relationship and no competing scope. A page that led with '
    + 'our capability would be a customer page wearing a partner label, and a test now '
    + 'checks the question is answered at all.',
  'FOUR DOORS OF FIVE ARE OPEN AND THE LAST ONE HAS NO TICKET. Higher education, '
    + 'enterprise, workforce and now the ecosystem partners are live. Government is the '
    + 'remaining door: you approved on 18 October that it gets its own section rather than '
    + 'folding into workforce, and it still needs a ticket raised in group 05. Until it has '
    + 'one it stays ready: false, so it cannot reach a visitor half-written.',
];

const LIMITS = [
  'The copy is not approved. The ticket names copy approval before merge as your decision, '
    + 'so this is a draft a reviewer reads rather than a page a partner reads.',
  'There is no production URL, no screenshot and no production verification, because the '
    + 'PR is open and unmerged exactly as the ticket instructs.',
  'No price, same as the other segment pages. C2.3’s numbers still have no registry '
    + 'row, and a partner page is a particularly bad place to be vague about money, which '
    + 'is an argument for the row rather than for guessing.',
  'There is no partner programme behind this page yet: no tiering, no margin, no referral '
    + 'mechanics, no agreement. It is a page that starts a conversation, and anyone reading '
    + 'it as a published programme would be reading more into it than exists.',
];

const DECISION = 'Copy approval, and whether a partner page should exist before a partner '
  + 'programme does. The page is honest about what it offers and it offers a conversation '
  + 'rather than terms, which I think is the right order; the alternative is to hold it '
  + 'until C3.x settles what a partnership actually is.';

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

function assertSegmentReady() {
  if (!isReady(SLUG)) throw new Error(`${SLUG} is not marked ready`);
  if (!READY.includes(SLUG)) throw new Error(`${SLUG} missing from the ready set`);
  return READY.join(', ');
}

function assertGeneratorRoutesIt() {
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

function assertNoSlugShadowing() {
  for (const slug of READY) {
    if (LITERAL.has(slug)) {
      throw new Error(`the ready slug "${slug}" collides with a literal path in App.tsx`);
    }
  }
  return LITERAL.size;
}

/** THE SIGNATURE GUARD. The shipped copy never claims a partnership with a lab. */
function assertNoLabPartnershipClaimed() {
  if (!PARTNER) throw new Error('anthropic.partner is missing from the registry');
  if (PARTNER.verification !== 'DO_NOT_PUBLISH') {
    throw new Error(`anthropic.partner is now ${PARTNER.verification}. If a partnership has `
      + 'genuinely been authorized this artifact needs rewriting rather than overriding.');
  }
  const prose = [...segmentBlock(SLUG).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).join(' ');
  const bad = [
    /anthropic\s+(partner|partnership)/i,
    /claude\s+code\s+partner/i,
    /\bofficial\s+partner\b/i,
    /\bpartnered\s+with\s+(anthropic|openai)\b/i,
  ];
  for (const re of bad) {
    if (re.test(prose)) throw new Error(`the ecosystem copy claims a lab partnership (${re})`);
  }
  if (!prose.includes(CAPABILITY.wording)) {
    throw new Error('the page does not use the registry’s approved capability wording, '
      + 'which is the only safe way to name what we build with');
  }
  return CAPABILITY.wording;
}

/** The partner's first question is answered, not assumed. */
function assertPartnerQuestionAnswered() {
  const prose = [...segmentBlock(SLUG).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1])
    .join(' ').toLowerCase();
  /*
   * Mentioning the word "relationship" is not answering the question, and an earlier
   * version of this guard accepted it: the lede says "you hold the client relationship",
   * so the test that removed the actual commitment still passed. The page has to COMMIT,
   * so the predicate looks for the commitment rather than the topic.
   */
  const COMMITMENT = new RegExp([
    'stays yours',
    'remains yours',
    'no parallel relationship',
    'no competing scope',
    'we do not (sell|approach|contact)',
  ].join('|'));
  const commits = COMMITMENT.test(prose);
  if (!commits) {
    throw new Error('the page mentions the relationship but never commits to leaving it '
      + 'alone, which is the first thing a partner asks');
  }
  return true;
}

/** The copy carries no price and no figure. */
function assertCopyIsClaimFree() {
  const prose = [...segmentBlock(SLUG).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).join(' ');
  if (/\$\s?\d/.test(prose)) throw new Error('the copy carries a price');
  if (/\d+\s?%/.test(prose)) throw new Error('the copy carries a percentage');
  if (/\bfree\b/i.test(prose)) throw new Error('the copy uses the word free');
  if (/programme|licence|organisation|\bcentre\b|labour|artefact|enrolment/i.test(prose)) {
    throw new Error('the copy uses British spelling');
  }
  return true;
}

/** Nothing recorded as live while the PR is unmerged. */
function assertNothingClaimedLive() {
  const url = MANIFEST.find((r) => r[0] === 'production URL')[1];
  if (/https?:\/\//.test(url)) throw new Error('a production URL is recorded');
  const last = criteria()[4];
  if (last.kind !== KIND.PENDING) throw new Error('the production criterion is not pending');
  if (!/NOT YET SATISFIED/.test(last.e)) {
    throw new Error('chipped pending but the prose does not say it is unsatisfied');
  }
  return true;
}

module.exports = {
  AS_OF, PR, PR_NUM, SLUG, ROUTE, BC, READY, UNREADY, LITERAL, GENERATOR,
  CAPABILITY, PARTNER, POSITIONING, KIND, MANIFEST, SO_WHAT, LIMITS, DECISION,
  headline, criteria, segmentBlock,
  assertSegmentReady, assertGeneratorRoutesIt, assertNoSlugShadowing,
  assertNoLabPartnershipClaimed, assertPartnerQuestionAnswered, assertCopyIsClaimFree,
  assertNothingClaimedLive,
};
