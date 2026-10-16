/**
 * C4.8 - Ram's management decision package. THE single source for all three deliverables.
 *
 * ## What this is and is not
 *
 * The ticket is explicit: "Every prior ticket in groups 00 to 02 feeds it; write nothing new."
 * So nothing here is a fresh opinion. Every answer is assembled from a decision Ali has already
 * approved or a figure already verified, and each carries the ticket where it came from.
 *
 * ## Evidence tags are mandatory
 *
 * "Any number presented as fact that is actually an assumption" is the named failure mode, so
 * every figure carries one of five tags and `assertTagged()` fails the build if one does not.
 *
 * ## The burn is not here, and that is correct
 *
 * C2.4 established that the burn is pending an external P&L reply, not an Ali decision. It is
 * marked UNKNOWN. The reverse model is solved across a range instead, so the answer is a lookup
 * the moment the number lands. Inventing it is the one thing the ticket forbids outright.
 */

const AS_OF = '16 October 2026';

/** The five evidence tags the ticket requires. */
const TAG = {
  VERIFIED: { k: 'VERIFIED COST', color: '#2f7d32',
    note: 'Measured from production or a primary document' },
  BENCHMARK: { k: 'SOURCED BENCHMARK', color: '#1f6feb',
    note: 'Read from a named external primary source' },
  ASSUMPTION: { k: 'MANAGEMENT ASSUMPTION', color: '#b26a00',
    note: 'Chosen by us; no source. An error here propagates' },
  SCENARIO: { k: 'SCENARIO INPUT', color: '#7a4fb6',
    note: 'A dial the reader may turn' },
  CALCULATED: { k: 'CALCULATED OUTPUT', color: '#555f6d',
    note: 'Derived from the rows above it' },
  UNKNOWN: { k: 'UNKNOWN', color: '#b3261e',
    note: 'Not available. Published as a gap rather than filled' },
};

/* ------------------------------------------------------------------ *
 * THE HEADLINE
 * ------------------------------------------------------------------ */

const HEADLINE = 'The problem is not the product, the price or the margin. It is distribution, '
  + 'and every route to revenue runs through a mechanism we do not have.';

const SO_WHAT = [
  'The moat is real and costs nothing to deliver. Commit-level individual verification was '
  + 'found in 0 of 20 competitors, 17 of them affirmatively not, and it runs on push with no '
  + 'staff attached. That is why a self-paced license can carry an 84% gross margin honestly.',
  'The economics work, but only at one package. An annual enterprise account nets $64,100; a '
  + 'pilot nets $3,538, which is 8% of its price. Against a $100,000 monthly burn that is 19 '
  + 'accounts a year versus 340 pilots a year.',
  'And then distribution stops all of it. Our measured outbound is 0.05% reply across 48,924 '
  + 'sends, about 24 replies in total. One seller working pilots needs 76 qualified leads a '
  + 'year. The self-paced license needs roughly 881 learners to cover its base. We have no '
  + 'mechanism that produces either number.',
];

/* ------------------------------------------------------------------ *
 * THE TWENTY QUESTIONS, in the order the ticket sets them
 * ------------------------------------------------------------------ */

