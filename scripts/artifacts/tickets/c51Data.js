/**
 * C5.1 - Commercial Website Information Architecture. THE single source for both PDFs.
 *
 * ## Why the route table is read rather than written
 *
 * The ticket's first acceptance criterion is "every page has a proposed route verified as
 * free". Verified means read from the code. `/partners` is the route anybody would propose
 * for an ecosystem-partner page and it is already taken, as is `/proof`, which is the route
 * anybody would propose for the proof story. `c51Routes.js` re-reads the real tree at build
 * time, so a route someone claims next week fails this build instead of colliding in C5.8.
 *
 * ## The homepage picks one story, which is the whole point of the ticket
 *
 * "Designing for all five at once on the homepage" is named as the thing that would make
 * this work untrustworthy. So the homepage carries ONE story, the proof, and routes the five
 * segments onward. The proof story is the right one to keep because it is the only claim
 * that is both differentiated and, since C5.0 shipped on 17 October 2026, checkable by the
 * reader without logging in.
 *
 * ## Measured against the real codebase on 17 October 2026
 *
 * 189 routes declared across App.tsx and five route-tree files. `/contact` is the single
 * inquiry surface and it reads no query parameter, which is a real gap against the third
 * acceptance criterion and is written up rather than glossed.
 */

const AS_OF = '17 October 2026';

const HEADLINE = 'The homepage carries one story, the proof, and routes five segments '
  + 'onward. Every proposed route was checked against the real tree, and the two most '
  + 'obvious choices were already taken.';

const SO_WHAT = [
  'The homepage story is the proof, and it is the only story that can carry the page '
    + 'because it is the only one that is true for all five segments at once and checkable '
    + 'by the reader. Since 17 October a stranger can open a learner page and click through '
    + 'to the commit behind any award. Every other candidate story is segment-specific and '
    + 'would turn the homepage into the everything-platform the ticket exists to prevent.',
  'Two obvious routes are already taken, which is why the criterion says verified. '
    + '`/partners` is a live page, so the ecosystem page mounts at `/ecosystem`. `/proof` is '
    + 'already a proof surface, so the homepage links to it rather than rebuilding it. Two '
    + 'more, `/start` and `/stories`, are redirects rather than pages and should not be '
    + 'mistaken for either.',
  'The third criterion is not met by the current site and cannot be met by page design '
    + 'alone. Every segment can reach `/contact`, so the path exists, but ContactPage reads '
    + 'no query parameter and posts only a fixed form type. An inquiry therefore arrives '
    + 'with no record of which of the five doors it came through, which makes the criterion '
    + 'true and unmeasurable at the same time.',
];

/* ------------------------------------------------------------------ *
 * THE SITE MAP
 * ------------------------------------------------------------------ */

const PAGES = [
  {
    route: '/', segment: false, name: 'Homepage', ticket: 'C5.2', status: 'rewrite',
    job: 'Tell one story and route the rest.',
    story: 'Our people learn to build with AI, and the buyer gets proof of what each person '
      + 'actually built, verified against real code.',
    cta: 'Five segment doors, plus one inquiry.',
  },
  {
    route: '/how-it-works', segment: false, name: 'How it works', ticket: 'C5.3', status: 'new',
    job: 'The five stages, Learn, Build, Prove, Deploy, Manage, for a reader who believes '
      + 'the promise and wants the mechanism.',
    story: 'Segment-neutral. The same mechanism serves all five.',
    cta: 'Into the segment the reader came from, or /contact.',
  },
  {
    route: '/accelerator', segment: false, name: '90-day accelerator', ticket: 'C5.4', status: 'new',
    job: 'The named program with its shape, duration and what the buyer gets at the end.',
    story: 'The offer, not the company.',
    cta: '/contact?segment=accelerator',
  },
  {
    route: '/enterprise', segment: true, name: 'Enterprise', ticket: 'C5.5', status: 'new',
    job: 'The enterprise buyer: capability of their own staff, proven per person.',
    story: 'AI enablement. Category noun per C2.1.',
    cta: '/contact?segment=enterprise',
  },
  {
    route: '/workforce', segment: true, name: 'Workforce and economic development', ticket: 'C5.6',
    status: 'new',
    job: 'Workforce boards and economic development buyers, who fund cohorts by contract.',
    story: 'Workforce readiness. Category noun per C2.1.',
    cta: '/contact?segment=workforce',
  },
  {
    route: '/higher-education', segment: true, name: 'Higher education', ticket: 'C5.7', status: 'new',
    job: 'The continuing education unit, which C2.5 approved as the beachhead on 14 October '
      + 'because it is self-funded and its dean can sign without a faculty senate.',
    story: 'AI readiness. Category noun per C2.1.',
    cta: '/contact?segment=higher-education',
  },
  {
    route: '/ecosystem', segment: true, name: 'Strategic AI ecosystem partners', ticket: 'C5.8',
    status: 'new',
    job: 'Partner and alliance readers. NOT /partners, which is a live page already.',
    story: 'What we bring to an ecosystem that its own courseware does not.',
    cta: '/contact?segment=ecosystem',
  },
  {
    route: '/government', segment: true, name: 'Government', ticket: 'needs one',
    status: 'new',
    job: 'The fifth segment, and it gets its own page. Ali decided this on 18 October 2026, '
      + 'against my recommendation to fold it into /workforce. Group 05 still has no ticket '
      + 'for it, so one has to be raised.',
    story: 'Public-sector buyers, who have their own procurement path and their own '
      + 'constraints. C7.0 found those constraints are real and specific.',
    cta: '/contact?segment=government',
  },
];

