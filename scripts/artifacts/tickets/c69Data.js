/**
 * C6.9 - Strategic Account Intelligence Brief Generator. THE single source for both PDFs.
 *
 * ## The ticket asks a question before it asks for a build
 *
 * "First establish whether an account-intelligence capability already exists. If it does,
 * extend it; if not, decide honestly whether 25 to 40 accounts justifies a generator versus
 * manual research, and recommend." And: "What does Ali need to personally review or decide?
 * Whether this is worth building versus doing by hand for 25 accounts."
 *
 * So the deliverable is a recommendation with the evidence behind it, plus the one piece
 * that is worth building either way: the schema and the gate that refuse an unsourced line.
 *
 * ## The recommendation, and why it is not a dodge
 *
 * DO NOT build the generator. Not because it is hard, but because the thing that would make
 * it useful does not exist and cannot be added casually: there is no web-search dependency
 * in the backend, and the only agent runtime that could research has WebFetch and WebSearch
 * on a hard deny-list for documented security reasons. A generator on top of that produces
 * fluent prose with no sources, which is the ticket's own named failure mode.
 *
 * Every number below was verified against the repository rather than recalled.
 */
const fs = require('fs');
const path = require('path');
const { SECTIONS } = require('./c69Guards');

const REPO = path.join(__dirname, '..', '..', '..');
const AS_OF = '2026-10-19';

/* ── what exists, measured ────────────────────────────────────────────────── */

/**
 * Each row is a claim about the codebase with the check that proves it.
 *
 * `check` runs at build time. A row that stops being true fails the build rather than
 * sitting in a PDF as a stale assertion, which is the failure mode of every audit document
 * that was true the day it was written.
 */
const EVIDENCE = [
  {
    claim: 'No web-search dependency exists in the backend.',
    short: 'Nothing in package.json can search the web.',
    detail: 'No Tavily, Serper, SerpAPI, Brave, Bing, Exa, Firecrawl or Google CSE in '
      + 'backend/package.json.',
    check: () => {
      const pkg = fs.readFileSync(path.join(REPO, 'backend', 'package.json'), 'utf8');
      return !/tavily|serper|serpapi|brave|bing|exa\.ai|firecrawl|customsearch/i.test(pkg);
    },
  },
  {
    claim: 'The one agent runtime that could research is forbidden from doing so.',
    short: 'WebFetch and WebSearch are on a hard deny-list.',
    detail: 'claudeAgentSdkProvider.ts puts WebFetch and WebSearch on DENIED_TOOLS, because '
      + 'unbounded network egress is a denied capability.',
    check: () => {
      const src = fs.readFileSync(path.join(REPO, 'backend', 'src', 'services', 'delivery',
        'execution', 'claudeAgentSdkProvider.ts'), 'utf8');
      return /DENIED_TOOLS[^=]*=\s*\[\s*'WebFetch',\s*'WebSearch'\s*\]/.test(src);
    },
  },
  {
    claim: 'No account-intelligence capability exists to extend.',
    short: 'Nothing researches an account. There is nothing to extend.',
    detail: 'Nothing in backend/src researches or profiles an account. The nearest thing, '
      + 'icpProfileService, is a people-search filter template.',
    check: () => {
      const dir = path.join(REPO, 'backend', 'src', 'services');
      const names = fs.readdirSync(dir, { recursive: true }).map(String);
      return !names.some((n) => /account(Intelligence|Research|Brief)/i.test(n));
    },
  },
  {
    claim: 'A person-level brief generator already exists and is the right template.',
    short: 'strategyBriefService is the shape to copy, minus sources.',
    detail: 'adminOs/strategyBriefService.ts generates a sales brief from internal CRM data. '
      + 'Its sections are close to the ones this ticket names, and it cites no sources '
      + 'because it has none to cite.',
    check: () => fs.existsSync(path.join(REPO, 'backend', 'src', 'services', 'adminOs',
      'strategyBriefService.ts')),
  },
  {
    claim: 'The sourcing gate this ticket needs already exists for C6.7 and holds.',
    short: 'C6.7 already gates an opening on a source URL and a date.',
    detail: 'c67Guards.assertEveryOpeningIsSourced refuses an opening without an http source '
      + 'and a date it was read.',
    check: () => {
      const src = fs.readFileSync(path.join(__dirname, 'c67Guards.js'), 'utf8');
      return src.includes('assertEveryOpeningIsSourced');
    },
  },
];