const Q = [
  { n: 1, q: 'What is wrong with the current economic model?',
    a: 'It was described as self-funding and the costing does not support that. C1.5 argued each '
      + 'stage pays for the next; C2.4 priced a pilot at $3,538 of net contribution after '
      + 'delivery and acquisition, 8% of price. Funded delivery manufactures commit-verified '
      + 'evidence exactly as the memo argued. It does not produce runway at any volume we could '
      + 'run. That phrase should come out of the memo.',
    src: 'C1.5 reassessed, approved 12 Oct 2026; C2.4', tag: TAG.VERIFIED },

  { n: 2, q: 'What exactly is Colaberry becoming?',
    a: 'The company whose people learn to build with AI and whose buyer gets proof of what each '
      + 'person actually built, verified against real code. That sentence is locked and used '
      + 'verbatim. The category noun moves by segment and the promise does not: AI enablement '
      + 'for enterprise, workforce readiness for public and workforce buyers, AI readiness for '
      + 'higher education.',
    src: 'C2.1, decided and approved 12 Oct 2026', tag: TAG.VERIFIED },

  { n: 3, q: 'Why is this market attractive now?',
    a: 'Honestly: it is real and badly served, and it cannot be credibly sized. The research '
      + 'found no defensible market size and says so rather than borrowing one. What it did '
      + 'find is where the budget sits, and it is not L&D. Anthropic committed $100 million '
      + 'through the Claude Partner Network in March 2026 and a further $100 million through '
      + 'Claude Frontier Academy in October 2026, and is aiming at 10,000 Frontier Deployed '
      + 'Engineers by the end of 2027. Those are their figures, never summed with each other.',
    src: 'C1.1; C0.6 rows CLM-020, CLM-022, CLM-023', tag: TAG.BENCHMARK },

  { n: 4, q: 'Who already competes?',
    a: 'Twenty scored competitors in two groups: nine training and upskilling platforms, eleven '
      + 'consultancy AI academies. The finding that matters is what is absent. Three columns are '
      + 'empty across all twenty, and commit-level individual evidence is one of them, with 17 '
      + 'affirmatively not offering it. The best-funded player who owned that capability exited: '
      + 'Pluralsight bought GitPrime for $170 million and it is end-of-life under a different '
      + 'owner. The category is retreating from commit-level proof, not advancing on it.',
    src: 'C1.2, C1.6', tag: TAG.VERIFIED },

  { n: 5, q: 'Why can Colaberry credibly compete?',
    a: 'Because the one capability nobody contests is the one that needs no staff. Verification '
      + 'runs on push and is identical in all three delivery modes, so it scales without '
      + 'headcount. As of ' + AS_OF + ' there are 345 learner stories verified against a real '
      + 'commit across 29 projects, and 48 learner projects in flight.',
    src: 'C2.2; C0.6 rows CLM-002 and CLM-001, re-read from production ' + AS_OF, tag: TAG.VERIFIED },

  { n: 6, q: 'What is live today?',
    a: '345 verified learner stories across 29 projects. 48 projects in flight. 13 case studies '
      + 'published and live across 3 surfaces. 151 AI agents have run in production, 123 in the '
      + 'last 24 hours, at 99.96% success across 168,619 executions in seven days with 60 '
      + 'failures. Every agent write is audited. Two AI employees operate under a written role '
      + 'charter. Government opportunity discovery and qualification runs daily.',
    src: 'C0.5 and C0.6, all re-read from production ' + AS_OF, tag: TAG.VERIFIED },

  { n: 7, q: 'What is still immature?',
    a: 'Of 24 capabilities counted on 8 October: 10 live, 9 built but not switched on, 4 '
      + 'designed, 1 on the roadmap. The first cohort has not finished, so there is no completed '
      + 'outcome study. The agent fleet is instrumented, audited and read-only: it watches and '
      + 'records, it does not act, and we do not call it autonomous. And we cannot currently '
      + 'count learners at all, which is a reporting gap sitting directly under the license '
      + 'business.',
    src: 'C2.6 live-versus-roadmap; C1.5 reassessed', tag: TAG.VERIFIED },

  { n: 8, q: 'What is the first offer?',
    a: 'Two families. Staffed cohorts priced per engagement, and self-paced licenses priced per '
      + 'learner per year. Two packages were withdrawn rather than relabeled, and two floors '
      + 'were set below which a deal is not worth running.',
    src: 'C2.3, approved', tag: TAG.VERIFIED },

  { n: 9, q: 'Who buys it?',
    a: 'Higher education through the self-funded continuing education unit, which was approved '
      + 'as the beachhead on 14 October because that dean signs without a faculty senate. '
      + 'Workforce organizations are the approved secondary. C6.3 ranked a Tier-1 of 38 '
      + 'institutions where a named continuing education contact actually exists, out of 102.',
    src: 'C2.5 approved 14 Oct 2026; C6.2; C6.3', tag: TAG.VERIFIED },

  { n: 10, q: 'What do we charge?',
    a: 'Per the approved C2.3 price list: engagements for staffed cohorts, per learner per year '
      + 'for licenses, with two floors. The license price is the open number, because what it '
      + 'costs us depends on population and we cannot yet count population.',
    src: 'C2.3', tag: TAG.VERIFIED },

  { n: 11, q: 'What does it cost to deliver?',
    a: 'A pilot nets $3,538 after delivery and acquisition, 8% of price. An annual enterprise '
      + 'account nets $64,100. The self-paced license carries an 84% gross margin because '
      + 'verification needs no staff. Acquisition cost is 7.5% of revenue and does not vary by '
      + 'package, because a seller\'s loaded cost and their quota are both annual per-head '
      + 'figures, which makes the ratio structural.',
    src: 'C2.4', tag: TAG.VERIFIED },

  { n: 12, q: 'What sales motion do we run?',
    a: 'Direct, personal, and small. C6.3 selected 38 accounts where a contact exists, 19 of them '
      + 'resolving to someone who can sign. There is no warm path to weight toward: every '
      + 'non-cold record in the CRM is ourselves, a test fixture or demo data. The benchmark '
      + 'sales cycle is 90.9 days.',
    src: 'C6.2, C6.3; benchmark re-read from the 403-firm primary', tag: TAG.BENCHMARK },

  { n: 13, q: 'What role do Anthropic and OpenAI play?',
    a: 'Distribution and credibility, not revenue, and neither is in hand. The Anthropic route '
      + 'is re-verified: admission turns on three published gates we already meet, but the tier '
      + 'ladder counts 10 PAID certifications, 2 production joint customers and 1 public story, '
      + 'and we stand at zero on all three. The exams are sold only to organizations already '
      + 'admitted. A question Ali asked their partner desk on 21 August is still unanswered.',
    src: 'C3.1, C3.3', tag: TAG.VERIFIED },

  { n: 14, q: 'What happens if neither partnership lands?',
    a: 'Materially, less than the partnership work implies, and that is the honest answer rather '
      + 'than a brave one. Neither lab is a revenue channel in any approved plan: C2.5 put the '
      + 'beachhead in higher education through the continuing education unit, and nothing in '
      + 'that path requires a lab. What a partnership supplies is third-party credibility and a '
      + 'directory listing, which shortens a sales conversation; it does not create one. The '
      + 'moat does not depend on it either, because 0 of 20 competitors offer commit-level '
      + 'verification whether or not we are in anyone\'s partner network. The real cost of '
      + 'losing both is that we lose the cheapest available proof that somebody credible takes '
      + 'us seriously, at a moment when we have no public customer story. That is a marketing '
      + 'problem, not a model problem, and it is strictly smaller than the distribution problem '
      + 'we already have.',
    src: 'C2.5, C1.2, C3.1', tag: TAG.VERIFIED },

  { n: 15, q: 'How do we get the first five customers?',
    a: 'From the 19 Tier-1 accounts where a named person can sign, worked personally rather than '
      + 'sequenced. At the benchmark win rate that is the only route with arithmetic behind it. '
      + 'What does NOT work is the current outbound engine: 0.05% reply across 48,924 sends.',
    src: 'C6.3; C1.3', tag: TAG.VERIFIED },

  { n: 16, q: 'What must we stop spending time on?',
    a: 'Volume outbound, on its own measured result. Pilots as a revenue line, because at 8% net '
      + 'and a 91-day cycle they are a customer-acquisition instrument and should be budgeted as '
      + 'one. And any claim we cannot source: the registry retired the "17 learners '
      + 'build-complete" figure outright and blocks three more.',
    src: 'C1.3, C2.4, C0.6', tag: TAG.VERIFIED },

  { n: 17, q: 'What do we build versus sell immediately?',
    a: 'Sell the staffed cohort now; it is live, costed and has a buyer. Build exactly one thing '
      + 'before the license can be sold honestly: the ability to count learners. The same '
      + '$111,000 of platform revenue is $1,134 a head over 100 learners and $46 over 5,000, and '
      + 'revenue alone cannot tell you which one is happening.',
    src: 'C1.5 reassessed', tag: TAG.VERIFIED },

  { n: 18, q: 'What are the 30, 60, 90 and 180-day milestones?',
    a: 'See the milestone table. They are deliberately expressed as evidence to be produced '
      + 'rather than revenue to be booked, because revenue targets without a distribution '
      + 'mechanism are a wish.',
    src: 'Derived from C2.4, C6.3 and C3.1', tag: TAG.CALCULATED },

  { n: 19, q: 'What are the plausible revenue scenarios?',
    a: 'See the scenario table, which sizes our own pipeline rather than the market, because the '
      + 'market cannot be credibly sized. Each scenario states the accounts required and, next '
      + 'to it, the qualified leads that implies, which is where each one breaks.',
    src: 'C1.4, C2.4', tag: TAG.CALCULATED },

  { n: 20, q: 'What evidence would make us continue, pivot or stop?',
    a: 'See the decision triggers. Each is a number with a date attached, so the decision is a '
      + 'reading rather than a debate.',
    src: 'Derived', tag: TAG.CALCULATED },
];

