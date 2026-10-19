/**
 * C3.2 - the Anthropic meeting package. THE single source for the whole bundle.
 *
 * ## The gate, and why it is code rather than a promise
 *
 * C3.2's acceptance criteria are checkable, so they are checked. Every claim that appears in the
 * deck carries a `clm` id; `assertRegistryGated()` throws if that id is not an APPROVED, deck-
 * eligible row of the C0.6 registry. "Every claim traces to the claim registry" is therefore a
 * build failure when it is false, not a sentence in a review comment.
 *
 * The same applies to the other three criteria: exactly one ask, no OpenAI content anywhere, and
 * no PDF before approval (the build entrypoint emits HTML only).
 *
 * ## Why the figures are not the ones the registry records
 *
 * Three registry rows are APPROVED WITH DATE precisely because they move. CLM-002 says so in its
 * own prohibited_wording: "the count rises as learners commit... an undated figure becomes wrong
 * by sitting still." So the registry\'s own SQL was re-run against production on 2026-10-16 and the
 * fresher values are used, each with today\'s date. Re-running is the registry\'s instruction.
 *
 * ## Two registry defects found while doing that, both flagged for Ali rather than patched here
 *
 * CLM-006 is wrong twice over, and it is the one figure an AI-lab audience is most likely to
 * probe. See OPEN_FLAGS.
 */

const AS_OF = '16 October 2026';

/**
 * The C0.6 rows this bundle is allowed to draw on, as a snapshot taken 2026-10-16.
 * `deck: false` rows are present deliberately: the assertion needs to be able to REFUSE them,
 * and a reader needs to see what was excluded and why.
 */
