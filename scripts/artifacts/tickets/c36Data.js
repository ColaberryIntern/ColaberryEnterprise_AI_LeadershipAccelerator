/**
 * C3.6 - the OpenAI target map. THE single source for both PDFs.
 *
 * ## What this ticket was asked to test, and what happened
 *
 * The hypothesis was that Leah Belsky sitting on a CSU board is a warm-intro surface. That is
 * CONFIRMED and it is stronger than the ticket stated: she is a seated member with her own bio
 * page on CSU's own site, not a conference speaker.
 *
 * But the useful finding is one nobody asked for. OpenAI announced a partnership with America's
 * SBDC on 30 September 2026, SIXTEEN DAYS before this brief, and it runs through the Community
 * Trainer Program - the same program C3.4 correctly reported as having no public application
 * mechanism. CSUSB, which C6.3 ranks as our single best account, hosts an SBDC.
 *
 * ## This amends a recommendation I published four hours ago
 *
 * C3.4 said to sequence OpenAI behind Anthropic because no door exists. The partner-network half
 * of that still holds. The Community Trainer half does not: a door opened, it is time-boxed
 * because first-wave states are unpublished, and it runs through a campus unit rather than a
 * lab. AMENDMENTS records that rather than quietly restating the conclusion.
 */

const ACCESS = '16 October 2026';

const C = {
  HIGH: { k: 'HIGH', color: '#2f7d32' },
  MED: { k: 'MEDIUM', color: '#b26a00' },
  NONE: { k: 'NOT VERIFIED', color: '#b3261e' },
};

const HEADLINE = 'The warm path is real but it is not an introduction, and a better door opened '
  + 'sixteen days ago through the SBDC, at the campus we had already ranked first.';

const SO_WHAT = [
  'The board is confirmed and Belsky is genuinely seated on it, with a bio page on CSU\'s own '
  + 'site. But we have no relationship to any of its 29 members, so it tells us where someone '
  + 'sits; it is not an introduction, and a cold note opening with "I see you are on a CSU '
  + 'board" is the weakest possible use of it.',
  'The part of the hypothesis that assumed CSUSB was a way onto that board is refuted. The four '
  + 'campus seats are San Diego State, Northridge, San Jose State and Channel Islands. CSUSB '
  + 'consumes the systemwide deal; it does not shape it.',
  'The actual opening is the America\'s SBDC partnership of 30 September 2026, which runs '
  + 'through the Community Trainer Program and needs exactly what we sell: people who can train '
  + 'advisors and run hands-on workshops. First-wave states are unpublished, which is the only '
  + 'reason this is urgent.',
];

/* ------------------------------------------------------------------ *
 * THE HYPOTHESIS, TESTED LINK BY LINK
 * ------------------------------------------------------------------ */

const LINKS = [
  { link: 'A CSU board of this kind exists', verdict: 'CONFIRMED', color: '#2f7d32',
    conf: C.HIGH,
    detail: 'Exact name is the CSU AI Workforce Acceleration Board, not "GenAI". Announced 4 '
      + 'February 2025, charter published, roster still being edited in May 2026, and the board '
      + 'presented its own session at EDUCAUSE in October 2025. A live body, not a '
      + 'press-release artifact.',
    src: 'genai.calstate.edu/about/workforce-acceleration-board; calstate.edu release 4 Feb 2025' },

  { link: 'Leah Belsky is a member', verdict: 'CONFIRMED, and it is the strong form',
    color: '#2f7d32', conf: C.HIGH,
    detail: 'Listed first on the roster as "VP and General Manager, Education, OpenAI", with her '
      + 'own member bio page on CSU\'s site, and quoted in the founding release under "Board '
      + 'Member Statements". A seated member, not a speaker. Her pronouns, she/her, are published '
      + 'on the CSU page itself.',
    src: 'genai.calstate.edu/about/workforce-acceleration-board/leah-belsky' },

  { link: 'CSUSB is a way onto that board', verdict: 'REFUTED', color: '#b3261e', conf: C.HIGH,
    detail: 'CSUSB holds no seat. The four campus seats are San Diego State, CSU Northridge, San '
      + 'Jose State and CSU Channel Islands. CSUSB also appears in no OpenAI announcement. It is '
      + 'inside the systemwide deployment as a consumer.',
    src: 'Full 29-member roster transcribed from the CSU page' },

  { link: 'No independent training provider holds a seat', verdict: 'CONFIRMED, and it is the '
      + 'white space', color: '#2f7d32', conf: C.HIGH,
    detail: 'Of 29 members, OpenAI is the only frontier AI lab. Google, Microsoft, AWS, IBM, '
      + 'Intel and Nvidia sit as platform, cloud and silicon vendors. Instructure is an LMS, '
      + 'Soundings a talent marketplace, SVLG a business association. No management consultancy '
      + 'and no independent training or credentialing provider. The board also demonstrably adds '
      + 'and drops members: Adobe was a founding member in February 2025 and is off the current '
      + 'roster.',
    src: 'Same roster' },
];