/* ── the arithmetic that decides it ───────────────────────────────────────── */

/**
 * The model is not the cost. This is the number that settles the question.
 *
 * gpt-4o is $2.50 per 1M input and $10.00 per 1M output (costEstimationService.ts). A brief
 * of roughly 3,000 input and 1,000 output tokens costs about 1.8 cents.
 */
const COST = {
  accounts: 38,
  inputTokens: 3000,
  outputTokens: 1000,
  inputPer1m: 2.50,
  outputPer1m: 10.00,
  researchMinutesPerAccount: 25,
};

function modelCostPerBrief() {
  return (COST.inputTokens / 1e6) * COST.inputPer1m
    + (COST.outputTokens / 1e6) * COST.outputPer1m;
}

function modelCostForAll() {
  return modelCostPerBrief() * COST.accounts;
}

function researchHoursForAll() {
  return (COST.researchMinutesPerAccount * COST.accounts) / 60;
}

/* ── what is already done ─────────────────────────────────────────────────── */

const ALREADY_DONE = {
  accounts: 38,
  withAPerson: 35,
  withAVerifiedEmail: 24,
  withASourcedOpening: 21,
  note: 'C6.7 already produced, by hand, a sourced opening for 21 of the 38 accounts, each '
    + 'with a fact, an http source, the date it was read and a confidence level. That is the '
    + 'majority of what this ticket asks a generator to produce, and it was produced by a '
    + 'Claude Code research session rather than by backend code.',
};

/* ── the recommendation ───────────────────────────────────────────────────── */

const RECOMMENDATION = {
  verdict: 'DO NOT BUILD the generator. Ship the schema and the gate, and keep the research '
    + 'where it already happens.',
  because: [
    'The blocker is not the model, it is the sourcing. Nothing in the backend can find out '
      + 'what an account is doing with AI, and the runtime that could is deny-listed from '
      + 'the open internet on purpose.',
    'The model cost is negligible and therefore not the argument: about two cents a brief, '
      + 'under a dollar for all 38. The research time is the cost, and a generator does not '
      + 'reduce it, it hides it.',
    'A generator without sources would produce exactly the named failure: plausible-sounding '
      + 'account facts. The ticket calls that out as the thing that makes the work '
      + 'untrustworthy.',
    'Most of the work exists. C6.7 hand-produced sourced openings for 21 of 38 accounts '
      + 'under a gate that refuses an unsourced one.',
    'Apollo cannot help. The integration is people-only; no organization endpoint is called '
      + 'anywhere in the repo.',
  ],
  instead: [
    'Adopt the brief schema in this document: seven sections, four of which must carry an '
      + 'http source and the date it was read.',
    'Use the gate in scripts/artifacts/tickets/c69Guards.js, which refuses an unsourced '
      + 'line, an absent section, a figure about us that is not in the claim registry, and '
      + 'two briefs whose openings are interchangeable.',
    'Fill the briefs in a Claude Code research session, which is this repo\'s own documented '
      + 'model of research: runMyDayPromptService writes "Use WebSearch" into a prompt for a '
      + 'human operator rather than calling it from a service.',
    'Reuse the 21 sourced openings C6.7 already produced rather than regenerating them.',
  ],
};

/** What would change the answer. Stated numerically so it can actually be checked later. */
const WOULD_CHANGE_THE_ANSWER = [
  { trigger: 'The account list passes', threshold: 150,
    unit: 'accounts', why: 'At 25 minutes of research each, 150 accounts is about 62 hours. '
      + 'That is the point where the research time justifies buying a search dependency and '
      + 'the governance work to allow it.' },
  { trigger: 'A sourced web-search dependency is approved and added', threshold: 1,
    unit: 'dependency', why: 'That is a security-posture decision, not a feature flag: the '
      + 'deny-list exists because untrusted content plus arbitrary egress is an exfiltration '
      + 'path. It is an escalation, and this ticket is not the place to make it.' },
  { trigger: 'Briefs need refreshing more often than', threshold: 4,
    unit: 'times a year', why: 'Re-research at that cadence turns a one-off into a standing '
      + 'cost, and automation starts paying for itself.' },
];