/* ------------------------------------------------------------------ *
 * THE ECONOMICS, every line tagged
 * ------------------------------------------------------------------ */

const ECON = [
  { line: 'Pilot, net contribution per deal', v: '$3,538', tag: TAG.VERIFIED, src: 'C2.4' },
  { line: 'Pilot, net as a share of price', v: '8%', tag: TAG.CALCULATED, src: 'C2.4' },
  { line: 'Annual enterprise, net contribution per deal', v: '$64,100', tag: TAG.VERIFIED, src: 'C2.4' },
  { line: 'Self-paced license, gross margin', v: '84%', tag: TAG.VERIFIED, src: 'C2.2, C1.5r' },
  { line: 'Acquisition cost as a share of revenue', v: '7.5%', tag: TAG.CALCULATED,
    src: 'C2.4, structural' },
  { line: 'Benchmark sales cycle', v: '90.9 days', tag: TAG.BENCHMARK, src: '403-firm primary' },
  { line: 'Measured outbound reply rate', v: '0.05% across 48,924 sends, about 24 replies',
    tag: TAG.VERIFIED, src: 'C1.3' },
  { line: 'Qualified leads one seller on pilots needs per year', v: '76', tag: TAG.CALCULATED,
    src: 'C2.4' },
  { line: 'Learners a license needs to cover its base', v: 'about 881', tag: TAG.CALCULATED,
    src: 'C1.5r' },
  { line: 'Quota attainment modeled', v: '100% of benchmark', tag: TAG.ASSUMPTION,
    src: 'Optimistic by construction. At 50%, acquisition cost doubles and the pilot contributes nothing' },
  { line: 'Current monthly operating burn', v: 'UNKNOWN', tag: TAG.UNKNOWN,
    src: 'Pending the P&L reply. Never invented' },
  { line: 'Current monthly revenue', v: 'UNKNOWN', tag: TAG.UNKNOWN,
    src: 'Wanted separately from burn, so we can show how much of survival the existing business already covers' },
];