/* ------------------------------------------------------------------ *
 * THE OPENING NOBODY ASKED ABOUT
 * ------------------------------------------------------------------ */

const SBDC = {
  what: 'OpenAI announced a partnership with America\'s SBDC on 30 September 2026, sixteen '
    + 'days before this brief, and it runs THROUGH the OpenAI Academy Community Trainer Program.',
  verbatim: 'In this initial phase, through OpenAI Academy\'s Community Trainer Program, we '
    + 'plan to train around 150 Small Business Development Center advisors and bring hands-on '
    + 'workshops to SBDC networks across the country, with the goal of reaching at least 1,000 '
    + 'small businesses through in-person training and many more through one-on-one advising and '
    + 'resources we develop together.',
  src: 'openai.com/index/helping-small-businesses-put-ai-to-work/, dated 30 September 2026',
  why: [
    'It is the program C3.4 proved has no public application mechanism. This is how organizations '
    + 'actually get into it: through a national body that already has the relationship.',
    'It needs precisely what we sell. Advisor training and three-hour hands-on workshops, with '
    + '"at least one at each participating network".',
    'Co-developed guides are planned on marketing, operations, manufacturing, exporting and '
    + 'GOVERNMENT CONTRACTING, which sits directly beside our existing gov-bids work.',
    'CSUSB hosts the Inland Empire SBDC through its Randall W. Lewis Center for Entrepreneurship, '
    + 'with service locations in Riverside, Ontario and Temecula and more than ten outreach '
    + 'centers. C6.3 already ranks CSUSB as our single best account.',
    'First-wave states are NOT published. That is the only reason this is time-sensitive, and it '
    + 'is also the one thing we cannot find out without asking.',
  ],
  caution: 'America\'s SBDC already runs its own "AI U" certification that has trained more '
    + 'than 500 advisors, and previously ran an AI Ready Challenge with Google. We would be '
    + 'adding capacity to a program that already has a credential, not introducing one.',
};

/* ------------------------------------------------------------------ *
 * TARGETS
 * ------------------------------------------------------------------ */