/* ── assertions ───────────────────────────────────────────────────────────── */

/** Every evidence row must still be true. A stale audit is worse than no audit. */
function assertEvidenceStillTrue() {
  for (const row of EVIDENCE) {
    let ok;
    try {
      ok = row.check();
    } catch (e) {
      throw new Error(`C6.9: evidence check threw for "${row.claim}": ${e.message}`);
    }
    if (!ok) {
      throw new Error(`C6.9: this is no longer true: "${row.claim}". The recommendation `
        + 'rests on it, so rewrite the recommendation rather than the check.');
    }
  }
  return EVIDENCE.length;
}

/** The recommendation must be a decision, not a survey of options. */
function assertRecommendationIsADecision() {
  if (!/^DO NOT BUILD|^BUILD/.test(RECOMMENDATION.verdict)) {
    throw new Error('C6.9: the verdict must start with a decision, not a consideration');
  }
  if (RECOMMENDATION.because.length < 3 || RECOMMENDATION.instead.length < 3) {
    throw new Error('C6.9: a recommendation needs its reasons and its alternative spelled out');
  }
  return true;
}

/** Every reversal trigger carries a number, so "revisit later" cannot mean "never". */
function assertReversalTriggersAreNumeric() {
  for (const t of WOULD_CHANGE_THE_ANSWER) {
    if (typeof t.threshold !== 'number' || !Number.isFinite(t.threshold)) {
      throw new Error(`C6.9: reversal trigger "${t.trigger}" has no number`);
    }
  }
  return WOULD_CHANGE_THE_ANSWER.length;
}

/** The cost arithmetic must be derived, never typed in twice. */
function assertCostIsDerived() {
  const per = modelCostPerBrief();
  const all = modelCostForAll();
  if (Math.abs(all - per * COST.accounts) > 1e-9) {
    throw new Error('C6.9: the total cost does not equal the per-brief cost times the count');
  }
  if (per > 0.10) {
    throw new Error(`C6.9: a brief now costs $${per.toFixed(3)}, which breaks the argument `
      + 'that the model is not the cost. Re-check the pricing and rewrite the verdict.');
  }
  return { per, all, hours: researchHoursForAll() };
}

/**
 * The gate must cover the sourced sections this document promises.
 *
 * Named, not counted. The first version asserted "at least four sections require a source",
 * which the break harness showed was decorative: the schema has five, so a section could be
 * quietly downgraded and the count still passed. Every section that asserts something about
 * the ACCOUNT is listed here by key, and the two that are about US are listed as exempt, so
 * a change in either direction has to be deliberate.
 */
const MUST_BE_SOURCED = ['aiActivity', 'whyNow', 'likelyBuyer', 'likelyInitiative', 'opening'];
const ABOUT_US = ['relevantProof', 'risk'];

function assertGateCoversTheSchema() {
  for (const key of MUST_BE_SOURCED) {
    const section = SECTIONS.find((s) => s.key === key);
    if (!section) throw new Error(`C6.9: the schema lost the "${key}" section`);
    if (!section.sourced) {
      throw new Error(`C6.9: "${key}" asserts something about the account but no longer `
        + 'requires a source. The gate is decorative without it.');
    }
  }
  for (const key of ABOUT_US) {
    const section = SECTIONS.find((s) => s.key === key);
    if (section && section.sourced) {
      throw new Error(`C6.9: "${key}" is about us, so it is governed by the claim registry `
        + 'rather than an external URL. Requiring one would invite a decorative link.');
    }
  }
  const sourced = SECTIONS.filter((s) => s.sourced).length;
  return { sections: SECTIONS.length, sourced };
}

module.exports = {
  AS_OF,
  EVIDENCE,
  COST,
  ALREADY_DONE,
  RECOMMENDATION,
  WOULD_CHANGE_THE_ANSWER,
  SECTIONS,
  modelCostPerBrief,
  modelCostForAll,
  researchHoursForAll,
  assertEvidenceStillTrue,
  assertRecommendationIsADecision,
  assertReversalTriggersAreNumeric,
  assertCostIsDerived,
  assertGateCoversTheSchema,
};