const REGISTRY = {
  'CLM-001': { deck: true, text: '48 distinct learner projects in flight',
    src: 'Production DB, count(distinct project_id) from build_plans', dated: true },
  'CLM-002': { deck: true, text: 'learner stories verified against a real commit',
    src: "Production DB, student_tasks where verified_by = 'build_pipeline:repo_verification'",
    dated: true },
  'CLM-004': { deck: true, text: '13 case studies published, all 13 live, across 3 surfaces',
    src: 'Production DB, case_studies joined to case_study_publications', dated: false },
  'CLM-005': { deck: true, text: 'AI agents that have run in production',
    src: 'Production DB, ai_agents where last_run_at is not null', dated: true },
  'CLM-006': { deck: true, text: 'agent success rate across executions in seven days',
    src: 'Production DB, agent_performance_metrics, seven days', dated: true },
  'CLM-007': { deck: true, text: 'Every agent write is audited',
    src: 'Production DB, audit tables', dated: false },
  'CLM-008': { deck: true, text: 'Two AI employees are governed by a written role charter',
    src: 'Production DB, agent_role_charters, 2 rows', dated: false },
  'CLM-011': { deck: true, text: 'Government opportunity discovery and qualification runs daily',
    src: 'Running container ENABLE_GOV_DAILY_SYNC true; gov_qualifications', dated: false },
  'CLM-013': { deck: true, text: 'Refactored.ai selected as a Work of the Future Solver at MIT '
      + 'Solve 2018, one of eight from more than 1,150 applications across 110 countries',
    src: 'MIT Solve', dated: false },
  'CLM-014': { deck: true, text: 'Refactored.ai a recipient of the Patrick J. McGovern Foundation '
      + 'Artificial Intelligence for the Betterment of Humanity Prize, at MIT Solve 2018',
    src: 'MIT Solve', dated: false },
  'CLM-015': { deck: true, text: 'Refactored.ai a recipient of the General Motors Prize for '
      + 'Advanced Technologies, at MIT Solve 2018', src: 'MIT Solve', dated: false },
  'CLM-016': { deck: true, text: 'Refactored.ai named one of seven finalists in the JFF Labs '
      + '$1 Billion Wage Gain Challenge, 2019', src: 'JFF Labs', dated: false },
  'CLM-017': { deck: true, text: 'Colaberry a finalist in XPRIZE Rapid Reskilling as a partner in '
      + 'Team VITAL, with Gleechi AB and Banyan Tree Global', src: 'XPRIZE, retrieved', dated: false },
  'CLM-020': { deck: true, text: 'Anthropic committed $100 million through the Claude Partner '
      + 'Network, March 2026', src: 'anthropic.com/news/claude-partner-network', dated: false },
  'CLM-022': { deck: true, text: 'Anthropic committed $100 million through Claude Frontier '
      + 'Academy, October 2026', src: 'anthropic.com/news/claude-frontier-academy', dated: false },
  'CLM-023': { deck: true, text: 'Anthropic is aiming at 10,000 Frontier Deployed Engineers by the '
      + 'end of 2027', src: 'anthropic.com/news/claude-frontier-academy', dated: false },
  'CLM-025': { deck: true, text: 'Colaberry is not part of the Anthropic or OpenAI programs and '
      + 'issues neither credential', src: 'Required wording', dated: false },
  'CLM-026': { deck: true, text: 'We prepare people for Anthropic\'s architect certification '
      + 'and verify what they build. We do not award the credential',
    src: 'Anthropic certification pages', dated: false },

  // Deliberately NOT available to this bundle.
  'CLM-003': { deck: false, why: 'RETIRED. The "17" figure. Remove wherever it appears.' },
  'CLM-012': { deck: false, why: 'BLOCKED. "0 of 46 learners presented at Demo Day" cannot be '
      + 'sourced from the platform; no table matching "demo" exists. Usable only if sourced from '
      + 'Basecamp and labeled a Basecamp figure. The ticket asks for it; the registry blocks it. '
      + 'See OPEN_FLAGS.' },
  'CLM-018': { deck: false, why: 'BLOCKED. "Most Promising Work of the Future Solution" wording '
      + 'is unevidenced.' },
  'CLM-019': { deck: false, why: 'BLOCKED. "MIT Solve Community Favorite Award" is unevidenced.' },
  'CLM-021': { deck: false, why: 'A competing lab\'s funding commitment. Excluded from Anthropic '
      + 'material by the ticket, not by the registry, which permits it on other surfaces.' },
  'CLM-024': { deck: false, why: 'A competing lab\'s stated target. Excluded from Anthropic '
      + 'material by the ticket.' },
  'CLM-009': { deck: false, why: 'PROHIBITED. Never call the fleet autonomous or say it acts.' },
  'CLM-010': { deck: false, why: 'PROHIBITED. Cora classifies and archives; it replies to nobody.' },
  'CLM-027': { deck: false, why: 'PROHIBITED. The word "free" in any advertisement.' },
  'CLM-028': { deck: false, why: 'PROHIBITED. Any summed figure across lab commitments.' },
  'CLM-029': { deck: false, why: 'PROHIBITED. Any figure without a named registry source.' },
};

/** Figures re-read from production on 2026-10-16 by re-running the registry\'s own queries. */
const LIVE = {
  projects: 48,            // CLM-001, unchanged since 8 Oct
  stories: 345,            // CLM-002, was 322 on 8 Oct
  storyProjects: 29,       // CLM-002
  caseStudies: 13,         // CLM-004
  caseStudySurfaces: 3,    // CLM-004
  caseStudyRows: 37,       // CLM-004, NOT to be conflated with the 13
  agentsRun: 151,          // CLM-005
  agents24h: 123,          // CLM-005, was 124 on 8 Oct
  registrySize: 257,       // CLM-005 context; NOT a count of operating agents
  executions: 168619,      // CLM-006 corrected
  failures: 60,            // CLM-006 corrected
  charters: 2,             // CLM-008
  govQualifications: 31,   // CLM-011, was 10 on 8 Oct
  govNewest: '15 October 2026',
};

/** Computed, never typed, so the rate and its denominator cannot drift apart. */
LIVE.successRate = ((LIVE.executions - LIVE.failures) / LIVE.executions) * 100;
const RATE = LIVE.successRate.toFixed(2) + '%';
const EXEC = LIVE.executions.toLocaleString('en-US');

