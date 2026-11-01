/**
 * C6.14 - the three variants, as text a chief executive would actually receive.
 *
 * The ticket is explicit that the dry run must be "rendered text, not a description of itself",
 * so these are functions over a real company and the renderer prints the finished letters.
 *
 * ## Four hard constraints on the wording, all of them discovered rather than assumed
 *
 * `backend/src/scripts/lib/mandrillPreflight.js` hard-fails a send, so the copy is written to
 * pass it rather than to be fixed afterwards:
 *
 *   1. NO em dash or en dash anywhere. Use a comma, a colon, a hyphen with spaces, or "and".
 *   2. The branded signature is appended at send time, so no body ends with a closer.
 *   3. "Ali Muwwakkil" appears only in that signature, so it is never written in a body.
 *   4. No informal sign-off ("Best," / "Thanks,") alongside the branded signature.
 *
 * ## The fifth constraint is the registry, and it changes who may be quoted
 *
 * Three of the nine companies cannot be opened on the obvious sentence, and the reason is in
 * C6.13's evidence rather than in anything about the copy:
 *
 *   - HORACE MANN has no public AI statement attributable to Marita Zuraitis or to any named
 *     Horace Mann executive. EDGAR full-text returns four filings ever containing "artificial
 *     intelligence" and none quotes a person. A letter to her cannot quote her back to herself,
 *     so it quotes the filing.
 *   - AVISTA's artifact is a RISK-FACTOR DISCLOSURE, not a commitment. There is no target, no
 *     budget and no scope. C6.13 records that it must never be described as a commitment to Ali
 *     or to Avista, so the letter says what it is: something told to a regulator in writing.
 *   - SMILE BRANDS and GRAND MENTAL HEALTH were published by their VENDORS. The quotes are the
 *     CEOs' own words, but the rollout scope is the vendor's characterization, so the letters
 *     name the announcement rather than repeating a scope the company never stated.
 *
 * And one company blocks a sentence the other eight allow: LINDSAY's AI-leadership check came
 * back WATCH, not CLEAR, because a third-party profile puts artificial intelligence inside the
 * CIO's scope. So the "nobody owns this yet" line is forbidden there.
 */
const M = require('./c614Data').MEASURED;

/** The one place the numbers live, so every letter carries identical wording for them. */
const EVIDENCE = 'I work from measured evidence rather than assertion. On the platform I run, '
  + M.agentsEverRun.value + ' AI agents have run in production, and in the seven days to '
  + '1 November they completed ' + M.executions7d.value.toLocaleString('en-US')
  + ' executions with ' + M.failures7d.value + ' failures. Every agent write is audited. What '
  + 'people build on it is verified by reading their commits rather than by issuing a '
  + 'certificate: ' + M.stories.value + ' pieces of work verified that way today, across '
  + M.storyProjects.value + ' projects.';

/** A shorter form for the letter that goes to a peer rather than to a buyer. */
const EVIDENCE_SHORT = 'The short version of my evidence: ' + M.agentsEverRun.value
  + ' AI agents have run in production on the platform I run, '
  + M.executions7d.value.toLocaleString('en-US') + ' executions in the seven days to 1 November '
  + 'with ' + M.failures7d.value + ' failures, and ' + M.stories.value + ' pieces of learner '
  + 'work verified against real commits.';

/**
 * Per-company facts the copy needs, lifted from C6.13 rather than re-researched. `noAiLeader`
 * gates a sentence; `rule` records why an opener is worded the way it is, and the renderer
 * prints it beside the letter so Ali approves the wording and its reason together.
 */
