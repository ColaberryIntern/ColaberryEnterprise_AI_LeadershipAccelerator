/**
 * C3.3 - the Anthropic target map. THE single source for the HTML, the CSV and both PDFs.
 *
 * ## The finding that reorders this ticket
 *
 * The ticket\'s premise is that "cold outreach to an AI lab mostly fails. The warm path is the
 * asset." Four candidate warm paths were checked and ALL FOUR ARE COLD: XPRIZE, MIT Solve,
 * Essnova and Refactored.ai have no public overlap with Anthropic\'s partnerships organization.
 *
 * Worse than cold in one case. XPRIZE\'s current frontier-AI tie-up is a Google program, so
 * leading with an XPRIZE affiliation in front of Anthropic is a counter-signal rather than an
 * asset. That inverts the ticket\'s own expectation and is the single most decision-relevant
 * thing here.
 *
 * ## What replaces the warm path
 *
 * Both reachable targets validate partners in the same currency: countable delivery evidence.
 * Certified headcount, production deployments, named customers, measured gains. Anthropic
 * publishes the exact thresholds. So the substitute for an introduction is to open by naming
 * where we stand against those three numbers, in the language they already use.
 *
 * ## Contact data
 *
 * No personal email address appears anywhere in this module, and `assertNoPersonalEmail()`
 * fails the build if one ever does. The two addresses that DO appear are organizational desks
 * published on Anthropic\'s own pages, which is the opposite of a guessed address.
 */

const ACCESS = '16 October 2026';

const CONF = {
  HIGH: { k: 'HIGH', color: '#2f7d32', note: 'Verbatim on an Anthropic-owned page' },
  MED: { k: 'MEDIUM', color: '#b26a00', note: 'Credible third party' },
  NONE: { k: 'NOT VERIFIED', color: '#b3261e', note: 'Could not confirm' },
};

/* ------------------------------------------------------------------ *
 * THE TARGETS
 * ------------------------------------------------------------------ */