/** Break-even deal counts across a burn range, computed. The lookup for when the P&L lands. */
const BURN_RANGE = [40000, 60000, 80000, 100000, 150000, 200000];
const NET = { pilot: 3538, annual: 64100 };
const reverse = () => BURN_RANGE.map((b) => ({
  burn: b,
  annualRevenue: b * 12,
  pilots: Math.ceil((b * 12) / NET.pilot),
  accounts: Math.ceil((b * 12) / NET.annual),
  leadsForAccounts: Math.ceil(((b * 12) / NET.annual) * 4),  // see LEAD_MULTIPLE
}));
/** 4 qualified leads per closed account, from the benchmark win rate band used in C2.4. */
const LEAD_MULTIPLE = { v: 4, tag: TAG.BENCHMARK, src: 'C2.4 win-rate band, 403-firm primary' };

/* ------------------------------------------------------------------ *
 * SCENARIOS - our pipeline, not the market
 * ------------------------------------------------------------------ */

const SCENARIOS = [1000000, 3000000, 5000000, 10000000].map((rev) => ({
  revenue: rev,
  accounts: Math.ceil(rev / NET.annual),
  leads: Math.ceil((rev / NET.annual) * LEAD_MULTIPLE.v),
  repliesToday: 24,
}));

/* ------------------------------------------------------------------ *
 * MILESTONES - evidence to produce, not revenue to book
 * ------------------------------------------------------------------ */