/* ------------------------------------------------------------------ *
 * THE DECK. Nine slides, ending on exactly one ask.
 * ------------------------------------------------------------------ */

const DECK = [
  { n: 1, title: 'Colaberry', kicker: 'Who is in the room',
    body: ['We get organizations live on Claude, and we verify what their people actually built.',
      'Twelve years training technical talent, most recently as an AI capability program that '
      + 'runs on an instrumented platform rather than on slides.'],
    claims: [] },

  { n: 2, title: 'The window', kicker: 'Why now',
    body: ['Anthropic committed $100 million through the Claude Partner Network in March 2026, and '
      + 'a further $100 million through Claude Frontier Academy in October 2026. These are two '
      + 'separate commitments and we never present them as a total.',
      'Anthropic is aiming at 10,000 Frontier Deployed Engineers by the end of 2027. That is '
      + 'Anthropic\'s target, not our forecast.',
      'The constraint on a number that size is not curriculum. It is proving that the people who '
      + 'came out the other side can actually build.'],
    claims: ['CLM-020', 'CLM-022', 'CLM-023'] },

  { n: 3, title: 'What we think the hard part is', kicker: 'The thesis',
    body: ['Completion is easy to report and tells you almost nothing. A certificate says someone '
      + 'sat an exam; it does not say they shipped.',
      'We verify at the commit. A learner story is only counted when a real commit in a real '
      + 'repository satisfies it, checked by a pipeline rather than asserted by the learner.',
      'That is the piece we would bring to a partnership, and it is the piece that is hardest to '
      + 'retrofit.'],
    claims: ['CLM-002'] },

  { n: 4, title: 'What is actually running', kicker: 'Not a roadmap',
    body: [LIVE.stories.toLocaleString('en-US') + ' learner stories verified against a real commit, '
      + 'across ' + LIVE.storyProjects + ' projects, as of ' + AS_OF + '.',
      LIVE.projects + ' distinct learner projects in flight.',
      LIVE.caseStudies + ' case studies published and live across ' + LIVE.caseStudySurfaces
      + ' surfaces.'],
    claims: ['CLM-001', 'CLM-002', 'CLM-004'] },

  { n: 5, title: 'The platform underneath it', kicker: 'Instrumented and audited',
    body: [LIVE.agentsRun + ' AI agents have run in production, ' + LIVE.agents24h + ' of them in '
      + 'the last 24 hours, as of ' + AS_OF + '.',
      RATE + ' success across ' + EXEC + ' executions in seven days, with ' + LIVE.failures
      + ' failures. We quote the denominator because a rate without one is not checkable.',
      'Every agent write is audited. Two AI employees operate under a written role charter.',
      'The fleet is instrumented, audited and read-only. It watches and records; it does not act '
      + 'on its own, and we do not describe it as autonomous.'],
    claims: ['CLM-005', 'CLM-006', 'CLM-007', 'CLM-008'] },

  { n: 6, title: 'This is not our first measured outcome', kicker: 'Track record',
    body: ['Refactored.ai was selected as a Work of the Future Solver at MIT Solve 2018, one of '
      + 'eight from more than 1,150 applications across 110 countries.',
      'It received the Patrick J. McGovern Foundation Artificial Intelligence for the Betterment '
      + 'of Humanity Prize and the General Motors Prize for Advanced Technologies, both at MIT '
      + 'Solve 2018.',
      'One of seven finalists in the JFF Labs $1 Billion Wage Gain Challenge, 2019. A finalist in '
      + 'XPRIZE Rapid Reskilling as a partner in Team VITAL, with Gleechi AB and Banyan Tree '
      + 'Global.'],
    claims: ['CLM-013', 'CLM-014', 'CLM-015', 'CLM-016', 'CLM-017'] },

  { n: 7, title: 'Where we would fit', kicker: 'The proposal',
    body: ['As an implementation and enablement partner: getting customers live on Claude, with '
      + 'training as the method and commit-level verification as the proof.',
      'Anthropic\'s own ladder counts adoption and enablement work, and says firms that '
      + 'specialize in getting customers live can qualify early. That is the lane we are in.',
      'We prepare people for Anthropic\'s architect certification and verify what they build. '
      + 'We do not award the credential, and we are not part of the Anthropic or OpenAI '
      + 'programs.'],
    claims: ['CLM-025', 'CLM-026'] },

  { n: 8, title: 'What we are not claiming', kicker: 'The honest slide',
    body: ['Our first cohort has not finished. We are not presenting a completed outcome study.',
      'The agent fleet does not act autonomously, and we will not describe it that way to get a '
      + 'nod in a meeting.',
      'Our government lane discovers and qualifies opportunities daily. It stops at '
      + 'qualification; we do not submit proposals through it.',
      'We would rather you find this slide than find the gap yourselves.'],
    claims: ['CLM-011'] },

  { n: 9, title: 'The ask', kicker: 'One thing',
    body: ['A 30-minute working session where we demo the verification pipeline against a live '
      + 'repository, and you tell us whether it is useful to the Partner Network.'],
    claims: [], isAsk: true },
];