const TARGETS = [
  {
    rank: 1,
    tier: 1,
    name: 'The partner support desk',
    who: 'Organizational, not a person',
    title: 'partner-support@anthropic.com, published by Anthropic',
    titleConf: CONF.HIGH,
    titleSrc: 'Anthropic Partner Academy certification FAQ',
    owns: 'Partner records, email domains on a partner record, and the thread Ali is already on.',
    why: 'This is the only channel where Colaberry already has standing. Ali wrote on 21 August '
      + 'and has had no reply for 56 days. A first approach to anyone else, while an unanswered '
      + 'question sits on this thread, looks like going around them.',
    route: 'Reply on the existing 21 August thread. Do not open a new one; the history is the '
      + 'asset.',
    warm: 'The open thread itself, which is the closest thing to warm that exists here.',
    opening: 'One closed question: what is Colaberry\'s current status in the partner record, '
      + 'Registered or not listed. Not "what are the requirements", which Fin answered at length '
      + 'in August without answering what was asked.',
    openingSrc: 'Ali\'s own 21 August message',
    openingConf: CONF.HIGH,
    risk: 'A desk staffed partly by an AI agent. The August reply came from "Fin", an Intercom '
      + 'agent. Expect a policy paragraph unless the question is closed and specific.',
  },
  {
    rank: 2,
    tier: 1,
    name: "Rich O\'Connell",
    who: 'Anthropic',
    title: 'Head of Alliances',
    titleConf: CONF.MED,
    titleSrc: 'Fractal partner release, 7 Jul 2026; corroborated on Anthropic\'s own Partner '
      + 'Summit page, which is undated and for a past event',
    owns: 'Services and systems-integrator partner designations. Named as the Anthropic voice on '
      + 'both the Bounteous and Fractal services-track announcements. Scope inferred from that '
      + 'pattern, not stated anywhere.',
    why: 'Closest fit of any individual. He owns the track Colaberry would sit in, and his own '
      + 'public language is almost a description of what we do.',
    route: 'Cold, after the desk question is answered or has clearly gone unanswered. Reference '
      + 'the services track specifically, not the company in general.',
    warm: 'None. No shared program, board member, event or co-announcement exists.',
    opening: 'His Bounteous line of 9 June 2026: Bounteous "brings a strong combination of '
      + 'engineering depth and enablement expertise that\'s critical for enterprise AI '
      + 'adoption... Together, we\'re helping organizations prepare and build new roles, new '
      + 'skills, and the AI systems that are integrated, scalable, and designed for long-term '
      + 'impact." That pairing, engineering depth AND enablement expertise, is the composite he '
      + 'says he selects for, and it is what to answer directly.',
    openingSrc: 'bounteous.com, 9 Jun 2026',
    openingConf: CONF.MED,
    risk: 'His title is 101 days stale at best and the only Anthropic-owned source is an undated '
      + 'page for a past event. Re-confirm before writing. Nothing newer than 7 July exists '
      + 'despite five search angles.',
  },
  {
    rank: 3,
    tier: 2,
    name: 'Steve Corfield',
    who: 'Anthropic',
    title: 'Global Head of Business Development and Partnerships',
    titleConf: CONF.HIGH,
    titleSrc: 'anthropic.com/news/claude-frontier-academy, published 2 Oct 2026',
    owns: 'The partner program as a whole. The quoted voice on the Partner Network launch, '
      + 'Frontier Academy and the certifications. Held two slots at the March Partner Summit, '
      + 'the strategy keynote and the closing.',
    why: 'The most public doctrine of anyone here, and the most quotable material. But he is the '
      + 'most senior person in the organization for this, and a cold note from an unadmitted '
      + 'applicant is the lowest-probability message in this map. Better as a second-step '
      + 'escalation than a first contact.',
    route: 'Tier 2. Sequence, or an escalation once there is something countable to report.',
    warm: 'None.',
    opening: 'His Frontier Academy quote of 2 October 2026, 14 days old: "The hard part is '
      + 'building that depth of talent... No AI company has invested in developing that talent '
      + 'inside its customers and partners at this depth." And in a trade interview: "that '
      + 'workforce barely exists today. And somebody has to build it." Answer the hard part he '
      + 'named, with evidence.',
    openingSrc: 'anthropic.com/news/claude-frontier-academy, 2 Oct 2026',
    openingConf: CONF.HIGH,
    risk: 'Do not lead with training volume. Anthropic published a Capgemini executive on that '
      + 'same page saying what clients want "is not about certification counts or training '
      + 'volume". Leading with seats trained argues against yourself on his own page.',
  },
  {
    rank: 4,
    tier: 2,
    name: 'Hayley Waikart',
    who: 'Anthropic',
    title: 'NOT VERIFIED',
    titleConf: CONF.NONE,
    titleSrc: 'Only an undated Anthropic page for a past event of 11-12 Mar 2026, carrying the '
      + 'function label "Partner Enablement" rather than a title',
    owns: 'Partner enablement, apparently. No session was attributed to them on the only page '
      + 'that names them, and no other openable source exists.',
    why: 'Functionally the closest to what Colaberry sells, which is exactly why getting it wrong '
      + 'would be expensive. Every other Anthropic speaker on that page carries a real title and '
      + 'this entry does not.',
    route: 'Hold. Do not approach until the title is confirmed from a current source.',
    warm: 'None.',
    opening: 'None available. No quote, post, talk or published statement of any kind was found.',
    openingSrc: 'Nothing found',
    openingConf: CONF.NONE,
    risk: 'Addressing someone by a title they may not hold, in a first message, at the exact '
      + 'organization we are trying to impress. The cost of being wrong is higher than the value '
      + 'of being early.',
  },
];

/* ------------------------------------------------------------------ *
 * WARM PATHS - all four checked, all four cold
 * ------------------------------------------------------------------ */