/** Pages that already exist and should be linked rather than rebuilt. */
const REUSE = [
  { route: '/proof', what: 'Already a proof surface. The homepage story links here.' },
  { route: '/platform', what: 'The platform page. Link from /how-it-works.' },
  { route: '/pricing', what: 'Pricing. Link from the segment pages that quote a price.' },
  { route: '/contact', what: 'The single inquiry surface for all five segments.' },
  { route: '/services', what: 'Services. Check against /enterprise for overlap before C5.5.' },
];

/** Taken, and taken in a way that is easy to misread. */
const TRAPS = [
  { route: '/partners', why: 'A live page. The ecosystem page cannot mount here.' },
  { route: '/proof', why: 'A live proof surface. Do not rebuild it on the homepage.' },
  { route: '/start', why: 'A redirect, not a page. Do not treat it as a landing surface.' },
  { route: '/stories', why: 'A redirect, not a page. Case studies live behind it.' },
];

/* ------------------------------------------------------------------ *
 * THE GAP AGAINST CRITERION 3
 * ------------------------------------------------------------------ */

const INQUIRY_GAP = {
  what: 'Every segment can reach /contact, so the path exists. None of them can be told '
    + 'apart once it arrives.',
  evidence: 'ContactPage posts metadata { source_form, industry, title } with a fixed form '
    + 'type and reads no query parameter at all. Measured 17 October 2026.',
  fix: 'Have ContactPage read a `segment` query parameter and carry it into that metadata, '
    + 'then give every segment page one CTA to /contact?segment=<slug>. That is a small '
    + 'change and it is what turns "one path to inquiry" from a layout claim into something '
    + 'the funnel can count.',
  constraint: 'ContactPage is 657 lines, past CLAUDE.md’s 500-line ceiling, so under '
    + 'the repository’s own rule the next change to it splits the file first. Budget for '
    + 'that in whichever ticket touches it.',
};

/* ------------------------------------------------------------------ *
 * THE DECISION THE TICKET ASKS ALI FOR
 * ------------------------------------------------------------------ */

/**
 * Both decided by Ali on 18 October 2026. Recorded with what was recommended, because a
 * decision log that only shows the accepted recommendations teaches nothing later.
 */
const DECISIONS = [
  {
    q: 'Does government get its own page?',
    recommended: 'Fold it into /workforce for now.',
    decided: 'YES, its own page and its own section.',
    overridden: true,
    detail: 'My recommendation was to fold it in, on the grounds that C7.0 found the Texas '
      + 'state-agency route gated behind a cooperative contract we do not hold, while local '
      + 'government and school districts buy through the same workforce motion. Ali decided '
      + 'otherwise.',
    consequence: 'The route `/government` was already verified free and is already a door on '
      + 'the homepage, so the IA does not change. What changes is that group 05 now needs a '
      + 'ticket for it, because there is no C5.x covering government and the other four '
      + 'segment pages each have one.',
  },
  {
    q: 'Which segment page is built first?',
    recommended: 'Higher education, C5.7.',
    decided: 'Higher education, C5.7.',
    overridden: false,
    detail: 'C2.5 approved higher education through a self-funded continuing education unit '
      + 'as the beachhead on 14 October, because the CE dean signs without a faculty senate.',
    consequence: 'C5.7 is built first and carries the shared segment template that C5.5, '
      + 'C5.6, C5.8 and the new government page all reuse, so the beachhead audience is also '
      + 'the one the template is tested against.',
  },
];

