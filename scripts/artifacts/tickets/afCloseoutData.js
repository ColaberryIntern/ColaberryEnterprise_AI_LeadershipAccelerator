/**
 * Facts for the five Agent Factory tickets closed out on 2026-11-27.
 *
 * ONE data module for ten PDFs (a visual and a document per ticket), so a number printed on a
 * one-page visual cannot drift from the same number in the document beside it.
 *
 * Everything below was MEASURED, not recalled:
 *   - the pipeline counts, by SELECT against accelerator_prod on 2026-11-27
 *   - the shipped files, by `git grep` against origin/main
 *   - the merge dates, by `git log` on the file each ticket claims to have delivered
 *
 * The honest common thread, and the reason these five close together: each one shipped a working
 * piece of the tool-request pipeline, and NONE of them has ever been used by a real request. That
 * is drawn on every visual rather than left in a footnote, because a reader who sees five green
 * tickets and no caveat will conclude the pipeline works.
 */

/** Measured in accelerator_prod on 2026-11-27. The spine of every one of these artifacts. */
const PIPELINE = [
  ['Capabilities described', 391, 'ok'],
  ['Capabilities confirmed', 0, 'bad'],
  ['Tool requests filed', 5, 'ok'],
  ['Tool request decisions', 0, 'bad'],
  ['Tool grants issued', 0, 'bad'],
  ['Capability instructions', 0, 'watch'],
];

/** The five requests waiting on a decision, with who filed and when. */
const REQUESTS = [
  ['executive', 'read_weekly_enrollment_counts', '18 Nov', '7 Dec', false],
  ['executive', 'read_weekly_community_activity', '18 Nov', '7 Dec', false],
  ['executive', 'compose_weekly_performance_email', '18 Nov', '7 Dec', false],
  ['platform', 'read_curriculum_health_snapshots', '23 Nov', '25 Nov', true],
  ['admissions', 'admissions_visitor_signals_reader', '25 Nov', '8 Dec', false],
];

const MEASURED_ON = '27 Nov 2026';
const BUCKET = 7463955;

/**
 * Per ticket. `ladder` is the shipping ladder with the rung honestly marked: built, merged and
 * deployed are not the same state as used.
 */