/** The single ask, held once so the deck, the leave-behind and the agenda cannot disagree. */
const ASK = 'A 30-minute working session where we demo the commit-level verification pipeline '
  + 'against a live repository.';

/* ------------------------------------------------------------------ *
 * CAPABILITY STATEMENT - live, pilot, roadmap
 * ------------------------------------------------------------------ */

const CAPABILITY = {
  asof: '8 October 2026',
  counts: { live: 10, dark: 9, designed: 4, roadmap: 1, total: 24 },
  live: [
    { what: 'Commit-level story verification', detail: LIVE.stories.toLocaleString('en-US')
      + ' stories verified across ' + LIVE.storyProjects + ' projects', clm: 'CLM-002' },
    { what: 'Learner project delivery', detail: LIVE.projects + ' projects in flight', clm: 'CLM-001' },
    { what: 'Published outcome case studies', detail: LIVE.caseStudies + ' live across '
      + LIVE.caseStudySurfaces + ' surfaces', clm: 'CLM-004' },
    { what: 'Production agent fleet', detail: LIVE.agentsRun + ' agents have run, ' + RATE
      + ' success across ' + EXEC + ' executions in seven days', clm: 'CLM-006' },
    { what: 'Write-level audit trail', detail: 'Every agent write is audited', clm: 'CLM-007' },
    { what: 'Governed AI employees', detail: LIVE.charters + ' under a written role charter',
      clm: 'CLM-008' },
    { what: 'Government opportunity lane', detail: 'Discovery and qualification daily, '
      + LIVE.govQualifications + ' qualifications, newest ' + LIVE.govNewest
      + '. Stops at qualification.', clm: 'CLM-011' },
  ],
  pilot: [
    { what: 'AI mentor for student success and retention',
      detail: 'One of the two charters, live with a pilot cohort', clm: 'CLM-008' },
  ],
  roadmap: [
    { what: 'The remaining capabilities', detail: '9 built but not switched on, 4 designed and 1 '
      + 'on the roadmap, of 24 counted as of 8 October 2026. Counted rather than named here, '
      + 'because naming a capability we have not verified is the thing this bundle exists to '
      + 'avoid.', clm: null },
  ],
};

/* ------------------------------------------------------------------ *
 * THREE-MINUTE DEMO
 * ------------------------------------------------------------------ */

const DEMO = [
  { t: '0:00', beat: 'Open a learner project that is mid-flight', say: 'This is real and it is '
    + 'running now, not a sandbox built for this meeting.' },
  { t: '0:30', beat: 'Show a story in its unverified state', say: 'The learner says they did it. '
    + 'At this point the platform does not believe them.' },
  { t: '1:00', beat: 'Show the commit the pipeline matched', say: 'Here is the actual commit in '
    + 'the actual repository. The pipeline checked it; a human did not tick a box.' },
  { t: '1:45', beat: 'Show the story flip to verified, and the audit row behind it',
    say: 'Every write is audited, so the evidence survives the demo.' },
  { t: '2:15', beat: 'Zoom out to the project view', say: LIVE.stories.toLocaleString('en-US')
    + ' of these, across ' + LIVE.storyProjects + ' projects, as of ' + AS_OF + '.' },
  { t: '2:45', beat: 'Stop and ask the question', say: 'Is this useful to the Partner Network, and '
    + 'who should see it next?' },
];

