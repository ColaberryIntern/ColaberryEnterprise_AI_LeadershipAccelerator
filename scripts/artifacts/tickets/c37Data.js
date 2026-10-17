/**
 * C3.7 - Strategic Partner Expansion Map. THE single source for both PDFs.
 *
 * ## The finding that reframes the question
 *
 * Every one of these eight programs authorizes you to teach THE VENDOR'S OWN COURSEWARE
 * ABOUT THE VENDOR'S OWN PRODUCTS. Not one has a category, a field or a scoring mechanic for
 * "we teach your people to build with AI and prove it against their commits", and several
 * forbid altering the content at all. So none of them is a channel for the offer we already
 * sell. Each is a distribution route for a SECOND, product-training line of business that
 * would sit alongside it.
 *
 * That is worth more than the ranking, because it changes what the decision is about.
 *
 * ## Ranked by fit and reachability, never by brand size
 *
 * The ticket names that failure mode explicitly, and it would have produced the wrong answer
 * here: the two largest brands in the set, AWS and Google Cloud, rank last and second to
 * last. AWS is shut, and Google says "invitation only" in its own words.
 *
 * ## Evidence
 *
 * Researched 17 October 2026 against primary vendor sources. The three facts the ranking
 * actually rests on were then re-verified directly rather than taken from the research:
 *
 *   - NVIDIA's ALP Partner Assessment Form returns HTTP 200 and resolves to a live Microsoft
 *     Forms response page.
 *   - The AWS closure sentence is present on a page carrying Last-Modified
 *     Fri, 16 Oct 2026 00:20:27 GMT, one day before the research ran.
 *   - NVIDIA's ALP page carries both delivery models and the instructor-quality criterion.
 *
 * Two gaps the research flagged as browser-only were also closed here: Salesforce's
 * `/authorized-training-provider` path returns 404 today, and the Trailhead Academy site
 * renders only Salesforce-delivered instructor-led courses.
 */

const AS_OF = '17 October 2026';

const DOOR = {
  OPEN: { k: 'OPEN FORM', color: '#2f7d32' },
  SELF: { k: 'SELF-SERVE', color: '#1f6feb' },
  INVITE: { k: 'INVITATION ONLY', color: '#b26a00' },
  SHUT: { k: 'SHUT', color: '#b3261e' },
  NONE: { k: 'NO SUCH CATEGORY', color: '#b3261e' },
  EXCLUDES: { k: 'EXCLUDES US', color: '#b3261e' },
};

const HEADLINE = 'None of the eight is a channel for what we already sell. Every one of them '
  + 'licenses you to teach the vendor’s courseware about the vendor’s products, and '
  + 'not one has a field for proof of what a learner built.';

const SO_WHAT = [
  'So the decision is not "which ecosystem do we join". It is "do we want a second, '
    + 'product-training line of business at all". If the answer is no, this map is a list of '
    + 'eight dead ends and the honest recommendation is Knimbus, which is a channel rather '
    + 'than a courseware license. If the answer is yes, NVIDIA is the one to open.',
  'Ranking by brand size would have produced exactly the wrong answer, which is the failure '
    + 'mode the ticket names. The two biggest names rank last: AWS is shut, verified on a '
    + 'page AWS itself modified the day before we looked, and Google Cloud says "companies '
    + 'may join by invitation only" in its own program document.',
  'NVIDIA is first on both axes at once, which nothing else manages. Its catalog is '
    + 'agent-building, RAG and prompt engineering, which is substantively our subject matter '
    + 'rather than cloud infrastructure, and it is the only one of the eight with a public '
    + 'application form, verified live. It also tells you in writing what it scores on: '
    + 'instructor quality.',
];

/* ------------------------------------------------------------------ *
 * THE RANKING
 * ------------------------------------------------------------------ */