const COMPANIES = {
  'Commerce Bancshares': {
    first: 'John', noAiLeader: true,
    opener: 'In your 2025 letter to shareholders, dated 24 February, you wrote that Commerce '
      + 'had established an AI pillar within its enterprise data strategy and developed a '
      + 'comprehensive AI roadmap.',
    rule: 'Two Kempers sign that annual report. The AI passage sits inside John W. Kemper\'s '
      + 'letter, under his own byline, so it is his to be quoted on. David W. Kemper, Executive '
      + 'Chairman, signs the letter immediately before it.',
    req: null,
  },
  'Cass Information Systems': {
    first: 'Martin', noAiLeader: true,
    opener: 'In the FY2025 results release on 22 January you tied the Facilities consolidation '
      + 'to the expanded utilization of AI-enabled systems, for efficiency and for client '
      + 'satisfaction.',
    rule: 'His Q1, Q2 and Q3 2026 quotes say "automation" and "technology enhancements" but not '
      + 'AI. C6.13 records that they must not be substituted for this one.',
    req: { title: 'Principal AI Software Architect', board: 'your UKG job board' },
  },
  'Horace Mann Educators': {
    first: 'Marita', noAiLeader: true,
    opener: 'Horace Mann\'s FY2025 Form 10-K, filed 27 February, positions generative AI as a '
      + 'foundational, enterprise-wide capability, and says the company expects to scale it '
      + 'further across Claims, Customer Care and Operations this year.',
    rule: 'THE ONLY LETTER THAT QUOTES A FILING INSTEAD OF A PERSON, and not for want of '
      + 'looking. No public AI statement attributable to her, or to any named Horace Mann '
      + 'executive, exists anywhere: four EDGAR filings ever contain "artificial intelligence" '
      + 'and none quotes a person, and the Q1 and Q2 2026 call transcripts contain none either. '
      + 'Ironically the content is the most explicit AI strategy of the nine.',
    req: { title: 'Director, Analytics Engineering for Life and Retirement',
      board: 'your Greenhouse board' },
  },
  'Employers Holdings': {
    first: 'Katherine', noAiLeader: true,
    opener: 'In your 19 February results release you said the new product and its risk '
      + 'management tools were developed entirely through your own internal, proactive use of AI.',
    rule: 'The release introduces her as Chief Executive Officer, so that is the title to use '
      + 'from this document even though her full title is President and CEO.',
    req: { title: 'Director of Technology, Enterprise Data Engineering',
      board: 'your Cornerstone careers site' },
  },
  'Tennant Company': {
    first: 'Dave', noAiLeader: true,
    opener: 'In the Brain Corp announcement on 14 April you said the change strengthens '
      + 'Tennant\'s ability to deliver differentiated, AI-enabled solutions that solve real '
      + 'customer problems.',
    rule: 'Tennant is the best-fitting company on the list by every other signal, and it is the '
      + 'one the original L&D disqualifier cut hardest. It is back in on Ali\'s 28 October '
      + 'decision, with its Talent Development finding intact: that team is real but pointed at '
      + 'a cleaning-equipment field force, not at knowledge workers.',
    req: { title: 'Enterprise AI and Analytics Leader', board: 'jobs.tennantco.com' },
  },
  'Smile Brands': {
    first: 'Steve', noAiLeader: true,
    opener: 'In Pearl\'s announcement on 15 June you said what set them apart was a '
      + 'partner-first approach and a forward-thinking vision for technology, with the rollout '
      + 'already under way.',
    rule: 'VENDOR-PUBLISHED. The quote is his, verbatim and re-pulled from the source, but the '
      + 'rollout scope in that release is the vendor\'s characterization, so the letter does not '
      + 'repeat a number Smile Brands never stated itself.',
    req: null,
  },
  'GRAND Mental Health': {
    first: 'Josh', noAiLeader: true,
    opener: 'In Eleos Health\'s announcement on 22 April you said the pressures on community '
      + 'care organizations are not easing, and that what you needed was something actionable.',
    rule: 'VENDOR-PUBLISHED. C6.13 notes the pressures line is the more quotable of his two, '
      + 'and says more about why he bought than what he bought, so the letter leads on it.',
    req: null,
  },
  'Lindsay Corporation': {
    first: 'Randy', noAiLeader: false, middleKey: 'early',
    opener: 'On the Q3 FY2026 call you said AI is in very early innings in terms of how it '
      + 'applies to your equipment, while FieldNET Advisor is already deploying AI models for '
      + 'irrigation scheduling.',
    rule: 'THE ONE LETTER THAT MAY NOT SAY NOBODY OWNS THIS YET. Lindsay\'s AI-leadership check '
      + 'came back WATCH rather than CLEAR: a third-party profile puts artificial intelligence '
      + 'inside the CIO\'s scope. Also, the 2 July date is when the transcript was published, '
      + 'not when the call happened, so the letter cites the call and not a date.',
    req: null,
  },
  'Avista Corporation': {
    first: 'Heather', noAiLeader: true, middleKey: 'risk',
    opener: 'Avista\'s FY2025 Form 10-K tells your regulator, in writing, that AI literacy is '
      + 'essential, and that not advancing the understanding and use of AI could compromise the '
      + 'company\'s operational and financial progress.',
    rule: 'NOT A COMMITMENT, AND IT MUST NEVER BE CALLED ONE. This is a risk-factor disclosure: '
      + 'no target, no budget, no scope. C6.13 records it as the stronger artifact for this '
      + 'offer anyway, because the company has told its regulator it needs the exact capability '
      + 'being offered. Avista is also back in on the 28 October decision: the Jack Stewart '
      + 'Training Center and eleven apprenticeships are craft training for lineworkers.',
    req: null,
  },
};

