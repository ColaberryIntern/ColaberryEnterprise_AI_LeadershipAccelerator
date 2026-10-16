/**
 * C3.1 - Anthropic route, re-verified. THE single source for both PDFs.
 *
 * ## The rule this module exists to enforce
 *
 * The ticket names the failure mode itself: "Reusing the 6 Oct research without re-verification.
 * Titles from the Partner Summit page are already months old." So nothing here is carried over on
 * trust. Every FACT below records where it was read, the page\'s own date, the date it was read,
 * and a confidence. A claim with no source is not a claim, it is a memory.
 *
 * ## Why confidence is a field rather than a vibe
 *
 * Three of the most load-bearing items came back NOT VERIFIED, and the brief is more useful for
 * saying so than it would be with a plausible number in the hole. `VERDICT.unverified` is rendered
 * as its own section rather than a footnote, because the reader\'s next action depends on it.
 *
 * ## Access date
 *
 * Every live read below happened on 2026-10-16. Where a page carries its own publication or
 * last-modified date, that is recorded separately in `pageDate` - the two answer different
 * questions ("when did they say it" vs "when did we look").
 */

const ACCESS = '16 October 2026';
const ACCESS_ISO = '2026-10-16';

/** Elapsed days, computed. A typed "56 days" is wrong the morning after it is written. */
const daysSince = (iso) => Math.round(
  (Date.parse(ACCESS_ISO) - Date.parse(iso)) / 86400000,
);
const SILENCE_SINCE = '2026-08-21';   // Ali's unanswered reply
const SUBMITTED_SINCE = '2026-06-24'; // the completion form
const BASELINE = '6 October 2026';

/** Confidence tiers. HIGH means verbatim on a page Anthropic owns. Nothing else is HIGH. */
const C = {
  HIGH: { k: 'HIGH', label: 'Verbatim, Anthropic-owned page', color: '#2f7d32' },
  MED: { k: 'MEDIUM', label: 'Credible third party', color: '#b26a00' },
  LOW: { k: 'LOW', label: 'Inferred', color: '#8a6d3b' },
  NONE: { k: 'NOT VERIFIED', label: 'Could not confirm', color: '#b3261e' },
};

const SRC = {
  track: { url: 'anthropic.com/news/services-track-partner-hub', pageDate: 'published 3 Jun 2026, metadata modified 9 Sep 2026' },
  apply: { url: 'claude.com/form/cpn-partner-application', pageDate: 'no date on page' },
  partners: { url: 'claude.com/partners', pageDate: 'no date on page' },
  dir: { url: 'partnerhub.claude.com/directory', pageDate: 'no date on page' },
  certs: { url: 'anthropic-partners.skilljar.com/page/partner-certifications', pageDate: 'no date on page' },
  certFaq: { url: 'anthropic-partners.skilljar.com/page/faq-certifications', pageDate: 'no date on page' },
  certElig: { url: 'anthropic-partners.skilljar.com/page/certification-eligibility', pageDate: 'no date on page' },
  fa: { url: 'claude.com/programs/frontier-academy', pageDate: 'no date on page' },
  faNews: { url: 'anthropic.com/news/claude-frontier-academy', pageDate: 'published 2 Oct 2026' },
  cpnNews: { url: 'anthropic.com/news/claude-partner-network', pageDate: 'published 12 Mar 2026, modified 9 Sep 2026' },
  workshops: { url: 'anthropic.com/events/build-with-claude', pageDate: 'no date on page' },
  events: { url: 'anthropic.com/events', pageDate: 'no date on page' },
  roles: { url: 'claude.com/resources/articles/four-role-based-claude-certifications', pageDate: 'published 23 Jul 2026' },
};

/* ------------------------------------------------------------------ *
 * THE HEADLINE
 * ------------------------------------------------------------------ */

const HEADLINE = 'The ten course completions were never the thing being counted, and the '
  + 'question Ali asked Anthropic on 21 August is ' + daysSince(SILENCE_SINCE)
  + ' days unanswered.';