const TARGETS = [
  { rank: 1, tier: 1, name: 'Inland Empire SBDC at CSUSB',
    who: 'Hosted by the Randall W. Lewis Center for Entrepreneurship',
    role: 'Program Director and the consulting team, named publicly on the center\'s site',
    conf: C.HIGH,
    why: 'The lowest-gatekeeper route into an OpenAI program that exists anywhere in either '
      + 'partnership track, and it runs through the campus C6.3 already ranks first. It is a '
      + 'campus unit rather than a lab, so the conversation is peer to peer.',
    ask: 'Offer Colaberry as delivery capacity for the advisor-training and workshop pathway, '
      + 'referencing the 30 September announcement, before first-wave states are locked.',
    warm: 'Institutional rather than personal. We hold no relationship here, but the opening is '
      + 'a published program with an unfilled delivery need.' },

  { rank: 2, tier: 1, name: 'CSUSB College of Extended and Global Education',
    who: 'And the separate CSUSB Career Training catalog',
    role: 'The continuing education unit; a dean-level signer per C2.5',
    conf: C.HIGH,
    why: 'Worth approaching whether or not OpenAI ever opens. This is exactly the C2.5 beachhead: '
      + 'higher education through the self-funded continuing education unit. CSUSB Career '
      + 'Training already sells AI courses, including one on ChatGPT and Copilot, so the buyer '
      + 'has already decided the category is real.',
    ask: 'A continuing education conversation on commit-verified AI training, independent of any '
      + 'partnership.',
    warm: 'None, but C6.3 names an Assistant Dean of Professional and Continuing Education here, '
      + 'which is the signer level.' },

  { rank: 3, tier: 2, name: "America\'s SBDC, national",
    who: 'The national body, Warrenton VA',
    role: 'President and CEO, named in the partnership release',
    conf: C.HIGH,
    why: 'Owns first-wave selection. The right escalation if the Inland Empire route stalls, and '
      + 'the only party who can answer whether California is in the first wave.',
    ask: 'Which networks are in the first wave, and whether delivery capacity is needed.',
    warm: 'None.' },

  { rank: 4, tier: 2, name: "CSU Chancellor\'s Office, AI Commons team",
    who: 'The CIO and the AVC for Academic Technology Services',
    role: 'The board\'s staff leads, who present on it publicly',
    conf: C.HIGH,
    why: 'The realistic approach surface for anything board-related, and far better than '
      + 'approaching a board member cold. They own the systemwide AI program that CSUSB sits '
      + 'inside.',
    ask: 'A workforce-credentialing conversation. Lead with student outcomes, never with AI '
      + 'adoption, for the reason in RISKS.',
    warm: 'None. Approach only once there is delivery evidence to point at.' },

  { rank: 5, tier: 3, name: 'Leah Belsky', who: 'OpenAI',
    role: 'VP and General Manager, Education', conf: C.HIGH,
    why: 'Seated on the board, the single AI-lab voice in that room, and the most senior person '
      + 'relevant to us. But we have no relationship, and a cold note whose hook is "I noticed '
      + 'you sit on a CSU board" is the weakest possible use of this finding and will read as '
      + 'exactly that.',
    ask: 'Nothing yet. Do not build a plan that depends on reaching her.',
    warm: 'The board seat is context, not a path.' },

  { rank: 6, tier: 3, name: 'Chris Lehane', who: 'OpenAI',
    role: 'Chief Global Affairs Officer', conf: C.HIGH,
    why: 'His organization owns the partnership side, and he is the named OpenAI voice on the '
      + 'SBDC release. Relevant only if the SBDC route produces something worth escalating.',
    ask: 'Nothing yet.', warm: 'None.' },

  { rank: 7, tier: 3, name: 'Chaya Nayak', who: 'OpenAI',
    role: 'Head of Certifications and the Jobs Platform', conf: C.MED,
    why: 'Nominally the highest-value target for a certification-prep business. In practice the '
      + 'weakest to approach: the title rests on congressional testimony from 14 January 2026, '
      + 'nine months ago, and she appears on no OpenAI-owned page. Both things she owns are '
      + 'unshipped.',
    ask: 'Nothing until the title is re-confirmed.', warm: 'None.' },
];

/* ------------------------------------------------------------------ *
 * WHAT I GOT WRONG FOUR HOURS AGO
 * ------------------------------------------------------------------ */

const AMENDMENTS = [
  { what: 'C3.4\'s recommendation to sequence OpenAI behind Anthropic',
    change: 'PARTLY AMENDED. The partner-network half stands: there is still no training or '
      + 'education partner category and no self-serve door for what we do. The Community Trainer '
      + 'half does not stand. A door opened on 30 September through America\'s SBDC, it needs '
      + 'delivery capacity, and it is time-boxed because first-wave states are unpublished. The '
      + 'honest revision is that the OpenAI PARTNER track stays behind Anthropic and the OpenAI '
      + 'SBDC track is a near-term action.' },
  { what: 'The date I gave for the certification pilot',
    change: 'CORRECTED. C3.4 cited 5 March 2026 for "OpenAI Certifications are in pilot at '
      + 'Arizona State and the California State University system". The primary source is '
      + 'openai.com/index/openai-certificate-courses/ dated 9 December 2025. The 5 March date '
      + 'circulates in secondary roundups. The claim itself is unchanged and correct.' },
  { what: 'How big the OpenAI and CSU relationship is',
    change: 'UNDERSTATED. It is not only a certification pilot. ChatGPT Edu is deployed to all 23 '
      + 'campuses, 460,000 students and 63,000 staff and faculty, which OpenAI calls "the largest '
      + 'implementation of ChatGPT by any single organization or company anywhere in the world", '
      + 'and the contract was renewed in July 2026 through July 2029.' },
];