const RANKED = [
  {
    rank: 1, name: 'NVIDIA', program: 'Authorized Learning Partner (ALP)', door: DOOR.OPEN,
    category: 'YES. Two: the ALP program, and an NPN "Education Services" partner type.',
    route: 'Public Partner Assessment Form, verified live and returning 200 on 17 Oct 2026. '
      + 'Review the learning paths, check instructor qualifications, submit the form.',
    eligibility: 'No revenue threshold, no customer references, no invitation, no published '
      + 'fee. At least two NVIDIA-Certified Instructors on staff is the real commitment.',
    fit: 'The catalog is agent-building, RAG, prompt engineering and multi-agent workflows, '
      + 'which is our subject matter rather than cloud plumbing. Deliver-Only is near '
      + 'zero-risk: NVIDIA sells and hosts, we deliver, NVIDIA pays per session, so we buy '
      + 'reference logos rather than pipeline risk.',
    against: 'Content cannot be customized, so the proof layer stays a separate Colaberry '
      + 'product. The annual student-kit purchase is an undisclosed cash outlay and should '
      + 'be the first question asked.',
  },
  {
    rank: 2, name: 'Microsoft', program: 'Training Services Partner (TSP)', door: DOOR.SELF,
    category: 'YES. TSP, formerly the Learning Partner Program, plus a Solutions Partner for '
      + 'Training Services designation on top.',
    route: 'Join the AI Cloud Partner Program, then submit the Training Services Partner '
      + 'Onboarding Form, which sits behind a partner sign-in. Onboarding takes one to two '
      + 'weeks and needs no business plan.',
    eligibility: 'TSP enrollment is "available to all organizations who meet the previous '
      + 'requirements". No invitation, no revenue floor, no references.',
    fit: 'The category is unambiguously enterprise skilling, and the trainer entry credential '
      + 'is a business-level AI one rather than a deep Azure engineering one, which suits a '
      + 'company that trains executives.',
    against: 'The designation, as opposed to enrollment, wants 1,000 courseware points and '
      + '200 purchased exam vouchers in a trailing year. That is a year-two objective at '
      + 'best, and the vouchers are cash out with no guaranteed offset.',
  },
  {
    rank: 3, name: 'Databricks', program: 'Brickbuilder Partner Network', door: DOOR.SELF,
    category: 'NOT in the published program. An unpublished Authorized Training Partner '
      + 'designation exists; a UK firm announced being "first ATP in EMEA" in Feb 2025.',
    route: 'Public partner application at partners.databricks.com, or partners@databricks.com. '
      + 'Bronze is the entry tier.',
    eligibility: 'Bronze needs only a signed agreement. No fee, no revenue floor and no '
      + 'reference minimum are published anywhere, and that absence was confirmed rather '
      + 'than assumed.',
    fit: 'The partner value score literally awards points for registering certified '
      + 'consultants and submitting customer reference stories, which is the closest thing '
      + 'in this set to a scoring surface our output already fits.',
    against: 'The four published tracks are Consulting, Connected, Data and Built-On, and a '
      + 'training company is none of them cleanly. We would enter as Consulting and be '
      + 'measured on sourced revenue we do not sell. "First ATP in EMEA" suggests regional '
      + 'scarcity rather than an open category.',
  },
  {
    rank: 4, name: 'ServiceNow', program: 'Authorized Training Partner (ATP)', door: DOOR.INVITE,
    category: 'Likely YES but unpublished. "Eligible to execute an Enterprise Training '
      + 'Agreement" is a listed benefit for two of the four modules, and training carries a '
      + 'partner resale discount.',
    route: 'Four-step self-serve application to the partner program. ATP itself is reportedly '
      + 'open only to Services and Service Provider partners and appears to be recruited '
      + 'rather than applied to. The one concrete address is atp@servicenow.com.',
    eligibility: 'A single annual membership fee now applies to all partners. The amount is '
      + 'not published anywhere.',
    fit: 'The best thesis in the set: ServiceNow sells workflow automation that fails without '
      + 'trained builders, it treats training as a resellable line item, and it has a '
      + 'contractual vehicle for delivery. Proof of what each person built is a real '
      + 'differentiator against incumbents shipping generic courseware.',
    against: 'The worst evidence in the set. servicenow.com blocks automated retrieval '
      + 'entirely, so the findings rest on a 30 Jan 2026 archive snapshot and the newsroom. '
      + 'Entry is a relationship rather than a form, and the fee is unsized.',
  },
  {
    rank: 5, name: 'Salesforce', program: 'Trailblazer Workforce Partner', door: DOOR.EXCLUDES,
    category: 'YES, and it excludes us in writing. Its own FAQ: "being a part of this program '
      + 'does not provide the opportunity to train professionals."',
    route: 'trailblazerworkforcepartner@salesforce.com. No online form. The general partner '
      + 'program is a self-serve signup taking up to 12 weeks.',
    eligibility: 'Workforce program training at least 20 learners a year, one Salesforce '
      + 'certification on staff. The general program reaches Select on two certifications '
      + 'plus one qualified lead, the lowest published bar anywhere in this set.',
    fit: 'The only vendor that has publicly thought about training partners at all, with '
      + 'three separate constructs. Its competency machinery scores projects delivered and '
      + 'CSAT, which our evidence could speak to.',
    against: 'Each construct blocks a different part of what we do. Workforce is for '
      + 'job-seeker pipelines and bars training professionals, which is our whole customer. '
      + 'Training Reseller means selling Salesforce courses taught by Salesforce instructors. '
      + 'The authorized-delivery program is the right shape, and its own URL returns 404 '
      + 'today while the Academy site shows only Salesforce-delivered courses.',
  },
  {
    rank: 6, name: 'Google Cloud', program: 'Authorized Training Partner (ATP)', door: DOOR.INVITE,
    category: 'YES, and closed. Google’s own 2026 requirements document: "Companies may '
      + 'join by invitation only."',
    route: 'No open application exists. Enroll in the Partner Network, obtain an authorization '
      + 'under the Services Engagement model, and be invited.',
    eligibility: '200 learners a year at the entry level, and partners must offer all Google '
      + 'Cloud Learning Tracks at Partner level and above.',
    fit: 'Instructor-led shaped, which matches how we deliver, and the public sector and '
      + 'education competency is adjacent to work we already do.',
    against: 'Three kinds of instability at once: the program renamed ten months ago, the '
      + 'training-partner documentation has 404s across it, and the prerequisite it names '
      + 'may itself be retiring. Measurement is learner volume and CSAT, with a Google right '
      + 'to audit trainers.',
  },
  {
    rank: 7, name: 'Snowflake', program: 'Snowflake Partner Network', door: DOOR.NONE,
    category: 'NO. Confirmed three ways: absent from the track list, absent from the live '
      + 'directory’s partner-type filter, and absent from both partner pages. All '
      + 'Snowflake training is delivered by Snowflake.',
    route: 'Self-serve signup at spn.snowflake.com. Registered tier is free.',
    eligibility: 'Registered is free; Select, Premier and Elite each carry an annual fee whose '
      + 'amount is not published. The only hard numbers Snowflake publishes sit at the '
      + 'Snowflake Ready level: ten joint production customers, two referenceable, one '
      + 'published case study.',
    fit: 'Poor. Education is a first-party asset Snowflake delivers itself, so a training '
      + 'company is a substitute for its own function rather than a complement.',
    against: 'New requirements land 2 November 2026 that push partners toward adopting '
      + 'specific Snowflake products as a condition of standing. That is a consumption test, '
      + 'not a capability test. Easy to register, essentially impossible to matter.',
  },
  {
    rank: 8, name: 'AWS', program: 'AWS Training Partner Path', door: DOOR.SHUT,
    category: 'YES on paper, and the door is shut. "The AWS Training Partner program is not '
      + 'currently accepting new applications."',
    route: 'None exists. The only stated channel is to become an established AWS Partner, be '
      + 'assigned a Partner Development Manager, and have that manager register interest.',
    eligibility: 'Not published while the program is closed. The substitute route costs '
      + '$2,500 a year plus four accredited and four certified individuals plus three '
      + 'launched opportunities, and at the end of it you have standing to ask.',
    fit: 'Would have been the cleanest structural match, since AWS makes Training a first-class '
      + 'path rather than a sub-category.',
    against: 'Blocked rather than hard. No form, no waitlist, no published reopening criteria. '
      + 'Verified on a page carrying Last-Modified 16 Oct 2026, so this is not stale.',
  },
];

