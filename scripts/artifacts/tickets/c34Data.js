/**
 * C3.4 - the OpenAI route, re-verified. THE single source for both PDFs.
 *
 * ## The acceptance criterion that shaped the method
 *
 * "Absences proven by probing, not inferred." That is harder than it sounds here, because
 * openai.com serves a Cloudflare managed challenge: a naive client gets 403 on pages that
 * certainly exist AND on pages that certainly do not, so its log cannot tell the two apart.
 * Every absence below was established through a channel validated in both directions on the
 * same run - a known-real page must return 200 and a nonsense path must return 404 - using
 * `scripts/artifacts/probeUrls.js`, which fails the run rather than printing a log that would
 * be mistaken for evidence.
 *
 * ## The finding that matters most is about our own baseline
 *
 * Three of the four things the 6 October pass recorded still hold. The fourth was wrong when it
 * was written, and it is the commercially important one.
 */

const ACCESS = '16 October 2026';
const BASELINE = '6 October 2026';

const C = {
  HIGH: { k: 'HIGH', color: '#2f7d32', note: 'Verbatim on an OpenAI-owned page' },
  MED: { k: 'MEDIUM', color: '#b26a00', note: 'Credible third party' },
  NONE: { k: 'NOT VERIFIED', color: '#b3261e', note: 'Could not confirm' },
};

const HEADLINE = 'Anthropic has a published front door and OpenAI does not, so these two tracks '
  + 'are not parallel and should not be run as if they were.';

const SO_WHAT = [
  'OpenAI has no training or education partner category at all. That was proven exhaustively: '
  + 'the entire industry taxonomy across all 80 partner pages is "Cross-industry" and '
  + '"Government and Public Sector", and the strings Training, Enablement, Certification and '
  + 'Workforce appear zero times on the partner locator.',
  'The credential that would matter to us has not shipped. openai.com/certifications/ returns a '
  + 'true 404 through a validated channel, and no certification page exists anywhere in '
  + 'OpenAI\'s own 2,058-URL sitemap. It is pilot-gated at Arizona State and the California '
  + 'State University system.',
  'The Community Trainer Program admits people only by nomination from organizations already '
  + 'inside the partner set. OpenAI publishes 47 intake forms for other programs and has not '
  + 'published one for this, which is a stronger signal than any 404.',
];

/* ------------------------------------------------------------------ *
 * WHAT THE BASELINE GOT WRONG
 * ------------------------------------------------------------------ */

const BASELINE_CHECK = [
  { claim: 'The Academy Community Trainer Program has no application mechanism',
    verdict: 'HOLDS', color: '#2f7d32',
    detail: '31 trainer-related URLs probed across both hosts, every one a 404 through a '
      + 'validated channel. Stronger than the 404s: OpenAI\'s sitemap enumerates 47 live '
      + 'openai.com/form/ intake forms for other programs and not one is a trainer or academy '
      + 'application. Exactly one of the 47 touches learning at all, /form/learning-lab/, and '
      + 'opening it shows an email-updates subscription rather than an application.' },
  { claim: 'The Partner Network is self-serve but has no training or education category',
    verdict: 'HALF WRONG, and the wrong half is the one that matters', color: '#b3261e',
    detail: 'The "no training or education category" half holds and is now proven exhaustively. '
      + 'The rest understates the program badly. Three tiers, Select, Advanced and Elite, were '
      + 'announced on 14 June 2026, which is FOUR MONTHS BEFORE the baseline pass, and they are '
      + 'live: parsing all 80 partner pages gives 32 Advanced, 27 Select, 10 Elite and 11 '
      + 'untiered. The same announcement carries $150 million and an explicit aim to train and '
      + 'enable 300,000 certified consultants by the end of 2026. The baseline missed all of it. '
      + 'The likely cause is that the public partners landing page shows a lifecycle, Enroll, '
      + 'Enable, Grow, and not the tier ladder, which lives in the announcement and in the '
      + 'per-partner badge markup.' },
  { claim: 'Chaya Nayak is Head of Certifications and Jobs Platform',
    verdict: 'HOLDS, but it is nine months old', color: '#b26a00',
    detail: 'Confirmed from the person\'s own congressional testimony of 14 January 2026, '
      + 'where the first-person text reads "I serve as Head of Certifications and the Jobs '
      + 'Platform at OpenAI". That is a primary self-attested document, but it is the newest '
      + 'source of any kind and she appears on no OpenAI-owned page. Treat as '
      + 'last-confirmed-January, not confirmed-current.' },
  { claim: 'The full certification has not shipped and the Jobs Platform is past its target',
    verdict: 'HOLDS, and the Jobs Platform absence is harder than a 404', color: '#2f7d32',
    detail: 'openai.com/certifications/ and openai.com/jobs-platform/ both return a true 404 '
      + 'through a validated channel, reproduced independently. Neither appears in the 2,058-URL '
      + 'sitemap. Two candidate Jobs Platform subdomains are NXDOMAIN, meaning the hostnames have '
      + 'never been provisioned, which is a stronger absence than a 404. "Jobs Platform" appears '
      + 'in zero OpenAI pages published in 2026.' },
];