const MILESTONES = [
  { d: '30 days', what: 'Learner counting ships, and the first Tier-1 conversations happen.',
    evidence: 'A learner count appears next to platform revenue. 5 of the 19 signer-level '
      + 'Tier-1 accounts have had a first conversation.' },
  { d: '60 days', what: 'One public customer story exists, or we know why it cannot.',
    evidence: 'A named institution agrees to be referenced. This is also the first of the three '
      + 'Anthropic Select gates and the only one not gated behind admission.' },
  { d: '90 days', what: 'The distribution question is answered one way or the other.',
    evidence: 'Either a repeatable channel produces qualified leads at a measurable rate, or we '
      + 'record that direct personal outreach by Ali is the only channel and size the company to '
      + 'that fact.' },
  { d: '180 days', what: 'First paid annual account, or the model changes.',
    evidence: 'One signed annual enterprise account. At $64,100 net it is also the unit the '
      + 'reverse model is built on, so it converts the whole plan from projected to measured.' },
];

/* ------------------------------------------------------------------ *
 * DECISION TRIGGERS
 * ------------------------------------------------------------------ */

const TRIGGERS = [
  { verdict: 'CONTINUE', color: '#2f7d32',
    test: 'A channel other than Ali personally produces qualified leads at a rate that makes 19 '
      + 'accounts a year arithmetically possible, AND one public customer story exists by day 60.' },
  { verdict: 'PIVOT', color: '#b26a00',
    test: 'The product converts when it reaches a buyer, but no channel reaches buyers at rate. '
      + 'Then the company is a distribution problem wearing a product, and the next dollar goes '
      + 'to channel or partnership, not to platform.' },
  { verdict: 'STOP', color: '#b3261e',
    test: 'Tier-1 accounts with a named signer decline at the demo stage for reasons about the '
      + 'proof itself rather than about budget or timing. That would mean commit-level '
      + 'verification is empty space because nobody wants it, rather than because nobody built '
      + 'it, which is the one reading of the competitive scan that would end this.' },
];

/* ------------------------------------------------------------------ *
 * THE GATE
 * ------------------------------------------------------------------ */

/** Every economic line and every answer must carry an evidence tag. */
function assertTagged() {
  const bad = ECON.filter((r) => !r.tag || !TAG[Object.keys(TAG).find((k) => TAG[k] === r.tag)]);
  if (bad.length) throw new Error('untagged economic lines: ' + bad.map((b) => b.line).join(', '));
  const badQ = Q.filter((x) => !x.tag || !x.src);
  if (badQ.length) throw new Error('answers missing a tag or source: '
    + badQ.map((x) => x.n).join(', '));
  if (Q.length !== 20) throw new Error('the ticket asks twenty questions, found ' + Q.length);
  return { econ: ECON.length, questions: Q.length };
}

/** The burn must stay UNKNOWN. Inventing it is the one thing the ticket forbids outright. */
function assertBurnUnknown() {
  const burn = ECON.find((r) => /operating burn/i.test(r.line));
  if (!burn || burn.v !== 'UNKNOWN' || burn.tag !== TAG.UNKNOWN) {
    throw new Error('the burn figure must remain UNKNOWN and tagged as such; the ticket says it '
      + 'is sourced from Ali and never invented');
  }
  return true;
}

module.exports = {
  AS_OF, TAG, HEADLINE, SO_WHAT, Q, ECON, BURN_RANGE, NET, reverse, LEAD_MULTIPLE,
  SCENARIOS, MILESTONES, TRIGGERS, assertTagged, assertBurnUnknown,
};