/** Ali's own addition on the ticket: a live channel rather than a courseware license. */
const KNIMBUS = {
  what: 'Knimbus, introduced to Ram by Saurabh Vadhera at the OPM Ignite Meet',
  why: 'A digital library and identity layer reaching more than 600 institutions, bundling '
    + 'Yotta AI Labs compute, already contacting more than 150 institutions with AI programs. '
    + 'C1.5 found that every filed company that moved delivery off its own P&L did it by '
    + 'routing work through a third-party ecosystem that already existed, and that we have '
    + 'none. An installed base of 600 institutions with an identity layer is the shape of the '
    + 'thing that finding said was missing.',
  caution: 'Indian higher education is a different buyer, geography and funding mechanism from '
    + 'the US workforce and enterprise motion the rest of the ladder models. A second motion '
    + 'under test, not proof the primary one works. Detail lives on C3.8, C3.11, C3.12, C3.13.',
  distinction: 'It is the one route here that would carry OUR program rather than a '
    + 'vendor’s courseware, which is exactly the thing all eight ecosystems lack.',
};

const LIMITS = [
  'Several of these pages will read differently in a quarter. Microsoft withdrew its own '
    + 'training-partner overview PDF, Google has 404s across its training-partner '
    + 'documentation, and NVIDIA’s certified-instructor page still links to a form that '
    + 'is closed. Every claim here carries an access date for that reason.',
  'servicenow.com blocks automated retrieval entirely, so that section rests on a 30 January '
    + '2026 archive snapshot plus the newsroom. Its ATP criteria and its annual fee could not '
    + 'be verified at all, and it is the ecosystem with the best thesis.',
  'No fee amount is published by Microsoft, ServiceNow, Snowflake above Registered, Google, '
    + 'or NVIDIA for student kits. Five of the eight have an unpriced cash gate.',
  'Whether the Databricks application offers "Training Partner" as a selectable program of '
    + 'interest is still unsettled. The portal did not render its form even in a real browser.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS - the ticket's acceptance criteria, as build gates
 * ------------------------------------------------------------------ */

/** "Every ecosystem has a named entry route." */
function assertEveryEcosystemHasARoute() {
  const bad = RANKED.filter((r) => !r.route || String(r.route).trim().length < 20);
  if (bad.length) {
    throw new Error('C3.7: no named entry route for ' + bad.map((b) => b.name).join(', '));
  }
  return RANKED.length;
}

/** "Ranked by fit and reachability with the reasoning shown." */
function assertReasoningShown() {
  for (const r of RANKED) {
    if (!r.fit || !r.against) {
      throw new Error(`C3.7: ${r.name} is ranked without both a fit and an against`);
    }
  }
  const ranks = RANKED.map((r) => r.rank);
  const expected = Array.from({ length: RANKED.length }, (_, i) => i + 1);
  if (JSON.stringify(ranks) !== JSON.stringify(expected)) {
    throw new Error('C3.7: the ranks are not a clean 1..n sequence: ' + ranks.join(','));
  }
  return RANKED.length;
}

/**
 * Ranked by fit and reachability, NOT brand size.
 *
 * The cheapest way to check that is the outcome: if this map ever ranks AWS or Google Cloud
 * in the top half, something has drifted back toward brand size, because AWS is shut and
 * Google says invitation only. This is a blunt instrument and it is pointed at the exact
 * failure the ticket names.
 */
function assertNotRankedByBrand() {
  const shut = RANKED.find((r) => r.name === 'AWS');
  const invite = RANKED.find((r) => r.name === 'Google Cloud');
  const half = RANKED.length / 2;
  if (shut.rank <= half || invite.rank <= half) {
    throw new Error('C3.7: a shut or invitation-only ecosystem ranks in the top half. '
      + 'That is the brand-size failure this ticket names.');
  }
  if (shut.door !== DOOR.SHUT) throw new Error('C3.7: AWS must be marked shut');
  return true;
}

/** "No outreach initiated." Nothing here may read as a sent message. */
function assertNoOutreach() {
  const prose = [HEADLINE, ...SO_WHAT, ...RANKED.map((r) => r.route + r.fit + r.against)]
    .join(' ').toLowerCase();
  for (const banned of ['we contacted', 'we emailed', 'we applied', 'we submitted',
    'reached out to', 'i contacted', 'application submitted']) {
    if (prose.includes(banned)) {
      throw new Error('C3.7: the prose implies outreach was initiated ("' + banned + '")');
    }
  }
  return true;
}

module.exports = {
  AS_OF, DOOR, HEADLINE, SO_WHAT, RANKED, KNIMBUS, LIMITS,
  assertEveryEcosystemHasARoute, assertReasoningShown, assertNotRankedByBrand, assertNoOutreach,
};