const SO_WHAT = [
  'Admission does not depend on the four-course Academy path at all. The three published gates '
  + 'are 10 or more employees, a supported region, and offering consulting, implementation or '
  + 'managed services. Colaberry meets all three today.',
  'The "10" in the tier ladder means 10 people holding a PAID, PROCTORED certification, not 10 '
  + 'people finishing free courses. Those exams are sold only to organizations already inside the '
  + 'network, so the bench cannot be built before admission. That is the whole chicken and egg.',
  'A Partner Account Manager is not something Anthropic documents assigning on application. No '
  + 'page promises one. The phrase appears only where it is ASSUMED you already have one.',
];

/* ------------------------------------------------------------------ *
 * THE TIER LADDER - re-verified, and the numbers did not move
 * ------------------------------------------------------------------ */

const TIERS = [
  { name: 'Registered', certified: null, customers: null, stories: null,
    note: 'Entry level. New applicants start here, with "a minimum commitment to 10 certified '
      + 'practitioners". Pays full price for exams.', us: true },
  { name: 'Select', certified: '10 active certified individuals', customers: '2 joint customers '
      + 'deployed in production in the trailing 12 months', stories: '1 public customer story',
    note: 'Where "partnership begins". 50% exam discount starts here.' },
  { name: 'Preferred', certified: '100 active certified individuals', customers: '15 deployed '
      + 'joint customers', stories: '3 public stories', note: '' },
  { name: 'Global Premier', certified: '1,000 active certified individuals', customers: '100 '
      + 'deployed joint customers across three or more regions', stories: '15 public customer '
      + 'stories', note: 'Also requires a joint business plan with named executive sponsors.' },
];

/** The three numbers the ticket singled out for re-verification. All three held. */
const SELECT_RECHECK = [
  { claim: '10 active certified individuals', verdict: 'CONFIRMED, unchanged' },
  { claim: '2 production joint customers', verdict: 'CONFIRMED, with the fuller wording "in the '
      + 'trailing 12 months"' },
  { claim: '1 public customer story', verdict: 'CONFIRMED, unchanged' },
];

/* ------------------------------------------------------------------ *
 * CERTIFICATIONS
 * ------------------------------------------------------------------ */

const CERTS = [
  { name: 'Claude Certified Associate - Foundations', price: 99, counts: false },
  { name: 'Claude Certified Developer - Foundations', price: 125, counts: true },
  { name: 'Claude Certified Architect - Foundations', price: 125, counts: true },
  { name: 'Claude Certified Architect - Professional', price: 175, counts: true },
];

/** Cheapest compliant route to Select\'s bench requirement, computed not typed. */
const CHEAPEST_COUNTING = Math.min(...CERTS.filter((c) => c.counts).map((c) => c.price));
const SELECT_BENCH_COST = CHEAPEST_COUNTING * 10;

/* ------------------------------------------------------------------ *
 * WHAT CHANGED SINCE THE 6 OCTOBER PASS
 * ------------------------------------------------------------------ */

const CHANGES = [
  { what: 'The three Select-tier numbers', short: 'All three hold, verbatim. Page unmodified since 9 Sep.', change: 'NO CHANGE. All three confirmed verbatim. The '
      + 'page carrying them was last modified 9 September 2026, before the baseline pass, so there '
      + 'was no window in which they could have moved.', sev: 'same', src: SRC.track, conf: C.HIGH },
  { what: 'Frontier Academy is nomination-only', short: 'Confirmed verbatim on two pages.', change: 'NO CHANGE. Confirmed verbatim on both '
      + 'the program page and the 2 October announcement.', sev: 'same', src: SRC.faNews, conf: C.HIGH },
  { what: 'The certification name', short: 'Now an EN DASH, not the colon our copy carries.', change: 'CHANGED. Anthropic now renders it with an EN DASH, '
      + '"Claude Certified Architect - Foundations". It used a comma in March and a colon in July. '
      + 'Our own copy carries the colon form.', sev: 'fix', src: SRC.certs, conf: C.HIGH },
  { what: 'Architect Foundations price', short: '$99 is stale; it is $125 since 30 June.', change: 'CHANGED, and our figure is stale. It rose from '
      + '$99 to $125 effective 30 June 2026.', sev: 'fix', src: SRC.certFaq, conf: C.HIGH },
  { what: 'Which exams count toward a tier', short: 'The $99 Associate counts for NOTHING.', change: 'NEW TO US, and it breaks the obvious plan. '
      + 'The $99 Associate "does not count toward Claude Partner Network tier eligibility". Only '
      + 'Developer Foundations, Architect Foundations and Architect Professional count.',
    sev: 'fix', src: SRC.certs, conf: C.HIGH },
  { what: 'The workshop delivery roster', short: 'At least 7 firms, not 4. TENEX runs 7 of 11.', change: 'LARGER than the four we recorded. At least '
      + 'seven firms route sessions: TENEX, Fractal, Bounteous, Zartis, Caylent, AllCloud and '
      + 'Provectus. TENEX alone runs 7 of the 11 partner-led sessions. Whether the roster grew or '
      + 'the "four" was an artifact of how the baseline was gathered cannot be told apart from '
      + "today\'s evidence.", sev: 'fix', src: SRC.workshops, conf: C.HIGH },
  { what: 'The partner-enablement webinar page', short: '404 at every URL variant.', change: 'GONE. '
      + 'anthropic.com/webinars/partner-led-claude-code-workshops now returns 404 at every URL '
      + 'variant tested. If the baseline cited it, that citation is dead.', sev: 'fix',
    src: { url: 'anthropic.com/webinars/partner-led-claude-code-workshops', pageDate: '404 as of ' + ACCESS },
    conf: C.HIGH },
];