/* ------------------------------------------------------------------ *
 * AGENDA
 * ------------------------------------------------------------------ */

const AGENDA = [
  { m: '0 to 5', what: 'Introductions and why we asked for the meeting' },
  { m: '5 to 10', what: 'The window as we read it, and where we think the hard part is' },
  { m: '10 to 18', what: 'Demo: commit-level verification against a live repository' },
  { m: '18 to 25', what: 'Where we would fit, and what we are not claiming' },
  { m: '25 to 30', what: 'The ask, and who should see it next' },
];

/* ------------------------------------------------------------------ *
 * FAQ - the subset an Anthropic audience would actually raise
 * ------------------------------------------------------------------ */

const FAQ_IDS = [2, 6, 7, 8, 9, 10, 11];
const FAQ_RESERVED = [14, 15, 16];

/* ------------------------------------------------------------------ *
 * OPEN FLAGS - things Ali must decide, surfaced rather than resolved
 * ------------------------------------------------------------------ */

const OPEN_FLAGS = [
  { id: 'F1', title: 'CLM-006 is wrong twice over, and it is the figure most likely to be probed',
    detail: 'Its recorded source SQL selects a column named "success" from '
      + 'agent_performance_metrics, which does not exist; the table is pre-aggregated into '
      + 'execution_count, success_count and failure_count. And its recorded 99.8% does not follow '
      + 'from its own recorded numbers: 46 failures over 161,642 executions is 99.97%, not 99.8%. '
      + 'The corrected query run on ' + AS_OF + ' gives ' + RATE + ' across ' + EXEC
      + ' executions with ' + LIVE.failures + ' failures, identical whether windowed on period_end '
      + 'or created_at. This bundle uses the corrected figure. The registry row needs amending.',
    ask: 'Approve the corrected figure and amend CLM-006.' },

  { id: 'F2', title: 'CLM-026 mandates a credential name Anthropic no longer uses',
    detail: 'The row says to use the issuer\'s own name "with the colon", sourced from an '
      + 'Anthropic article dated 23 July 2026. On ' + AS_OF + ' every live Anthropic registration '
      + 'surface renders it with an EN DASH instead. Writing an AI lab\'s own credential name '
      + 'in a superseded form, in a meeting with that lab, is a small error with an outsized cost. '
      + 'This bundle avoids the problem by not printing the full credential name, saying '
      + '"Anthropic\'s architect certification" instead.',
    ask: 'Decide whether to print the current en-dash form and amend CLM-026, or keep avoiding '
      + 'the full name.' },

  { id: 'F3', title: 'The ticket asks for a figure the registry blocks',
    detail: 'The ticket says the strongest material is "319 commit-verified stories alongside 0 of '
      + '46 Demo Day tasks". The first is CLM-002 and is in, refreshed to '
      + LIVE.stories.toLocaleString('en-US') + '. The second is CLM-012, which the registry marks '
      + 'BLOCKED with allowed surfaces "none", because it cannot be sourced from the platform at '
      + 'all. It is left out. It could go in if sourced from Basecamp and labeled a Basecamp '
      + 'figure, which is what CLM-012 itself says.',
    ask: 'Either supply the Basecamp source so it can be labeled and used, or confirm it stays '
      + 'out.' },

  { id: 'F4', title: 'Three FAQ answers are still reserved to you, and they gate any pilot',
    detail: 'IP ownership, deployment liability and model neutrality remain unanswered from C2.6. '
      + 'Model neutrality is the sharpest of the three in an Anthropic meeting. The deck is built '
      + 'so this does not block it: the single ask is a demo and a fit conversation, not a pilot, '
      + 'so none of the three has to be answered in the room. They would block a pilot proposal.',
    ask: 'No action needed for this meeting. Needed before any pilot.' },
  { id: 'F5', title: 'XPRIZE may be a counter-signal in an Anthropic room, not an asset',
    detail: 'CLM-017 is true and registry-approved, and slide 6 carries it. But XPRIZE Rapid '
      + 'Reskilling concluded in January 2023 with no grand prize awarded, and XPRIZE\'s current '
      + 'frontier-AI tie-up is the Build with Gemini XPRIZE, a Google program whose finals ran in '
      + 'September 2026. Leading with an XPRIZE affiliation in front of Anthropic is at best '
      + 'neutral and plausibly counterproductive. The MIT Solve and JFF items on the same slide '
      + 'carry no such problem.',
    ask: 'Decide whether slide 6 keeps the XPRIZE line or drops to the MIT Solve and JFF items '
      + 'only. It is true either way; this is positioning, not accuracy.' },

  { id: 'F6', title: 'Do not lead with training volume, on Anthropic\'s own evidence',
    detail: 'The Capgemini executive quoted on Anthropic\'s Frontier Academy announcement of 2 '
      + 'October 2026 says plainly: "What I am hearing from clients is not about certification '
      + 'counts or training volume; it is about knowing firsthand how to solve real-world '
      + 'problems." Anthropic published that pushback themselves. The deck is already built '
      + 'around verification depth rather than seats trained, and it should stay that way.',
    ask: 'No action. Recorded so the deck is not later "improved" by adding volume numbers.' },
];