const WARM_PATHS = [
  { name: 'XPRIZE', verdict: 'COLD, AND A COUNTER-SIGNAL',
    detail: 'XPRIZE Rapid Reskilling concluded in January 2023 with no grand prize awarded; it '
      + 'was sponsored by New Profit with Jobs for the Future. A domain-scoped search of '
      + 'xprize.org returns no Anthropic content at all. And XPRIZE\'s current frontier-AI '
      + 'tie-up is a Google program, the Build with Gemini XPRIZE, whose finals ran in September '
      + '2026.',
    implication: 'Leading with the XPRIZE affiliation in front of Anthropic is at best neutral '
      + 'and plausibly counterproductive. This also puts a question against slide 6 of the C3.2 '
      + 'deck, flagged there as F5.' },
  { name: 'MIT Solve', verdict: 'COLD',
    detail: 'A domain-scoped search of solve.mit.edu finds no Anthropic partnership, sponsorship '
      + 'or challenge. The only Claude presence is two Solver teams whose products call Claude, '
      + 'which is vendor usage by grantees rather than an institutional relationship. Colaberry '
      + 'was invited to an MIT Solve Brain Trust event, but that was 7 March 2019.',
    implication: 'The MIT Solve awards remain strong credibility material. They are not a route '
      + 'to a person at Anthropic.' },
  { name: 'Essnova', verdict: 'COLD',
    detail: 'Nothing whatsoever. Essnova appears in no Anthropic-related public record: no '
      + 'co-announcement, shared program, event or directory listing.',
    implication: 'Also note Anthropic\'s federal channel is contested right now, with GSA '
      + 'having removed and then restored Anthropic after a court ruling. Do not route a first '
      + 'approach through a federal angle.' },
  { name: 'Refactored.ai and Colaberry', verdict: 'COLD',
    detail: 'No Anthropic or Claude Partner Network listing, announcement or mention. The only '
      + 'Claude-adjacent Colaberry material is published commentary about Anthropic models.',
    implication: 'That commentary is discoverable by the person being written to. Worth a glance '
      + 'before any outreach goes out.' },
];

/* ------------------------------------------------------------------ *
 * WHAT REPLACES A WARM PATH
 * ------------------------------------------------------------------ */

const SUBSTITUTE = {
  headline: 'Both reachable targets validate partners in one currency: countable delivery '
    + 'evidence.',
  evidence: [
    'O\'Connell on Fractal, 7 July 2026, praises "300+ Claude-certified practitioners already '
    + 'delivering production work" and a named deployment with a measured productivity figure. '
    + 'His praise is entirely numeric.',
    'Corfield describes the tier requirements as "a certain amount of certified individuals... '
    + 'How many customer deployments have you done? Have we got referenceable work?"',
    'Anthropic publishes the thresholds: Select needs 10 active certified individuals, 2 joint '
    + 'customers deployed in production in the trailing 12 months, and 1 public customer story.',
  ],
  conclusion: 'So the substitute for an introduction is to open by stating where Colaberry stands '
    + 'against those three numbers, honestly, including the zeros. That is the language both of '
    + 'them already use, and it is checkable, which is the point.',
  ourStanding: [
    { metric: 'Active certified individuals', target: 10, ours: 0,
      note: 'Exams are sold only to organizations already in the network, so this cannot be '
        + 'built before admission. The eleven Academy course completions do not count toward it.' },
    { metric: 'Joint customers deployed in production, trailing 12 months', target: 2, ours: 0,
      note: 'No joint Anthropic customer deployments exist.' },
    { metric: 'Public customer stories', target: 1, ours: 0,
      note: 'Thirteen published case studies exist, but none is a joint Anthropic customer story.' },
  ],
};

/* ------------------------------------------------------------------ *
 * THE GATE
 * ------------------------------------------------------------------ */

/**
 * No PERSONAL email address anywhere. The two organizational desks published by Anthropic are
 * allowed by name; anything shaped like an individual\'s address fails the build.
 *
 * "No guessed email addresses" is an acceptance criterion, so it is checked rather than promised.
 */
const PUBLISHED_DESKS = ['partner-support@anthropic.com', 'certifications-support@anthropic.com'];

function assertNoPersonalEmail(text) {
  const found = String(text).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  const bad = found.filter((a) => !PUBLISHED_DESKS.includes(a.toLowerCase()));
  if (bad.length) {
    throw new Error('email address(es) present that are not published organizational desks: '
      + [...new Set(bad)].join(', ') + '. C3.3 forbids guessed addresses.');
  }
  return { found: found.length, desks: PUBLISHED_DESKS.length };
}

/** Every target must carry a title source and an access date, or it does not ship. */
function assertSourced() {
  const bad = TARGETS.filter((t) => !t.titleSrc || !t.titleConf);
  if (bad.length) {
    throw new Error('targets missing a title source: ' + bad.map((t) => t.name).join(', '));
  }
  const t1 = TARGETS.filter((t) => t.tier === 1).length;
  const t2 = TARGETS.filter((t) => t.tier === 2).length;
  if (!t1 || !t2) throw new Error('the map must split tier 1 and tier 2 explicitly');
  return { tier1: t1, tier2: t2 };
}

module.exports = {
  ACCESS, CONF, TARGETS, WARM_PATHS, SUBSTITUTE, PUBLISHED_DESKS,
  assertNoPersonalEmail, assertSourced,
};