/* ------------------------------------------------------------------ *
 * THE PEOPLE - living executives, so titles are re-read not recalled
 * ------------------------------------------------------------------ */

const PEOPLE = [
  { name: 'Steve Corfield', title: 'Global Head of Business Development and Partnerships',
    conf: C.HIGH, src: SRC.faNews,
    note: 'Confirmed on an Anthropic-owned page published 2 October 2026, 14 days before this '
      + 'read. The quoted voice on the Partner Network, Frontier Academy and the certifications. '
      + 'Trade press calls him "channel chief"; that is shorthand and appears on no Anthropic page.' },
  { name: "Rich O'Connell", title: 'Head of Alliances', conf: C.MED,
    src: { url: 'fractal.ai partner release', pageDate: 'published 7 Jul 2026' },
    note: 'STALE. The freshest source is 101 days old; the next is 129 days. The only '
      + 'Anthropic-owned source is an undated page for a past March event. His title already '
      + 'changed once, dropping "Strategic" between May 2025 and June 2026. Re-confirm before use.' },
  { name: 'Hayley Waikart', title: 'NOT VERIFIED', conf: C.NONE,
    src: { url: 'anthropic.com/events/anthropic-partner-kickoff-2026', pageDate: 'past event, 11-12 Mar 2026, no date on page' },
    note: 'The only source is a seven-month-old conference page with no publication date, and what '
      + 'it carries is "Partner Enablement", a function label rather than a title. Every other '
      + 'Anthropic speaker on that same page has a real title; this entry does not. Employment is '
      + 'not in doubt, the title is. Omit it or caveat it; do not print it as fact.' },
];

/* ------------------------------------------------------------------ *
 * OUR OWN STATE - from the ledger and the crontab, not from recall
 * ------------------------------------------------------------------ */

const OURS = {
  submitted: '24 June 2026',
  submittedWhat: '11 people completed the 4-course Academy path; the completion form was '
    + 'submitted for 10 of them.',
  marchPromise: 'Anthropic Partner Support emailed Ram on 18 March 2026 saying one step remained: '
    + 'have 10 individuals complete the Academy path and submit the form, after which Colaberry '
    + '"will be formally admitted to the Claude Partner Network, with Partner Portal access, '
    + 'certification enrollment, and the full program path ahead."',
  contradiction: 'On 21 August 2026 "Fin from Partner Experience", an Intercom AI agent rather '
    + 'than a person, replied that the courses are "recommended preparation only", "not required", '
    + 'with "no required number of learners and no completion submission step". The opposite of '
    + 'the March email.',
  aliReply: 'Ali replied the same day, quoting the March email verbatim and asking plainly how to '
    + 'register, whether the original application is still open, and for a link to any current '
    + 'form or portal, offering a call.',
  silenceDays: daysSince(SILENCE_SINCE),
  sinceSubmission: daysSince(SUBMITTED_SINCE),
  sequence: { sent: 3, total: 15, dates: '13, 20 and 21 August 2026' },
  halt: 'stopped by operator on 21 August 2026 at 13:36 UTC, which was the correct call: a reply '
    + 'had arrived and a human took it over.',
  cron: 'Both reporting-suite crontab lines pass --skip-anthropic, so even clearing the halt would '
    + 'send nothing.',
};