/* ------------------------------------------------------------------ *
 * THE PROBE LOG, the acceptance criterion made visible
 * ------------------------------------------------------------------ */

const CONTROLS = [
  { url: 'openai.com/charter/', status: 200, means: 'known-real page returns 200, so the channel '
      + 'is not being blocked' },
  { url: 'openai.com/fakesection-qqq111x/', status: 404, means: 'nonsense path returns 404, so a '
      + '404 genuinely means absent' },
  { url: 'academy.openai.com/', status: 200, means: 'second host, known-real' },
  { url: 'academy.openai.com/this-definitely-does-not-exist-qqq111x', status: 404,
    means: 'second host, nonsense control' },
];

const PROBES = [
  { url: 'openai.com/certifications/', status: 404, reads: 'ABSENT. The certification product '
      + 'page does not exist.' },
  { url: 'openai.com/jobs-platform/', status: 404, reads: 'ABSENT.' },
  { url: 'jobs.openai.com', status: 'NXDOMAIN', reads: 'Never provisioned. Harder than a 404.' },
  { url: 'openai.com/academy/community-trainer/ and 30 sibling paths', status: 404,
    reads: 'ABSENT. No trainer application anywhere.' },
  { url: 'openai.com/business/partners/', status: 200, reads: 'Exists. The partner network is real.' },
  { url: 'partners.openai.com/', status: 200, reads: 'Exists, but it is a Salesforce portal '
      + 'serving a JavaScript shell. Anything behind the login is unverifiable from outside.' },
  { url: 'academy.openai.com/', status: 200, reads: 'Exists and is readable.' },
  { url: 'openai.com/form/learning-lab/', status: 200, reads: 'Exists, and is an email-updates '
      + 'subscription rather than an application.' },
];

/** The trap that makes a naive probe log worthless on this domain. */
const CLOUDFLARE = 'openai.com serves a Cloudflare managed challenge. Measured today: a plain '
  + 'curl returns 403 for openai.com/charter/, which exists, AND 403 for a nonsense path, which '
  + 'does not. The two are indistinguishable, so a log built that way proves nothing in either '
  + 'direction. A full browser header set restores true codes. Node\'s https module does NOT '
  + 'work even with identical headers, because Cloudflare fingerprints the TLS handshake as well, '
  + 'which our own probe tool discovered by failing its control check and refusing to report.';

/* ------------------------------------------------------------------ *
 * WHAT DOES EXIST, which is the actual route
 * ------------------------------------------------------------------ */

const DOORS = [
  { name: 'The Partner Network application', url: 'partners.openai.com', open: 'Application',
    detail: 'Framed as consideration rather than admission: "Share your company\'s '
      + 'capabilities, technical expertise, and customer experience to be considered." Three '
      + 'tiers behind it, measured on sales performance, technical capability, co-sell '
      + 'engagement and deployment experience. No training or education category to be listed '
      + 'under.', fit: 'Possible, but we would be listed as a generic cross-industry partner.' },
  { name: 'The 300,000 certified consultants program', url: 'announced 14 June 2026',
    open: 'The live commercial surface', detail: 'OpenAI is investing $150 million and aims to '
      + 'train and enable 300,000 certified consultants by the end of 2026. It certifies '
      + 'consultants INSIDE partner firms. That is not a category you can be listed under, but '
      + 'it is the part of the program that actually touches what we do. OpenAI has not '
      + 'published the training, assessment or certification requirements.',
    fit: 'The most plausible way in, and it requires being a partner firm first.' },
  { name: 'Enterprise Champion Network', url: 'champions.openai.com', open: 'Self-serve, gated',
    detail: 'Live "Apply to join" link. Requires a ChatGPT Enterprise plan and a work email; '
      + 'personal addresses are refused.', fit: 'Gated behind an enterprise plan.' },
  { name: 'Champion Community club', url: 'academy.openai.com', open: 'Open',
    detail: 'The non-Enterprise version of the above, on the Academy platform.',
    fit: 'Open to anyone. Low commitment, low signal.' },
  { name: 'The Community Trainer Program', url: 'no URL exists', open: 'Nomination only',
    detail: 'Participating organizations nominate their own staff. There is no self-serve route '
      + 'for an organization that is not already a partner.', fit: 'Closed to us today.' },
];