/** Disqualified 28 October. Still enrolled in production as lead 25373. Not written for. */
const EXCLUDED = {
  'CNO Financial Group': 'Disqualified on 2026-10-28. It owns the full stack an enterprise '
    + 'learning organization is made of: its own Cornerstone LMS, a Senior Director of Field '
    + 'Learning Strategy owning curriculum, and fifteen consecutive years of Training magazine '
    + 'recognition. No letter is drafted for it.',
};

/* ------------------------------------------------------------------ the three variants */

const STAFFING = 'The second and third build need more people than the first did, and that '
  + 'market does not favor companies that are not technology brands.';

/**
 * The default middle paragraph says the company has already decided. Two companies cannot carry
 * that sentence honestly and they get their own: Avista's artifact is a risk disclosure rather
 * than a plan, and Randy Wood said in his own words that Lindsay is in "very early innings".
 * Writing "you have already decided" to either one would be the letter telling them something
 * about themselves that their own source does not say, which is the fastest way to lose a
 * reader who knows their own filing.
 */
const MIDDLE_B = 'Deciding is the part your company has already done. Staffing it is the part '
  + 'that gets harder, because ' + STAFFING.charAt(0).toLowerCase() + STAFFING.slice(1);

const MIDDLE_RISK = 'A risk disclosure is not a plan and I will not pretend otherwise. But '
  + 'telling your regulator in writing that the capability is essential is the part most '
  + 'companies skip, and what comes after it is the part that gets harder. ' + STAFFING;

const MIDDLE_EARLY = 'Early innings is the honest description, and it is also when the staffing '
  + 'question gets decided rather than after. ' + STAFFING;

const MIDDLE = { decided: MIDDLE_B, risk: MIDDLE_RISK, early: MIDDLE_EARLY };