/** Who is right about the contradiction, now that the live pages can settle it. */
const RESOLUTION = 'Fin is right about the CURRENT rules and the March email described a route '
  + 'that the published program does not contain. Admission turns on the three eligibility gates, '
  + 'not on course completions. But Fin answered a question nobody asked: it explained what is not '
  + 'required without saying what Colaberry\'s record actually shows, which is the only thing '
  + 'Ali asked for. The March email is still the more specific commitment, and it was made by a '
  + 'person.';

/* ------------------------------------------------------------------ *
 * THE INSTRUMENT WE ALREADY OWN, POINTED THE WRONG WAY
 * ------------------------------------------------------------------ */

const WATCHER = {
  runs: 'daily at 02:00 UTC, and has been running for at least five months',
  watches: ['docs.anthropic.com', 'anthropic.com/news', 'seven Skilljar course pages'],
  missing: ['the partner network announcement', 'the services track page carrying every tier '
    + 'threshold', 'the certification catalog and its prices', 'Frontier Academy', 'the workshops '
    + 'page', 'anthropic.com/events'],
  placeholder: 'The one partner row is still "https://partners.anthropic.com/PLACEHOLDER", titled '
    + '"update url after 2026-06-12", with last_checked NULL. It has never been checked once, in '
    + 'the four months since the date in its own title.',
  hashOnly: 'Every event stores a content hash in previous_value and current_value, so even for '
    + 'the pages it does watch it can say that something changed but never what. A "critical" '
    + 'event on 16 October carries two hashes and nothing else.',
  octoberEvents: 27,
};

/* ------------------------------------------------------------------ *
 * THE FOLLOW-UP PLAN
 * ------------------------------------------------------------------ */

const PLAN = [
  { n: 1, title: 'Ask the one question that is actually blocking', owner: 'Ali', when: 'this week',
    detail: 'Reply on the existing 21 August thread to partner-support@anthropic.com asking a '
      + 'single closed question: what is Colaberry\'s current status in the partner record, '
      + 'Registered or not listed. Not "what are the requirements", which Fin already answered at '
      + 'length without answering us. A status question has one short answer and is hard to '
      + 'deflect with a policy paragraph.' },
  { n: 2, title: 'Test the front door in parallel', owner: 'Ali', when: 'this week',
    detail: 'Submit the open application at claude.com/form/cpn-partner-application. It needs no '
      + 'invitation, Colaberry meets all three published gates, and membership costs nothing. If '
      + 'the June submission was filed against a route that no longer exists, this is the route '
      + 'that does. Worst case it duplicates a record, which partner support can merge.' },
  { n: 3, title: 'Settle the two things only a login can settle', owner: 'Ali', when: 'on admission',
    detail: 'Two facts could not be verified from outside and both sit behind the portal: whether '
      + 'a new "Certified" tier exists between Registered and Select, and what the Program Guide '
      + 'says about demotion exceptions. Neither changes the plan; both change the timeline.' },
  { n: 4, title: 'Do not restart the 15-note sequence', owner: 'Claude', when: 'standing',
    detail: 'The halt is correct and the memory is explicit that it must not restart without a '
      + 'fresh instruction. A daily note to a desk that already replied is the outreach equivalent '
      + 'of an infinite retry. If it ever does restart, use --resume; --reset re-sends letter one.' },
  { n: 5, title: 'Point the watcher at the pages that matter', owner: 'Claude', when: 'next sprint',
    detail: 'Replace the dead PLACEHOLDER row with the six partner URLs listed above, and store a '
      + 'text diff rather than only a hash so the next "what changed since" question can be '
      + 'answered by the system instead of by three research agents.' },
];

/** The ticket\'s stated objective, and why it is the wrong target as written. */
const PAM_NOTE = 'The ticket sets the follow-up\'s single objective as getting a Partner '
  + 'Account Manager assigned. Worth flagging: no Anthropic page states that a PAM is assigned on '
  + 'application, or names any response timeline. What joining is documented to grant is Partner '
  + 'Portal access and, for qualified partners, a directory listing. "Partner Account Manager" '
  + 'appears on the Frontier Academy page, where it is addressed to organizations that already '
  + 'have one. So the reachable goal is a named human who can read our record, and the PAM is '
  + 'downstream of admission rather than the lever on it.';