/** How an organization actually got in, which is the useful precedent. */
const GOODWILL = {
  what: 'OpenAI co-developed a hands-on AI literacy workshop with Goodwill Keystone in '
    + 'Pennsylvania, announced 25 March 2025, training their employment specialists to use '
    + 'ChatGPT with job-seekers.',
  structure: [
    'No form was involved and none existed. It was announced eighteen months before the '
    + 'Community Trainer Program, in a global-affairs post rather than as an application outcome.',
    'The qualifying signal was demonstrated prior adoption. OpenAI\'s own framing selects '
    + 'them as "an early adopter of AI in the nonprofit sector". They had a track record first.',
    'It was a cohort, not a one-off. The same announcement names Georgia Tech, Miami Dade '
    + 'College, CareerVillage, Talent Ready Utah, Common Sense Media, OATS from AARP and the '
    + 'Fund for the City of New York.',
    'It was co-development, not consumption. The partner supplies the delivery channel and the '
    + 'learner population; OpenAI supplies curriculum and brand.',
    'And the partner owns the funnel. The GAINS 2026 event ran on 12 and 13 October 2026, four '
    + 'days before this brief, and the Academy listing states plainly that "Registration is '
    + 'managed by Goodwill Keystone Area".',
  ],
  readAcross: 'Both routes run through an existing relationship. There is no door that opens '
    + 'from the outside. The way in is to be visibly good at something in a named sector, get '
    + 'recruited into a cohort, and own the registration funnel yourself.',
};

/* ------------------------------------------------------------------ *
 * PEOPLE
 * ------------------------------------------------------------------ */

const PEOPLE = [
  { name: 'Leah Belsky', title: 'Vice President of Education', conf: C.HIGH,
    src: 'openai.com/index/bringing-chatgpt-for-teachers-to-more-us-school-districts/, published '
      + '26 August 2026',
    note: 'Corroborated on two further OpenAI-owned pages. Third parties circulate "VP and GM of '
      + 'Education"; OpenAI\'s own pages say Vice President of Education, so use theirs.' },
  { name: 'Chris Lehane', title: 'Chief Global Affairs Officer', conf: C.HIGH,
    src: 'openai.com/index/ai-policy-window/, byline, published 9 September 2026',
    note: 'A second interim communications title circulates on a forum page that was not opened. '
      + 'It is not asserted here.' },
  { name: 'Chaya Nayak', title: 'Head of Certifications and the Jobs Platform', conf: C.MED,
    src: 'Her own congressional testimony, House Committee on Education and the Workforce, '
      + '14 January 2026',
    note: 'THE WEAKEST FACT IN THIS BRIEF. Nine months old and the newest source of any kind. She '
      + 'appears on no OpenAI-owned page. The committee\'s own witness list renders it as '
      + '"Head of Jobs and Certifications". Last-confirmed-January, not confirmed-current.' },
];

/** Two corrections from an earlier pass. Carried forward so they are not re-made. */
const CORRECTIONS = [
  { who: 'Lois Newman', wrong: 'placed in Education',
    right: 'Customer Enablement, not Education',
    status: 'Preserved. Nothing found contradicts it. Public traces point to customer-facing '
      + 'enablement, which is distinct from the Education organization that serves schools and '
      + 'universities. Their exact current title could not be verified to the open-the-page '
      + 'standard, so it is not stated here.' },
  { who: 'Danieta Morgan-Moore', wrong: 'connected to an OpenAI "Learning Lab"',
    right: 'No connection to either Learning Lab',
    status: 'Preserved. An exact-phrase search returns zero results, and the one live Learning '
      + 'Lab surface, openai.com/form/learning-lab/, names no individuals at all.' },
];

/* ------------------------------------------------------------------ *
 * THE DECISION
 * ------------------------------------------------------------------ */

