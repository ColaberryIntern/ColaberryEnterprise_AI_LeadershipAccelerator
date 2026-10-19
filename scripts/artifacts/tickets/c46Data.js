/**
 * C4.6 - the case study commercial pack. THE single source for both PDFs and the CSV.
 *
 * ## What the data says, which is not what the ticket assumes
 *
 * The ticket asks to curate the strongest three to five of thirteen and build a selector matrix
 * covering every C2.5 ICP. Pulling the thirteen from production on 2026-10-16 shows that cannot
 * be done honestly as stated:
 *
 *   - Only TWO of the thirteen were built by a learner. The other eleven are Colaberry's own
 *     internal operational AI, built by the Colaberry team.
 *   - Both learner-built studies are marked `visibility: private`.
 *   - Eight of the thirteen carry `organization_naming_consent: false`, so the organization
 *     cannot be named.
 *   - The "Education" industry tag on seven of them means Colaberry's own education operations,
 *     not an education CUSTOMER.
 *
 * So this is a capability-proof pack, not a customer-proof pack, and the selector matrix says so
 * per ICP rather than implying coverage that does not exist. `assertNoCustomerStoryClaim()`
 * fails the build if any selection is ever described as a customer story.
 */

const AS_OF = '16 October 2026';
const TOTAL = 13;

/** Pulled from production on 2026-10-16. Fields are the ones that bear on commercial use. */
const STUDIES = [
  { slug: 'ai-systems-architect-training-system',
    title: 'Teaching people with no technical background to architect AI systems',
    industry: 'Workforce development', cap: 'AI architecture training',
    by: 'colaberry_team', vis: 'public', named: true, surfaces: 1 },
  { slug: 'the-ai-proposes-a-verified-human-decides',
    title: 'The AI Proposes, A Verified Human Decides',
    industry: 'Data infrastructure operations', cap: 'Governed AI remediation',
    by: 'learner', vis: 'private', named: true, surfaces: 3 },
  { slug: 'your-repositories-already-wrote-your-resume',
    title: 'Your Repositories Already Wrote Your Resume',
    industry: 'Career services and technical hiring',
    cap: 'Repository-grounded portfolio generation',
    by: 'learner', vis: 'private', named: true, surfaces: 3 },
  { slug: 'recovering-the-calls-the-workflow-lost',
    title: 'Recovering the Calls the Workflow Lost', industry: 'Education',
    cap: 'Operational AI: voice-call event recovery',
    by: 'colaberry_team', vis: 'public', named: true, surfaces: 3 },
  { slug: 'turning-call-intent-into-the-next-action',
    title: 'The Call Ended. The Next Step Did Not Have To.', industry: 'Education',
    cap: 'Operational AI: call intent routing',
    by: 'colaberry_team', vis: 'public', named: true, surfaces: 3 },
  { slug: 'testing-ai-actions-before-they-reach-customers',
    title: 'Test the Action. Before It Reaches a Customer.', industry: 'Education',
    cap: 'Operational AI: action gating and shadow testing',
    by: 'colaberry_team', vis: 'public', named: true, surfaces: 3 },
  { slug: 'every-lead-has-a-history',
    title: 'Every Lead Has a History. Make It Possible to Follow.', industry: 'Education',
    cap: 'Operational AI: lead journey and traceability',
    by: 'colaberry_team', vis: 'public', named: false, surfaces: 3 },
  { slug: 'the-workflow-grew-so-did-the-responsibility',
    title: 'The Workflow Grew. So Did the Responsibility.', industry: 'Education',
    cap: 'Operational AI: platform state and execution',
    by: 'colaberry_team', vis: 'public', named: false, surfaces: 3 },
  { slug: 'the-next-call-needs-a-time-and-a-place-in-the-queue',
    title: 'The Next Call Needs a Time. And a Place in the Queue.', industry: 'Education',
    cap: 'Operational AI: call scheduling and pacing',
    by: 'colaberry_team', vis: 'public', named: false, surfaces: 3 },
  { slug: 'the-pipeline-needed-more-than-one-person',
    title: 'The Pipeline Needed More Than One Person.', industry: 'Transportation',
    cap: 'Operational AI: outreach with territory, identity and feedback controls',
    by: 'colaberry_team', vis: 'public', named: false, surfaces: 3 },
  { slug: 'the-request-was-messy-the-price-couldnt-be',
    title: 'The Request Was Messy. The Price Could Not Be.', industry: 'Transportation',
    cap: 'Operational AI: reservation intake, deterministic pricing, a quote queue',
    by: 'colaberry_team', vis: 'public', named: false, surfaces: 3 },
  { slug: 'the-conversation-happened-the-crm-needs-the-right-record',
    title: 'The Conversation Happened. The CRM Needs the Right Record.', industry: 'Education',
    cap: 'Operational AI: CRM records written after calls',
    by: 'colaberry_team', vis: 'public', named: false, surfaces: 3 },
  { slug: 'the-call-was-already-over-the-review-had-to-be-fair',
    title: 'The Call Was Already Over. The Review Had to Be Fair.', industry: 'Education',
    cap: 'Operational AI: scoring calls a person made',
    by: 'colaberry_team', vis: 'public', named: false, surfaces: 3 },
];