/* ------------------------------------------------------------------ *
 * WHAT WE COULD NOT VERIFY
 * ------------------------------------------------------------------ */

const UNVERIFIED = [
  { what: 'A response timeline, or any promise of a named partner contact on application',
    why: 'Four partner pages read in full. None states a review SLA or a contact assignment. Do '
      + 'not put a timeline in anything client-facing.' },
  { what: 'The application form\'s actual fields',
    why: 'The form is a third-party JavaScript iframe on eulerapp.com. The served HTML contains no '
      + 'labels or required-field markers, only a Submit button. The three published gates are the '
      + 'page\'s eligibility copy, not the form schema.' },
  { what: 'A rumored new "Certified" tier between Registered and Select',
    why: 'Asserted by secondary partner blogs, reportedly from a late-September partner email. '
      + 'Absent from the services-track page, from the live directory tier filter, and from the '
      + 'certification discount table. Treat as rumor until a portal login says otherwise.' },
  { what: 'Hayley Waikart\'s current title', why: 'See the people table. One undated, '
      + 'seven-month-old conference page carrying a function label.' },
  { what: 'The cost of Frontier Academy',
    why: 'Neither the program page nor the announcement names a price, a fee, or states that it is '
      + 'without charge. Partner Network membership is explicitly stated to cost nothing; the '
      + 'Academy makes no such statement either way. Do not infer.' },
  { what: 'Any published route to deliver Anthropic-branded workshops',
    why: 'Verified absent across ten pages. On the evidence it is invite-only, layered on top of '
      + 'an openly joinable network. The one page that would likely have answered it now 404s.' },
  { what: 'What a "licensed instructor" is',
    why: 'The Frontier Academy announcement says the intensive runs "with Anthropic engineers and '
      + 'licensed instructors". The term appears once, undefined, nowhere else.' },
  { what: 'Whether the 1 October 2026 tier review changed anything',
    why: 'The extra first-year review date is confirmed on two Anthropic pages. Its outcome is '
      + 'published nowhere.' },
];

/** Two Anthropic-published scale figures that do not sit comfortably together. */
const SCALE_TENSION = 'Anthropic published "more than 36,000 consultants have received '
  + 'certification across more than 1,300 organizations" on 23 July 2026, and "professionals '
  + 'across 46,000 firms have earned more than 175,000 Claude certifications" on 2 October 2026. '
  + 'Certifications are not people and firms are not organizations, so these may be different '
  + 'measures rather than a contradiction, but a jump from 1,300 to 46,000 in ten weeks is large '
  + 'enough that neither should be quoted externally without the date attached.';

/* ------------------------------------------------------------------ *
 * TRAINING COMPANY FIT
 * ------------------------------------------------------------------ */

const FIT = {
  noCategory: 'There is no training or education partner category, track or tier. The network has '
    + 'one services-oriented path, and the application names consulting, implementation and '
    + 'managed services as the qualifying activities. Training is not among them.',
  butCounts: 'Training is nonetheless first class INSIDE the network. The directory filters on '
    + '"Claude Training Sessions" as a service offered, "Training Package" as an engagement type, '
    + 'and "Education" as an industry.',
  bestSentence: 'because the ladder counts adoption and enablement work, firms that specialize in '
    + 'getting customers live on Claude can qualify early',
  bestSentenceSrc: SRC.track,
  decision: 'This is the decision the ticket reserves to Ali: present Colaberry as an '
    + 'implementation and enablement partner, which is what the application asks for and what the '
    + 'ladder rewards, or push on the missing training category, which no published route supports.',
};

module.exports = {
  ACCESS, ACCESS_ISO, daysSince, BASELINE, C, SRC, HEADLINE, SO_WHAT, TIERS, SELECT_RECHECK, CERTS,
  CHEAPEST_COUNTING, SELECT_BENCH_COST, CHANGES, PEOPLE, OURS, RESOLUTION, WATCHER,
  PLAN, PAM_NOTE, UNVERIFIED, SCALE_TENSION, FIT,
};