const DECISION = {
  question: 'Does OpenAI run in parallel with Anthropic at all?',
  recommend: 'Not in parallel, and not at equal weight. Sequence it behind Anthropic.',
  why: [
    'Anthropic publishes a front door. Three eligibility gates we already meet, a self-serve '
    + 'application, published tier thresholds, and exams we can buy once admitted. The path is '
    + 'legible even though we are at zero on all three tier counts.',
    'OpenAI publishes no door for what we do. No training or education partner category exists, '
    + 'the Community Trainer Program is nomination-only from inside the partner set, and the '
    + 'credential that would matter is pilot-gated at two university systems with a 404 where '
    + 'its product page would be.',
    'The cost of pursuing both at once is not money, it is Ali\'s attention, which C4.8 '
    + 'identifies as the binding constraint on the entire company. Two cold partnership tracks '
    + 'compete with the 19 Tier-1 accounts that have a named signer.',
  ],
  butDo: [
    'Submit the OpenAI Partner Network application anyway. It costs an afternoon, it is the only '
    + 'self-serve surface that exists, and the 300,000-consultant program is reachable only from '
    + 'inside the partner set.',
    'Treat the Goodwill Keystone pattern as the actual strategy rather than the application: be '
    + 'visibly good in a named sector, and be recruited.',
    'Re-check in January. The Jobs Platform is four months past target and the certification is '
    + 'in pilot; both shipping would change this recommendation.',
  ],
};

const UNVERIFIED = [
  { what: 'Anything behind the partner portal login',
    why: 'partners.openai.com is a Salesforce Experience Cloud site serving a JavaScript shell. '
      + 'Tier criteria, fees and any private training track are invisible from outside.' },
  { what: 'Whether a training or education category exists privately',
    why: 'Proven absent from every public surface: a 2,058-URL sitemap, the locator, and all 80 '
      + 'partner pages. Cannot be proven absent from the gated portal.' },
  { what: 'Whether a non-public Community Trainer intake exists',
    why: 'Probing proves the absence of public URLs only. Given the announcement says '
      + 'organizations nominate their own staff, a private nomination channel almost certainly '
      + 'exists and is simply not reachable from outside.' },
  { what: 'Prices for any OpenAI course or certification',
    why: 'No price string appears on the Academy page, and the course pages render client-side.' },
  { what: 'Whether Chaya Nayak still holds that title', why: 'See the people table. Nine months.' },
  { what: 'Whether "certified consultants" and "OpenAI Certification" are the same credential',
    why: 'The two appear in different posts and are never reconciled on any OpenAI page.' },
  { what: 'Progress against the 300,000-consultant goal',
    why: 'The end-of-2026 target is published; actual progress is not.' },
];

/* ------------------------------------------------------------------ *
 * THE GATE
 * ------------------------------------------------------------------ */

/** Absence may only be claimed where a validated control pair was recorded. */
function assertAbsenceProven() {
  const good = CONTROLS.filter((c) => c.status === 200).length;
  const bad = CONTROLS.filter((c) => c.status === 404).length;
  if (!good || !bad) {
    throw new Error('an absence claim needs BOTH a known-real control returning 200 and a '
      + 'nonsense control returning 404; found ' + good + ' and ' + bad);
  }
  const claimed = PROBES.filter((p) => /ABSENT|Never provisioned/.test(p.reads));
  const unproven = claimed.filter((p) => p.status !== 404 && p.status !== 'NXDOMAIN');
  if (unproven.length) {
    throw new Error('absence claimed without a 404 or NXDOMAIN: '
      + unproven.map((p) => p.url).join(', '));
  }
  return { controls: CONTROLS.length, probes: PROBES.length, absences: claimed.length };
}

/** The two corrections must still be stated as corrections, not silently reverted. */
function assertCorrectionsPreserved() {
  if (CORRECTIONS.length !== 2) throw new Error('both corrections must be carried forward');
  for (const c of CORRECTIONS) {
    if (!/Preserved/.test(c.status)) {
      throw new Error('correction not preserved for ' + c.who);
    }
  }
  return true;
}

module.exports = {
  ACCESS, BASELINE, C, HEADLINE, SO_WHAT, BASELINE_CHECK, CONTROLS, PROBES, CLOUDFLARE,
  DOORS, GOODWILL, PEOPLE, CORRECTIONS, DECISION, UNVERIFIED,
  assertAbsenceProven, assertCorrectionsPreserved,
};