const LIMITS = [
  'This is structure, not copy and not code, which the ticket puts out of scope. Each page '
    + 'carries its job and its one call to action, and the words are C5.2 to C5.8.',
  'What entry points buyers actually use is still unknown. The ticket names that as missing '
    + 'evidence and nothing here closes it. The segment parameter above is the cheapest way '
    + 'to start collecting it, which is a second reason to do it.',
  'The route check is a point-in-time read of the code. It is implemented as a build '
    + 'assertion rather than a table in this document precisely so it re-runs rather than '
    + 'goes stale.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS - the ticket's acceptance criteria, as build gates
 * ------------------------------------------------------------------ */

const { checkRoute, declaredRoutes } = require('./c51Routes');

/**
 * "Every page has a proposed route verified as free."
 *
 * Re-reads the real route tree. The homepage is exempt because it is a rewrite in place and
 * is supposed to be taken; every other page must be unclaimed BY SOMETHING ELSE.
 *
 * ## "Taken" and "collision" are not the same thing, and this guard used to confuse them
 *
 * This document proposes routes for pages other tickets will later build. When one of
 * those tickets ships, the route becomes occupied - by the page this document asked for.
 * The first version of this guard read that as a collision and failed the build, which
 * meant the IA became unbuildable precisely because its proposals had succeeded.
 * /how-it-works and /accelerator both did exactly that once C5.3 and C5.4 shipped.
 *
 * So a proposed route passes in two cases: nothing holds it, or the only thing holding it
 * is the route this IA named. Anything else is a real collision and still fails.
 */
function assertRoutesFree() {
  const declared = declaredRoutes();
  const bad = [];
  const fulfilled = [];
  for (const p of PAGES) {
    if (p.route === '/') continue;
    const r = checkRoute(p.route, declared);
    if (r.free) continue;
    const onlyItself = (r.takenBy || []).every((t) => t === p.route);
    if (onlyItself) {
      fulfilled.push(`${p.route} (${p.ticket})`);
      continue;
    }
    bad.push(`${p.route} (${p.ticket}) is taken by ${r.takenBy.join(', ')}`);
  }
  if (bad.length) {
    throw new Error('C5.1: proposed route(s) collide with something else: ' + bad.join('; '));
  }
  return { checked: PAGES.length - 1, declared: declared.size, fulfilled };
}

/** The traps must really be traps, or the warning is noise. */
function assertTrapsAreReallyTaken() {
  const declared = declaredRoutes();
  for (const t of TRAPS) {
    if (checkRoute(t.route, declared).free) {
      throw new Error(`C5.1: ${t.route} is listed as taken but the tree says it is free`);
    }
  }
  return TRAPS.length;
}

/**
 * "Homepage tells one story."
 *
 * Enforced structurally: exactly one page may carry a story, and the homepage's own story
 * may not try to name the segments. A homepage story that lists audiences is the
 * everything-platform failure wearing a different hat.
 */
function assertHomepageTellsOneStory() {
  const home = PAGES.find((p) => p.route === '/');
  if (!home) throw new Error('C5.1: no homepage in the site map');
  const story = String(home.story).toLowerCase();
  for (const seg of ['enterprise', 'workforce', 'higher education', 'ecosystem',
    'government']) {
    if (story.includes(seg)) {
      throw new Error(`C5.1: the homepage story names the "${seg}" segment, which is the `
        + 'everything-platform failure this ticket exists to prevent');
    }
  }
  if (story.split('.').filter((s) => s.trim()).length > 1) {
    throw new Error('C5.1: the homepage story is more than one sentence');
  }
  return true;
}

/**
 * "Each segment has one path to inquiry", and the gap against it stays stated.
 *
 * Counted from the `segment` flag, not from the CTA string. The first version counted any
 * page whose CTA carried `segment=`, which swept in the 90-day accelerator and made the
 * homepage promise five doors while rendering six. An offer page is not an audience.
 */
function assertOnePathToInquiry() {
  const segments = PAGES.filter((p) => p.segment);
  if (segments.length !== 5) {
    throw new Error(`C5.1: the homepage promises five doors and there are ${segments.length}`);
  }
  for (const s of segments) {
    const n = (String(s.cta).match(/\/contact/g) || []).length;
    if (n !== 1) throw new Error(`C5.1: ${s.route} does not have exactly one inquiry path`);
  }
  if (!INQUIRY_GAP.evidence || !/reads no query parameter/i.test(INQUIRY_GAP.evidence)) {
    throw new Error('C5.1: the inquiry-attribution gap must stay stated, not quietly dropped');
  }
  return segments.length;
}

module.exports = {
  AS_OF, HEADLINE, SO_WHAT, PAGES, REUSE, TRAPS, INQUIRY_GAP, DECISIONS, LIMITS,
  assertRoutesFree, assertTrapsAreReallyTaken, assertHomepageTellsOneStory,
  assertOnePathToInquiry,
};