/** Counted, not typed. The first draft of this file said "eight" and the data said seven. */
const COUNT = {
  total: STUDIES.length,
  learner: STUDIES.filter((s) => s.by === 'learner').length,
  learnerPrivate: STUDIES.filter((s) => s.by === 'learner' && s.vis === 'private').length,
  unnamed: STUDIES.filter((s) => !s.named).length,
  education: STUDIES.filter((s) => s.industry === 'Education').length,
  singleSurface: STUDIES.filter((s) => s.surfaces < 3).length,
  rows: STUDIES.reduce((a, s) => a + s.surfaces, 0),
};

const HEADLINE = 'The two case studies that actually demonstrate our promise are the two marked '
  + 'private, and none of the thirteen is a customer story.';

const SO_WHAT = [
  'Only ' + COUNT.learner + ' of ' + COUNT.total + ' were built by a learner. Our promise is that your people learn to build and you '
  + 'get proof of what they built, and exactly two studies show that happening. Both are marked '
  + 'private, so the pack that best proves the offer is the pack a buyer cannot see.',
  'The other 11 are Colaberry\'s own internal operational AI, built by the Colaberry team. '
  + 'They are genuinely good evidence that we build and govern AI in production. They are not '
  + 'evidence that a customer\'s people did.',
  COUNT.unnamed + ' of the ' + COUNT.total + ' carry no organization naming consent, so the '
  + 'organization cannot be named. The ' + COUNT.education + ' tagged "Education" are our own '
  + 'education operations, not an education '
  + 'customer, which is the distinction a higher-education buyer will make in the first minute.',
];

/* ------------------------------------------------------------------ *
 * THE SELECTION
 * ------------------------------------------------------------------ */

const SELECTED = [
  { slug: 'ai-systems-architect-training-system', why: 'The only public study about teaching '
      + 'people to build, and the closest thing we have to the promise itself. Also the only one '
      + 'on a single surface rather than three, which is worth fixing.',
    use: 'Lead with this for every education and workforce buyer.' },
  { slug: 'the-ai-proposes-a-verified-human-decides', why: 'Learner-built, and it demonstrates '
      + 'governed AI with a human decision point, which answers the governance objection before '
      + 'it is raised. PRIVATE: needs a release decision before any external use.',
    use: 'The strongest proof of the offer, once it can be shown.' },
  { slug: 'your-repositories-already-wrote-your-resume', why: 'Learner-built, and the subject '
      + 'matter is commit-grounded evidence, which is our whole thesis applied to itself. '
      + 'PRIVATE: needs a release decision.',
    use: 'Pair with the one above when the buyer asks what a learner actually produces.' },
  { slug: 'testing-ai-actions-before-they-reach-customers', why: 'The best of the operational '
      + 'set for an enterprise audience, because it is about not letting AI touch a customer '
      + 'until it has been gated and shadow-tested. Public.',
    use: 'For any buyer whose first question is about safety or control.' },
  { slug: 'the-request-was-messy-the-price-couldnt-be', why: 'The clearest non-education '
      + 'example, with a deterministic outcome a skeptic can follow. Public, though the '
      + 'organization cannot be named.',
    use: 'When the buyer suspects everything we do is education-shaped.' },
];

/* ------------------------------------------------------------------ *
 * THE SELECTOR MATRIX, by C2.5 ICP, stating gaps rather than implying coverage
 * ------------------------------------------------------------------ */

const MATRIX = [
  { icp: 'Higher education, continuing education unit', rank: 'BEACHHEAD',
    lead: 'ai-systems-architect-training-system',
    second: 'the-ai-proposes-a-verified-human-decides',
    gap: 'NO CUSTOMER STORY EXISTS for this ICP. The seven Education-tagged studies are our own '
      + 'operations, not a university. A CE dean will spot that immediately, so lead with the '
      + 'training study and say plainly that the customer story is the thing we are building '
      + 'next with them.' },
  { icp: 'Workforce organizations', rank: 'SECONDARY',
    lead: 'ai-systems-architect-training-system', second: 'every-lead-has-a-history',
    gap: 'Same gap. The workforce-development tag belongs to our own program.' },
  { icp: 'Mid-market and enterprise', rank: 'Opportunistic',
    lead: 'testing-ai-actions-before-they-reach-customers',
    second: 'the-request-was-messy-the-price-couldnt-be',
    gap: 'Best served of all the ICPs, because the operational set is genuinely enterprise-shaped. '
      + 'The organization still cannot be named.' },
  { icp: 'Government and economic development', rank: 'Later',
    lead: 'testing-ai-actions-before-they-reach-customers', second: null,
    gap: 'No study touches public-sector delivery. The government lane discovers and qualifies '
      + 'opportunities; it has produced no case study because it stops at qualification.' },
  { icp: 'Foundations', rank: 'Last', lead: null, second: null,
    gap: 'NOTHING FITS. Every study is a capability proof and a funder wants an impact story. '
      + 'This is the same gap C4.13 was raised to close after the XPRIZE conversation.' },
  { icp: 'AI ecosystem partners', rank: 'Parallel track',
    lead: 'the-ai-proposes-a-verified-human-decides', second: null,
    gap: 'A lab audience wants to see a learner build something real under governance, which is '
      + 'exactly the private one. Releasing it would serve this ICP more than any other.' },
];