const VARIANTS = [
  {
    id: 'A',
    name: 'The requisition you have open',
    whenToUse: 'The four companies with an AI, data engineering or data science requisition '
      + 'observed open on 27 October: Cass Information Systems, Horace Mann Educators, '
      + 'Employers Holdings and Tennant Company.',
    constraint: 'It may say only that the posting was READ on 27 October. It may never say how '
      + 'long the req has been open. C6.13 proved that unverifiable from outside: the same '
      + 'Tennant posting read "Sep 28, 2026" in a search snippet and "Oct 27, 2026" on the live '
      + 'page hours apart. The ticket called a req open over 90 days the sharpest filter in the '
      + 'strategy, and it is the one claim this motion cannot make.',
    subject: (c) => 'Your ' + c.req.title + ' req',
    paragraphs: (c) => [
      c.first + ',',
      'I read your ' + c.req.title + ' posting on ' + c.req.board + ' on 27 October. I am not '
        + 'writing about the role for myself.',
      'I lead AI delivery, and the thing a candidate cannot bring you is the bench behind the '
        + 'hire. I build the engineers who do this work, so I would arrive with a pipeline '
        + 'instead of competing with you for the same five people.',
      EVIDENCE,
      'If that seat is still open in January, the constraint is the market for the people and '
        + 'not the posting. Would twenty minutes be worth it?',
    ],
  },
  {
    id: 'B',
    name: 'Your own dated words',
    whenToUse: 'All nine qualifying companies. This is the variant to lead with, because the '
      + 'opener is the company\'s own public statement with a date and a retrievable source '
      + 'behind it, which is what separates this from every other letter in the inbox.',
    constraint: 'The opener is per-company and three of them carry a sourcing rule that changes '
      + 'who may be quoted. The rules are printed beside each letter. One company, Lindsay, may '
      + 'not carry the sentence about nobody owning AI yet.',
    subject: (c) => 'Your AI plan, and the people it needs',
    paragraphs: (c) => [
      c.first + ',',
      c.opener,
      MIDDLE[c.middleKey || 'decided'] + (c.noAiLeader
        ? ' So far as I can establish from the outside, you have no AI leader in post to do that '
          + 'hiring.'
        : ''),
      EVIDENCE,
      'If it would be useful, I would like twenty minutes to show you what that evidence looks '
        + 'like and to hear where your plan is short of people.',
    ],
  },
  {
    id: 'C',
    name: 'The introduction, asked of someone else',
    whenToUse: 'Any of the nine where a mutual contact exists. Addressed to the contact, never '
      + 'to the chief executive, and it names no figure about the target company at all.',
    constraint: 'THE ONLY VARIANT THAT STATES THE CONFLICT IN THE BODY, and it does so before '
      + 'it asks for anything. Asking someone to spend their own credibility on an introduction '
      + 'while leaving out that Ali owns the firm in the signature is the version of this letter '
      + 'that cannot be sent.',
    subject: (c) => 'An introduction to ' + c.first + ' at ' + c.companyName + '?',
    paragraphs: (c) => [
      '[contact first name],',
      'I am asking for an introduction rather than a favor. ' + c.companyName + ' has said '
        + 'publicly, with a date I can point to, that it is building AI capability'
        + (c.noAiLeader ? ', and so far as I can establish it has no AI leader in post' : '')
        + '. I lead AI delivery and I bring the hiring bench with me, which is the half a '
        + 'company in that position cannot simply buy.',
      'To be straight about the conflict before you spend any of your own credibility on it: I '
        + 'own Colaberry, the firm in my signature. If this ever turned into a supplier '
        + 'relationship it would go through their normal vendor process with me recused, and I '
        + 'would put that in writing first.',
      EVIDENCE_SHORT,
      'If you would forward this, that is all I need. If you would rather not, tell me and I '
        + 'will approach them directly.',
    ],
  },
];

/** The signature appended at send time. Reproduced so the dry run shows the whole letter. */
const SIGNATURE = ['Ali Muwwakkil', 'Managing Director / AI Systems Architect', 'Colaberry Inc.',
  '', '200 Chisholm Place, Suite 200, Plano, TX 75075',
  'ali@colaberry.com  |  enterprise.colaberry.ai',
  'Design Your AI Organization: https://advisor.colaberry.ai/advisory'];

/** Render one letter. `companyName` is injected so variant C can name the target. */
function letter(variant, companyName) {
  const c = Object.assign({ companyName }, COMPANIES[companyName]);
  if (!c.first) throw new Error('c614Copy: no company facts for ' + companyName);
  if (variant.id === 'A' && !c.req) {
    throw new Error('c614Copy: variant A needs an observed requisition; ' + companyName
      + ' has none');
  }
  return { subject: variant.subject(c), paragraphs: variant.paragraphs(c), rule: c.rule };
}

module.exports = {
  EVIDENCE, EVIDENCE_SHORT, COMPANIES, EXCLUDED, VARIANTS, SIGNATURE, letter,
};
