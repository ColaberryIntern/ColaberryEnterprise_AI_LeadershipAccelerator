/**
 * AF11.13's facts, read by BOTH the one-page visual and the completion document, so a number on
 * one cannot drift from the same number on the other.
 *
 * Every production figure here was measured on 2026-11-24 inside the running containers
 * (accelerator-backend image ghcr.io/colaberryintern/accelerator-backend:main, created
 * 2026-11-24T13:24Z; accelerator-db), not inferred from a merge date.
 */
module.exports = {
  TICKET: 'AF11.13',
  TICKET_ID: 10520651114,
  PR: 4159,
  MERGE_SHA: '559248b',
  MERGED_ON: '18 Nov 2026',
  MEASURED_ON: '24 Nov 2026',

  HEADLINE: 'AF11.13: a tool request now arrives carrying its own case',
  ASKED: 'Asked: "A request arrives finished. An agent never brings you a question. It brings you '
    + 'a decision that is already made in three different ways, and you pick one." Nothing ever '
    + 'wrote the decision package, so every request reached review with no argument and bounced.',
  DELIVERED: 'Delivered: drafting a request now drafts its decision package too, and the filing '
    + 'route accepts both in one call. The three evidence blocks are never written by the AI.',

  KPI: {
    blocksDrafted: 8,
    blocksBlocked: 3,
    packageTests: 8,
    prodPackages: 0,
    prodRequests: 4,
  },

  /** [stage, reached, evidence] */
  LADDER: [
    ['Built', true, 'drafter writes tool_request + decision_package'],
    ['Tested', true, '8 AF11.13 tests; backend suite 47,277 pass'],
    ['Merged', true, 'PR #4159, 18 Nov, 559248b'],
    ['Deployed', true, 'drafter + /draft route in the running image'],
    ['Used in prod', false, '0 packages; no request drafted yet'],
  ],

  /** The flow, as a Mermaid-free numbered chain (pure HTML, cannot render empty). */
  FLOW: [
    ['Builder', 'clicks Draft this for me, or Suggest one for me'],
    ['Drafter', 'writes the request AND the eight argument blocks'],
    ['Normalizer', 'deletes simulated_action, _against, _at whatever came back'],
    ['Filing route', 'accepts request + package in ONE call'],
    ['Readiness gate', 'says NOT READY: simulation missing, by name'],
    ['Someone runs it', 'real run fills the evidence; then it reaches Ali'],
  ],

  DRAFTED_BLOCKS: [
    'executive_summary', 'problem', 'key_findings', 'options',
    'recommendation', 'recommendation_reason', 'impact', 'risk (can break / cannot break)',
  ],
  BLOCKED_BLOCKS: ['simulated_action', 'simulated_against', 'simulated_at'],

  /** [check, result, ok] measured 24 Nov */
  VERIFIED: [
    ['toolRequestDrafter.js in the running backend', 'present', true],
    ['decision_package handled by the filing service', '5 references', true],
    ['decision_package in the drafter and its controller', 'present', true],
    ['/draft route mounted', 'present', true],
    ['Evidence-block stripping compiled in', 'simulated_action guarded', true],
    ['agent_domain_tool_request_packages rows', '0', false],
    ['Tool requests filed in production', '4 (18 Nov x3, 23 Nov x1)', true],
  ],

  /** [test, what it pins] from toolRequestDrafter.test.ts, describe('AF11.13 the decision package') */
  TESTS: [
    ['asks for every block that is argument', 'the prompt names all eight blocks'],
    ['offers only the verbs it was given', 'no invented actions'],
    ['TELLS the model not to write the evidence blocks', 'the request'],
    ['GUARANTEES it, by stripping them even when the model writes them anyway', 'the guarantee'],
    ['every blocked block is actually blocked', 'the list cannot drift from the strip'],
    ['keeps findings with their source and drops the ones with no finding', 'no orphan claims'],
    ['upper-cases option keys, so A and a are one option', 'options dedupe'],
    ['survives rubbish without inventing a package', 'bad model output files nothing'],
  ],

  CORRECTION: 'This ticket was first filed claiming AF11.8 Part One never shipped. That came from '
    + 'searching agent_domain_tool_request_details for the block names. The package is a separate '
    + 'table, agent_domain_tool_request_packages, and it had shipped in full. The real gap was '
    + 'narrower: nothing ever wrote a row into it. The ticket was corrected on 17 Nov.',

  WHY_NOT_PUT: 'The existing package PUT route is requireAdmin under the program section, and no '
    + 'builder role carries program. Attaching the package there would mean the person writing '
    + 'the request could never attach its argument, so the package travels inside the filing call.',

  PROD_GAP: 'All four tool requests in production were filed without the drafter: three on 18 Nov '
    + '(the weekly enrollment, community activity and Sunday report tools) and one on 23 Nov '
    + '(read_curriculum_health_snapshots, for Ellis). None carries a package, so all four would '
    + 'still reach review as NO_PACKAGE. The code path is live; it has not yet been exercised '
    + 'by a real builder.',

  NOT_ESTABLISHED: [
    'That a real drafted package passes its own gate in production. Zero packages exist; the '
      + 'eight narrative blocks are proven by unit tests, not by a production row.',
    'That the four existing requests get packages. They were filed by hand; nothing back-fills them.',
    'Anything about the simulation run itself. Filling the three evidence blocks is a separate '
      + 'step; AF11.17 exercises the whole pipeline once with the shared email tool.',
    'The per-capability off switch. That is AF11.16 and stays open.',
  ],
};