const TICKETS = {
  af109: {
    code: 'AF10.9',
    id: 10520651212,
    slug: 'AF109_LADDER_LIFT',
    headline: 'The capability ladder now sits at the top of all ten builder boards',
    asked: 'Asked: lift the ladder to the top of every board so a builder can see which rung they are on.',
    delivered: 'Delivered: applied to all ten boards in production and verified against the database, '
      + 'plus the ordering bug that would have made the move invisible.',
    merged: '27 Nov 2026', pr: 4461, sha: '25824208',
    kpi: [
      ['10', 'Boards changed', 'good'],
      ['578', 'Position changes', 'good'],
      ['36', 'Status changes', 'good'],
      ['0', 'Refused or failed', 'good'],
    ],
    shipped: [
      ['capabilityLadderLift.ts', 'Planner widened from four rungs to the seven production holds, plus a total order that breaks a tied position on story id'],
      ['liftCapabilityLadders.ts', 'The caller the planner never had: dry run by default, one transaction per board, refuses a board spanning two lists'],
      ['checkLadderLiftAgainstSnapshot.ts', 'Runs the pure planner over a read-only snapshot, so the plan was provable before the write'],
      ['projectRoutes.ts', 'The tasks ordering hoisted out of a non-separate include, where Sequelize silently ignored it'],
    ],
    evidence: [
      ['Rungs per board', '1 to 7, seven distinct positions, all ten boards', true],
      ['STORY-000 still at position 0', 'All ten boards', true],
      ['Two stories sharing a position', '0 rows', true],
      ['Open rungs per board', 'Exactly 1, all ten boards', true],
      ['Verified rows left non-complete', '0 rows', true],
      ['Second run', '10 already correct, 0 changes', true],
    ],
    ladder: [
      ['Built', true, '32 planner tests, 5 route tests'],
      ['Merged', true, 'PR 4461, 27 Nov'],
      ['Deployed', true, 'Image 47d694a6'],
      ['Applied', true, '10 boards, 0 failed'],
      ['Seen by a builder', false, 'Not yet observed'],
    ],
    notEstablished: [
      'No builder has opened their board since the write. The ordering fix is live and tested, but nobody has confirmed the new order on a real screen.',
      'On admissions, L3-TOOL-REQUEST now reads not started because L0-CHOOSE is the first uncredited rung. Kalkidan filed that tool request on 25 Nov. Nothing verified was lost, but the board disagrees with her week.',
      'The lift does not write updated_at, so it cannot be used to date builder activity.',
    ],
  },

  af1112: {
    code: 'AF11.12',
    id: 10520651106,
    slug: 'AF1112_AI_FILL',
    headline: 'The tool request writes its own first draft, and the builder edits it',
    asked: 'Asked: a button that fills the twenty-four-field request, so a builder is not typing it cold.',
    delivered: 'Delivered: a draft route, a suggest route, and both buttons on the form, with the server '
      + 'left as the only authority on completeness.',
    merged: '17 Nov 2026', pr: null, sha: '749a6cdf',
    kpi: [
      ['24', 'Fields the drafter fills', 'good'],
      ['2', 'Buttons on the form', 'good'],
      ['0', 'Requests that used it', 'warn'],
      ['5', 'Requests filed by hand', 'warn'],
    ],
    shipped: [
      ['toolRequestDraftService.ts', 'Builds the prompt FROM the filing contract, so the drafter cannot hold a second definition of a complete request'],
      ['toolRequestDraftController.ts', 'The draft and suggest endpoints'],
      ['toolRequestDraftRoutes.ts', 'Routed behind the management section gate'],
      ['ToolRequestForm.tsx', '"Draft this for me" takes the builder sentence; "Suggest one for me" proposes from the domain backlog'],
    ],
    evidence: [
      ['Draft route on main', 'toolRequestDraftRoutes.ts', true],
      ['Both buttons rendered', 'ToolRequestForm.tsx lines 474 and 483', true],
      ['Suggest needs no sentence', 'Pinned by ToolRequestForm.test.tsx', true],
      ['Draft lands editable, never auto-submitted', 'The round trip is the point', true],
      ['Requests carrying a drafted package', '0 of 5 in production', false],
    ],
    ladder: [
      ['Built', true, 'Service, controller, routes, UI'],
      ['Merged', true, '17 Nov'],
      ['Deployed', true, 'Live on main'],
      ['Used by a builder', false, '0 of 5 requests'],
    ],
    notEstablished: [
      'No request in production has been drafted by it. agent_domain_tool_request_packages holds 0 rows, so all five were filed by hand.',
      'The quality of a draft has never been judged by a builder, which is the only test that matters for this feature.',
    ],
  },

  af1114: {
    code: 'AF11.14',
    id: 10520651136,
    slug: 'AF1114_STANDING_INSTRUCTIONS',
    headline: 'An approval can now carry conditions, not just permission',
    asked: 'Asked: somewhere to write how the agent should work, attached to the capability rather than to a comment.',
    delivered: 'Delivered: instructions persisted against the capability, reachable from the governance path '
      + 'that hands an agent its grant.',
    merged: '17 Nov 2026', pr: null, sha: 'c4638492',
    kpi: [
      ['4', 'New modules', 'good'],
      ['1', 'Consumer in the grant path', 'good'],
      ['0', 'Instructions written', 'warn'],
      ['0', 'Grants to attach to', 'warn'],
    ],
    shipped: [
      ['capabilityInstructionService.ts', 'Persist, read and attribute every edit'],
      ['capabilityInstructionController.ts', 'The admin surface for writing one'],
      ['ensureCapabilityInstructionSchema.ts', 'The table, created on boot like the rest of the agent domain schema'],
      ['agentToolGovernanceService.ts', 'The consumer: the instruction travels with governance rather than being fetched separately'],
    ],
    evidence: [
      ['Instruction table exists in production', 'agent_domain_capability_instructions', true],
      ['Service consumed by the governance path', 'agentToolGovernanceService.ts', true],
      ['Every edit attributed', 'Who and when recorded', true],
      ['Instructions in production', '0 rows', false],
      ['Grants that could carry one', '0 rows', false],
    ],
    ladder: [
      ['Built', true, 'Service, controller, schema, routes'],
      ['Merged', true, '17 Nov'],
      ['Deployed', true, 'Live on main'],
      ['Carried by a real grant', false, '0 grants exist'],
    ],
    notEstablished: [
      'Zero instructions exist, because zero grants exist. The feature cannot be exercised until a capability is confirmed and a tool is granted.',
      'That an instruction actually reaches the running agent has not been observed end to end, only wired.',
    ],
  },

  af1115: {
    code: 'AF11.15',
    id: 10520651158,
    slug: 'AF1115_DUPLICATE_BOUNDARY',
    headline: 'A duplicate request is now defined, and the refusal names what it collided with',
    asked: 'Asked: state what counts as a duplicate open request, because the rule existed and its boundary did not.',
    delivered: 'Delivered: your chosen scope written into the contract header, enforced in one place, and a '
      + 'refusal that quotes the colliding request.',
    merged: '17 Nov 2026', pr: null, sha: '3b41f678',
    kpi: [
      ['1', 'Scope, stated', 'good'],
      ['1', 'Place it is enforced', 'good'],
      ['5', 'Requests filed since', 'good'],
      ['0', 'Collisions hit', 'warn'],
    ],
    shipped: [
      ['The contract header', 'Same requester, submitted, same agent, same tool name, case-insensitively, with the reason for each clause written down'],
      ['duplicateOpenRequest.test.ts', 'Pins the rule and the mapping of the refusal to the whole form rather than to a field'],
      ['The refusal text', 'Selects the colliding request, so the builder is told which one and when it was filed'],
    ],
    evidence: [
      ['Scope decided by Ali, in the ticket', 'Same requester, agent and tool name', true],
      ['Enforced in one place', 'Not duplicated across callers', true],
      ['Refusal names the collision', 'Title and filing date quoted', true],
      ['Mutation proven', 'Breaking the scope fails the test', true],
      ['Hit by a real builder', '0 of 5 requests collided', false],
    ],
    ladder: [
      ['Built', true, 'Predicate and tests'],
      ['Merged', true, '17 Nov'],
      ['Deployed', true, 'Live on main'],
      ['Exercised', false, 'No builder has filed twice'],
    ],
    notEstablished: [
      'No builder has hit the refusal. All five production requests name distinct tools, so the message a colliding builder would read has never been read.',
      'The scope chosen is the narrow one. If two builders request the same capability under different tool names, this does not catch it, and that was the deliberate choice.',
    ],
  },

  af1118: {
    code: 'AF11.18',
    id: 10521378067,
    slug: 'AF1118_CONFIRMATION_ROUTE',
    headline: 'Capability confirmation finally has an HTTP path, and the table is still empty',
    asked: 'Asked: build the route AF11.0 shipped without, so a Super Admin can confirm a capability.',
    delivered: 'Delivered: the route, merged and verified in production, with the confirmations table '
      + 'still holding zero rows.',
    merged: '17 Nov 2026', pr: null, sha: '952570fd',
    kpi: [
      ['2', 'Routes added', 'good'],
      // Not "409". A status code printed beside three counts reads as a quantity.
      ['2', 'Authorization layers', 'good'],
      ['0', 'Confirmations recorded', 'bad'],
      ['0', 'Tool grants unblocked', 'bad'],
    ],
    shipped: [
      ['capabilityConfirmationRoutes.ts', 'POST and GET on /api/admin/agent-domain-capability-confirmations, behind requireAdmin'],
      ['The Zod schema', 'Checks SHAPE only, deliberately, so the contract refusals stay reachable over HTTP instead of collapsing into a generic 400'],
      ['mgmtSectionGate.ts', 'One row, so the section gate admits the route'],
      ['capabilityConfirmationRoutes.access.test.ts', 'Pins the two-layer authorization'],
    ],
    evidence: [
      ['Route on main', 'capabilityConfirmationRoutes.ts', true],
      ['Authorization is two-layered', 'requireAdmin admits, the service refuses non super admin by name', true],
      ['Refusals are 409, not 403', 'The caller is authorized; the confirmation is what is refused', true],
      ['Confirmations in production', '0 rows', false],
      ['Tool grants in production', '0 rows', false],
    ],
    ladder: [
      ['Built', true, 'Routes, schema, gate, tests'],
      ['Merged', true, '17 Nov'],
      ['Deployed', true, 'Verified in production'],
      ['Called successfully', false, '0 confirmations'],
    ],
    notEstablished: [
      'The route works and has never confirmed anything. Every tool grant in the system is still refused as capability_not_confirmed.',
      'The reason is not technical. AF6.3, which decides how a capability leaves draft and who may confirm it, has not been decided, so there is no process for a Super Admin to follow.',
    ],
  },
};

module.exports = { TICKETS, PIPELINE, REQUESTS, MEASURED_ON, BUCKET };