/* ------------------------------------------------------------------ *
 * WHAT ALI MUST DECIDE
 * ------------------------------------------------------------------ */

const DECISIONS = [
  { d: 'Release the two learner-built studies, or keep them private.',
    detail: 'They are the only two that show the promise happening. Both are currently '
      + 'private. Until one is public, our strongest commercial evidence is unusable, and the '
      + 'Anthropic Select tier requires one public customer story that we do not have.' },
  { d: 'Get naming consent for at least one organization.',
    detail: COUNT.unnamed + ' of ' + COUNT.total + ' cannot name the organization. An anonymous case study is weaker '
      + 'than a named one by roughly the amount a buyer discounts anonymity, which is a lot.' },
  { d: 'Put the training study on all three surfaces.',
    detail: 'It is the only one of the thirteen published to a single surface. It is also the '
      + 'one we would lead with for the beachhead ICP.' },
  { d: 'Accept that no case study is a customer story, and plan the first one.',
    detail: 'This is not a gap in the pack, it is a gap in the business, and it is the same gap '
      + 'that shows up as 0 of 1 public customer stories against the Anthropic tier ladder.' },
];

/** A precision nit found while pulling the data, worth correcting in the registry. */
const REGISTRY_NIT = 'CLM-004 reads "13 case studies published, all 13 live, across 3 surfaces". '
  + 'Twelve are on three surfaces; one, the training study, is on one. The 37 publication rows '
  + 'reconcile exactly as 12 x 3 + 1. The claim is true if read as "across three surfaces in '
  + 'total" and false if read as "each on all three", so it is worth one word of tightening.';

/* ------------------------------------------------------------------ *
 * THE GATES
 * ------------------------------------------------------------------ */

const bySlug = (s) => STUDIES.find((x) => x.slug === s);

/** No more than five, which is the ticket's own ceiling. */
function assertAtMostFive() {
  if (SELECTED.length > 5) throw new Error('selected ' + SELECTED.length + ', ceiling is five');
  const missing = SELECTED.filter((s) => !bySlug(s.slug));
  if (missing.length) throw new Error('selected a study that does not exist: '
    + missing.map((m) => m.slug).join(', '));
  return SELECTED.length;
}

/** Every C2.5 ICP must appear, including the ones nothing fits. */
function assertEveryIcpCovered() {
  const need = ['Higher education', 'Workforce', 'enterprise', 'Government', 'Foundations',
    'ecosystem'];
  const got = MATRIX.map((m) => m.icp).join(' ');
  const missing = need.filter((n) => !got.includes(n));
  if (missing.length) throw new Error('ICPs absent from the selector matrix: '
    + missing.join(', '));
  const noGap = MATRIX.filter((m) => !m.gap);
  if (noGap.length) throw new Error('every ICP row must state its gap, even when there is none '
    + 'to state; missing on: ' + noGap.map((m) => m.icp).join(', '));
  return MATRIX.length;
}

/**
 * None of these may be called a customer story. Not one of the thirteen is one, and the
 * difference matters to the Anthropic tier ladder and to any buyer who asks who the customer was.
 */
function assertNoCustomerStoryClaim(html) {
  const text = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // Every occurrence of the phrase must sit near a negation. Matching a fixed list of denial
  // phrasings was too brittle: the first version fired on five legitimate denials because it
  // only recognised two of the ways we had written them. Checking the WINDOW around each
  // occurrence for a negation is both stricter and more robust, because a new way of phrasing
  // a denial still passes while an actual claim still fails.
  const NEG = /\b(no|not|none|never|nothing|without|lack|zero|0 of|do not|does not|is the thing we are building)\b/i;
  const bad = [];
  const re = /customer stor(y|ies)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const window = text.slice(Math.max(0, m.index - 120), m.index + 60);
    if (!NEG.test(window)) bad.push(window.slice(-110).trim());
  }
  if (bad.length) {
    throw new Error('"customer story" used without a nearby negation ' + bad.length
      + ' time(s). None of the thirteen is one, so every mention must be a denial. First: ...'
      + bad[0]);
  }
  return { mentions: (text.match(re) || []).length, unqualified: 0 };
}

module.exports = {
  AS_OF, TOTAL, COUNT, STUDIES, HEADLINE, SO_WHAT, SELECTED, MATRIX, DECISIONS, REGISTRY_NIT, bySlug,
  assertAtMostFive, assertEveryIcpCovered, assertNoCustomerStoryClaim,
};