/* ------------------------------------------------------------------ *
 * RISKS
 * ------------------------------------------------------------------ */

const RISKS = [
  { r: 'There is real faculty resistance inside CSU, and walking into it unaware would be costly.',
    d: 'NPR reported on 25 May 2026 that roughly 65% of students and 59% of faculty surveyed were '
      + 'skeptical AI was benefiting education overall, across more than 94,000 responses, that a '
      + 'faculty petition urged non-renewal, and that the contract was no-bid. Practical read: '
      + 'there is appetite at the Chancellor\'s Office and resistance in the faculty body. '
      + 'Anything that looks like more vendor AI pushed down from the top will meet friction; '
      + 'student workforce outcomes will not.', conf: C.MED },
  { r: 'We would be adding capacity to a credential that already exists.',
    d: 'America\'s SBDC runs its own AI U certification and has already trained more than 500 '
      + 'advisors. We are delivery capacity, not the credential.', conf: C.MED },
  { r: 'The first wave may already be chosen.',
    d: 'Neither OpenAI nor America\'s SBDC has published which networks are in it, and no '
      + 'Inland Empire event appears on the Academy events list. This is answerable only by '
      + 'asking, which is itself the recommended first action.', conf: C.MED },
];

const UNVERIFIED = [
  { what: 'Whether California or the Inland Empire is in the SBDC first wave',
    why: 'Named nowhere by either party. The single most decision-relevant unknown, and the '
      + 'reason the first action is a question rather than a proposal.' },
  { what: 'A publication date for the board roster',
    why: 'None is printed. Currency was dated indirectly from member photo paths, the newest '
      + 'being May 2026. "Current as of May 2026 at the latest" is the defensible claim.' },
  { what: 'Whether the board has met recently, or produced anything',
    why: 'No minutes, agendas or deliverables are published. The EDUCAUSE session of October 2025 '
      + 'is the only evidence of working output, and it is a conference talk.' },
  { what: 'Contract values for the CSU and OpenAI deal',
    why: 'The renewal through July 2029 is confirmed on a CSUSB page. The dollar figures come '
      + 'only from NPR citing documents it obtained, and no institution-owned page states them.' },
  { what: 'CSUSB Career Training pricing', why: 'The catalog renders client-side. Course pages '
      + 'were confirmed to exist; prices were not captured and a secondary figure was not '
      + 'repeated.' },
];

/* ------------------------------------------------------------------ *
 * THE GATE
 * ------------------------------------------------------------------ */

/** A refuted link must stay visible. The temptation is to drop it and keep the good news. */
function assertRefutationKept() {
  const refuted = LINKS.filter((l) => /REFUTED/.test(l.verdict));
  if (!refuted.length) {
    throw new Error('the CSUSB-on-the-board link was refuted and must stay in the artifact; a '
      + 'hypothesis test that only reports confirmations is not a test');
  }
  return refuted.length;
}

/** Every target needs a tier and a stated warm path, even when that path is "none". */
function assertTiered() {
  const bad = TARGETS.filter((t) => !t.tier || !t.warm || !t.conf);
  if (bad.length) throw new Error('targets missing tier, warm path or confidence: '
    + bad.map((t) => t.name).join(', '));
  const tiers = new Set(TARGETS.map((t) => t.tier));
  if (tiers.size < 2) throw new Error('the tier split must be explicit');
  return { targets: TARGETS.length, tiers: [...tiers].sort() };
}

/** C3.4's published recommendation changed; the artifact must say so rather than restate it. */
function assertAmendmentsDeclared() {
  if (!AMENDMENTS.length) throw new Error('this brief amends C3.4 and must declare it');
  return AMENDMENTS.length;
}

module.exports = {
  ACCESS, C, HEADLINE, SO_WHAT, LINKS, SBDC, TARGETS, AMENDMENTS, RISKS, UNVERIFIED,
  assertRefutationKept, assertTiered, assertAmendmentsDeclared,
};