/* ------------------------------------------------------------------ *
 * THE GATE. Acceptance criteria as assertions.
 * ------------------------------------------------------------------ */

/** Every claim id cited by the deck must be an APPROVED, deck-eligible registry row. */
function assertRegistryGated() {
  const cited = new Set();
  for (const s of DECK) for (const c of s.claims) cited.add(c);
  for (const c of CAPABILITY.live.concat(CAPABILITY.pilot, CAPABILITY.roadmap)) {
    if (c.clm) cited.add(c.clm);
  }
  const bad = [...cited].filter((id) => !REGISTRY[id] || !REGISTRY[id].deck);
  if (bad.length) {
    throw new Error('claims cited but not deck-eligible in the C0.6 registry: ' + bad.join(', ')
      + '. If it is not in the registry it does not go in the deck.');
  }
  return [...cited].sort();
}

/** Exactly one slide may be the ask. */
function assertOneAsk() {
  const asks = DECK.filter((s) => s.isAsk);
  if (asks.length !== 1) throw new Error('the deck must end on exactly one ask, found ' + asks.length);
  if (DECK[DECK.length - 1] !== asks[0]) throw new Error('the ask must be the last slide');
  return asks[0];
}

/**
 * No OpenAI content anywhere in the bundle. Checked against the RENDERED html rather than against
 * this module, because the criterion is about what the reader receives.
 */
function assertNoOpenAI(html) {
  const text = String(html).replace(/<[^>]+>/g, ' ');
  const hits = text.match(/\bopen\s?ai\b|\bchatgpt\b|\bgpt-?[0-9]/gi) || [];
  // CLM-025 is required wording and names both programs; that single sentence is the one
  // permitted mention, so allow exactly the occurrences inside it.
  const allowed = (text.match(/not part of the Anthropic or OpenAI programs/gi) || []).length;
  if (hits.length > allowed) {
    throw new Error('OpenAI content found in Anthropic material: ' + hits.length + ' mention(s), '
      + allowed + ' allowed by CLM-025. ' + JSON.stringify([...new Set(hits)]));
  }
  return { hits: hits.length, allowed };
}

module.exports = {
  AS_OF, REGISTRY, LIVE, RATE, EXEC, DECK, ASK, CAPABILITY, DEMO, AGENDA,
  FAQ_IDS, FAQ_RESERVED, OPEN_FLAGS,
  assertRegistryGated, assertOneAsk, assertNoOpenAI,
};
