/**
 * Facts for the eight ungrouped Agent Factory tickets closed out on 2026-11-28.
 *
 * ONE data module for sixteen PDFs (a visual and a document per ticket), so a number printed on
 * a one-page visual cannot drift from the same number in the document beside it.
 *
 * ## Where these eight came from
 *
 * The 27 Nov audit of this list read the eleven GROUPS and nothing else: 98 of the 125 todos.
 * The 27 ungrouped todos were never looked at, and 14 of them were open. These eight are the
 * ones that audit would have closed. That the first pass reported "25 open" when the real
 * figure was 39 is recorded on every artifact here, because an audit that miscounted its own
 * scope has to say so before it asks anyone to trust its verdicts.
 *
 * ## Everything below was MEASURED, not recalled
 *
 *   - production counts, by SELECT against accelerator_prod on 2026-11-28
 *   - code state, by `git show origin/main:<path>` and `git grep origin/main`
 *   - deployed state, by grepping the bundle the running nginx container actually serves
 *   - merge state, by `gh pr view`, never by a ticket's own comment claiming a merge
 *
 * ## The honest common thread
 *
 * Six of these eight were ALREADY FIXED before this audit looked, and one of them (AF12.20) was
 * fixed within hours of its own ticket being written. So the thing these eight demonstrate is
 * not that eight problems were solved this week. It is that the list lagged the system, and
 * builders were told things about their own work that had stopped being true. That is drawn on
 * every visual rather than left in a footnote.
 */

/**
 * Measured in accelerator_prod on 2026-11-28. The spine of every artifact in this set.
 *
 * These six are chosen because they are what a builder is actually waiting on. A reader who sees
 * eight closed tickets will conclude the program is moving; these counts are the correction.
 */
const STATE = [
  ['Capabilities described', 391, 'ok'],
  ['Step 0.1 candidate rows', 0, 'bad'],
  ['Build authorizations', 0, 'bad'],
  ['Change requests decided', 0, 'bad'],
  ['Ladder rungs credited', 6, 'watch'],
  ['Program artifacts stored', 0, 'bad'],
];

/** The audit's own coverage, stated because the first pass got it wrong. */
const COVERAGE = [
  ['Todos on this list', 125],
  ['Read by the 27 Nov pass', 98],
  ['Ungrouped, never read', 27],
  ['Of those, open', 14],
  ['Closing today', 8],
  ['Keeping, defect confirmed', 6],
];

/** Filed today out of what this audit found. Named on every artifact so neither gets lost. */
const NEW_TICKETS = [
  ['AF12.21', 10554173053, 'A ladder rung is marked started on no evidence, so a board cannot say which step a builder is on'],
  ['AF12.22', 10554173061, 'A builder evidence channel the grader never reads, so doing as instructed does not get credited'],
];

/** The six tickets staying open, with the measurement that keeps them open. */
const KEEPING = [
  ['AF12.6', 'Host nginx config outside git', 'No host site config and no installer anywhere in the repo'],
  ['AF12.9', 'Artifact pipeline has never received a document', 'The one mechanism that reads a builder repo is left off by an unset flag'],
  ['AF12.11', 'Build authorization cannot be granted or enforced', 'No INSERT into that table anywhere in the repo, and no model'],
  ['AF12.14', 'No way to file a defect outside your own domain', 'One write path, still ownership-gated; the new channel has no decider'],
  ['Standup', 'Opening a page convenes a real standup', 'The POST is still inside the mount batch'],
  ['Step 0.1', 'Candidate list has no screen to write to', 'builderPathApi exports one GET and a string helper'],
];

const MEASURED_ON = '28 Nov 2026';
const BUCKET = 7463955;

const TICKETS = {
  af127: {
    code: 'AF12.7',
    id: 10477835221,
    slug: 'AF127_LADDER_IN_PLAN',
    headline: 'Every board story is now in the plan the verifier reads',
    settledBy: 'Republish tool PR #3755 merged 9 Nov, run to v3 on 22 Nov',
    asked: 'Asked: the published plan must carry the rung ids the ladder created, so that a commit '
      + 'naming a rung can verify, and a rung nobody pushed still cannot.',
    delivered: 'Delivered: all ten plans are at v3 and the plan gap measures zero on every board. '
      + 'Six rungs have since been credited by the pipeline, which is the positive proof this '
      + 'ticket was held open waiting for.',
    kpi: [
      ['0', 'Board ids absent from the plan', 'good'],
      ['598', 'Board stories across ten boards', 'good'],
      ['6', 'Rungs credited by the pipeline', 'good'],
      ['10', 'Plans at v3', 'good'],
    ],
    shipped: [
      ['domainPlanRepublish.js', 'The republish tool, with a gate that can refuse a run rather than half-apply it'],
      ['storyCommitMatcher (verifyDecision.ts)', 'The longest-match guard that stops a rung commit also crediting its base story, shipped first because the republish is what would have made that collision reachable'],
      ['The 22 Nov run itself', 'One domain at a time, smallest first, hard abort on any refusal or any non-zero removal'],
      ['Every prior plan version retained', 'Each domain reads published 1, superseded 2, so the run is recoverable rather than destructive'],
    ],
    evidence: [
      ['Board story ids not present in the published plan', '0 on all ten boards', true],
      ['Published plan version', 'v3 on all ten, 22 Nov', true],
      ['Rung ids inside each published plan', '7 on all ten', true],
      ['Rungs complete AND pipeline-verified', '6, dated 17 to 25 Nov', true],
      ['Negative control: an unpushed rung credited', '0 rows', true],
      ['Board stories matching plan story count', '598 and 598', true],
    ],
    ladder: [
      ['Tool merged', true, 'PR 3755, 9 Nov'],
      ['Republish run', true, 'Ten domains to v3, 22 Nov'],
      ['Plan gap closed', true, '0 absent ids, measured today'],
      ['A pushed rung verifies', true, '6 credited by the repo pipeline'],
      ['True for every builder', false, 'Only platform and admissions so far'],
    ],
    notEstablished: [
      'Only two of the ten boards hold a credited rung. The acceptance is proved, but on two builders rather than seven.',
      'The 22 Nov note on this ticket said all 70 ladder stories were not_started, so the positive half could not be shown. admissions L1-BY-HAND had in fact been verified on 17 Nov, five days earlier. The ticket was held open against a number that was already wrong.',
      'Crediting a rung still requires a commit in the builder own repo naming the full rung id. Nothing else counts, which is filed today as AF12.22.',
    ],
  },

  af128: {
    code: 'AF12.8',
    id: 10477835231,
    slug: 'AF128_DIRECTIVE_POSTURE',
    headline: 'An agent now says whether its directives are in force, derived from the wiring',
    settledBy: 'PR #3762 merged 8 Nov, in the running image since 9 Nov',
    asked: 'Asked: for any agent, a person can see whether its directives are enforced or '
      + 'advisory, and that answer is derived from the runtime rather than asserted.',
    delivered: 'Delivered: describeDirectivePosture reads the prompt wiring and answers advisory '
      + 'for all ten, with the reason carried as data. A pill on the agent page shows it, and a '
      + 'test that reads the prompt-builder sources fails if the wiring drifts.',
    kpi: [
      ['10', 'Agents given a posture', 'good'],
      ['2', 'With own-runtime injection', 'watch'],
      ['0', 'Directive rows in production', 'watch'],
      ['1', 'Test that reads the source', 'good'],
    ],
    shipped: [
      ['directivePosture.ts', 'describeDirectivePosture, deriving the answer from the same identity resolvers the prompt builders use rather than from a list of names'],
      ['managerDirectiveController.ts', 'Returns the posture beside the directive list, because the list alone cannot answer whether a directive is in force'],
      ['AgentTrustControlDirectives.tsx', 'Renders the advisory or enforced pill, the reason, and which runtime it does not reach'],
      ['__tests__/directivePosture.test.ts', 'Reads the prompt-builder sources and fails on drift, so the claim cannot quietly become false'],
    ],
    evidence: [
      ['describeDirectivePosture on main', 'directivePosture.ts:117', true],
      ['Derived from resolvers, not a name list', 'directivePosture.ts:46-48, 84-87', true],
      ['Surface renders advisory or enforced', 'AgentTrustControlDirectives.tsx:73-87', true],
      ['Guarded by a source-reading test', 'directivePosture.test.ts:96', true],
      ['Code in the running production image', 'Merged 8 Nov, image built 9 Nov', true],
      ['manager_directives rows in production', '0', false],
    ],
    ladder: [
      ['Built', true, 'Pure module plus a drift test'],
      ['Merged', true, 'PR 3762, 8 Nov'],
      ['Deployed', true, 'In the 9 Nov image'],
      ['Answer is honest', true, 'Advisory for all ten'],
      ['Exercised in production', false, 'Zero directive rows exist'],
    ],
    notEstablished: [
      'manager_directives holds zero rows, so no directive has ever been recorded in production. The posture is honest and currently has nothing to describe.',
      'The ticket premise was half wrong and the fix says so in its own header: directives DO reach all ten agents through the manager conversation. Only the own-reply runtime is limited, and Maya is the one live runtime that does not inject.',
      'The answer is advisory for every agent. That is an honest label, not an enforcement feature. Enforcing directives remains undone and unticketed.',
    ],
  },

  af1213: {
    code: 'AF12.13',
    id: 10496564219,
    slug: 'AF1213_IN_PROGRESS',
    headline: 'A builder with work in flight no longer reads as a zero',
    settledBy: 'PR #3829 merged 10 Nov',
    asked: 'Asked: after a verification run over a project with work in flight, in_progress is '
      + 'greater than zero, and complete-without-verified stays at zero.',
    delivered: 'Delivered: in_progress reads 308 where it was 0 for the life of the system. The '
      + 'second half reads 24 rather than 0, and all 24 are August rows on a project outside this '
      + 'program, so they are not produced by the new path.',
    kpi: [
      ['308', 'Rows now in_progress', 'good'],
      ['0', 'For the life of the system before', 'good'],
      ['24', 'Complete without verified_at', 'warn'],
      ['0', 'Of those on an agent board', 'good'],
    ],
    shipped: [
      ['boardStatus.ts', 'A new pure module deciding the status a story should carry, with complete unreachable from it by type and by test'],
      ['buildVerificationService.ts', 'Two hunks at the single StudentTask.update call site, so the rollup figure and the board figure come from one decision'],
      ['Six unit tests', 'Covering the transition and the refusal to write complete'],
      ['No schema change', 'The enum already accepted in_progress and the settable list already permitted it; nothing had ever called it'],
    ],
    evidence: [
      ['student_tasks rows in_progress', '308', true],
      ['in_progress before this fix', '0 rows, every project, every builder', true],
      ['Complete with verified_at NULL', '24 rows', false],
      ['Those 24 on an agent-domain board', '0 of 24', true],
      ['When those 24 were last written', '13 Aug 2026, a single project', true],
      ['complete reachable from the new path', 'No, by type and by test', true],
    ],
    ladder: [
      ['Built', true, 'Pure module, six tests'],
      ['Merged', true, 'PR 3829, 10 Nov'],
      ['Deployed', true, 'Writing in production now'],
      ['Acceptance, first half', true, '308 rows where there were 0'],
      ['Acceptance, second half', false, 'Reads 24, all of them legacy'],
    ],
    notEstablished: [
      'The literal second metric reads 24, not 0. All 24 sit on one non-agent-domain project and were last written on 13 Aug, three months before this fix. The metric is met for the surface this ticket is about and is not met word for word, and that is the honest statement of it.',
      'Writing in_progress has a consequence this ticket did not foresee. On a capability ladder it overwrites the one-rung-open invariant the ladder lift sets, so a board can report every rung as started. Filed today as AF12.21.',
      'Nobody has confirmed on a screen that a builder mid-flight now reads correctly. The column moved; the reading of it is unobserved.',
    ],
  },

  af1217: {
    code: 'AF12.17',
    id: 10536135522,
    slug: 'AF1217_LEAVE_VIEW_AS',
    headline: 'A withheld room now says what to do instead of naming what you already are',
    settledBy: 'PR #4335 merged 22 Nov, deployed and confirmed in the served bundle',
    asked: 'Asked: a chip beside a padlock must not read as a denial of access when the room is '
      + 'open and the only obstacle is the view-as session the reader is already in.',
    delivered: 'Delivered: the side-panel row reads Leave view-as and the door plate reads LEAVE '
      + 'VIEW-AS, so the label names the one action that makes the room openable. The shared '
      + 'reason string and the accessible title were deliberately left alone.',
    kpi: [
      ['2', 'Served files carrying the new string', 'good'],
      ['0', 'HQ components carrying the old one', 'good'],
      ['1', 'Reason string, left unchanged', 'good'],
      ['2', 'Chip assertions updated', 'good'],
    ],
    shipped: [
      ['HqPanel.tsx', 'The side-panel row now reads Leave view-as'],
      ['HqInside.tsx', 'The door plate now reads LEAVE VIEW-AS'],
      ['mgmtBridgeGate.ts', 'Untouched on purpose, so the title and the accessible name keep saying why the bridge is blocked'],
      ['hqRoomLinkViewAs.test.tsx', 'Chip assertions moved to the new strings; the title assertion pinned to the unchanged reason'],
    ],
    evidence: [
      ['Side-panel row on main', 'HqPanel.tsx:69', true],
      ['Door plate on main', 'HqInside.tsx:92', true],
      ['Old string left in the HQ components', '0 occurrences', true],
      ['Shared reason string', 'mgmtBridgeGate.ts:54, unchanged', true],
      ['Accessible title unchanged', 'Asserted, hqRoomLinkViewAs.test.tsx:199-200', true],
      ['In the bundle production serves', 'LEAVE VIEW-AS in 2 files, today', true],
    ],
    ladder: [
      ['Built', true, 'Two components, assertions updated'],
      ['Merged', true, 'PR 4335, 22 Nov'],
      ['Deployed', true, 'Marker moved 0 to 2 in the bundle'],
      ['Still true today', true, 'Re-measured 28 Nov, still 2'],
      ['Read by a builder', false, 'Not observed on anyone screen'],
    ],
    notEstablished: [
      'One Viewing as survives, on the read-only ribbon, and that is correct. A ribbon should name the state the viewer is in; the defect was a chip beside a padlock doing the same thing in the same red.',
      'No builder has confirmed the new label on their own screen. The string is in the bundle production serves, which is not the same as somebody having read it.',
      'The underlying bridge block is unchanged and deliberate. This fixed the label, not the behavior.',
    ],
  },

  af1218: {
    code: 'AF12.18',
    id: 10536228101,
    slug: 'AF1218_VIEW_AS_ACCESS',
    headline: 'A view-as session can now see what the person it is viewing can reach',
    settledBy: 'PR #4346 merged 23 Nov',
    asked: 'Asked: while viewing as somebody, show what they can reach in admin. The literal '
      + 'request needed a read-only admin session, which does not exist and was refused in October.',
    delivered: 'Delivered: the question under the request, who can reach what, answered with '
      + 'nothing minted. A pure module turns a section list into the sidebar it resolves to, a '
      + 'dialog renders it, and the read-only banner opens it.',
    kpi: [
      ['30', 'New tests', 'good'],
      ['0', 'Links out of the panel', 'good'],
      ['8', 'Section sets in the agreement test', 'good'],
      ['0', 'New token classes invented', 'good'],
    ],
    shipped: [
      ['viewAsAccess.ts', 'The pure rule: a section list in, the admin sidebar it resolves to out'],
      ['ViewAsAccessPanel.tsx', 'The dialog, rendered outside the banner aria-live region so it is entered rather than announced as a status update'],
      ['ReadOnlyBanner.tsx', 'The button lives on the banner, the one element on screen for exactly as long as the view-as session lasts'],
      ['The agreement test', 'Asserts the rule agrees with the sidebar own visibleNavGroups across eight section sets, because the access rule is now written twice and that duplication is held shut by a failing test'],
    ],
    evidence: [
      ['Pure module on main', 'viewAsAccess.ts:110', true],
      ['Dialog renders it', 'ViewAsAccessPanel.tsx:92, role=dialog', true],
      ['Banner button', 'ReadOnlyBanner.tsx:64-76', true],
      ['Any href inside the panel', '0, asserted at viewAsAccessPanel.test.tsx:107', true],
      ['Agrees with the live sidebar', 'Asserted across eight section sets', true],
      ['Read-only admin session invented', 'No', true],
    ],
    ladder: [
      ['Built', true, 'Pure module, dialog, banner button'],
      ['Merged', true, 'PR 4346, 23 Nov'],
      ['Deployed', true, 'On main since 23 Nov'],
      ['Tested', true, '30 tests, two files'],
      ['Opened in a real session', false, 'Not observed on production'],
    ],
    notEstablished: [
      'The literal request, her admin pages as she sees them, was not built and was not meant to be. The admin surface has no read-only mode, and inventing one means teaching every admin page a new token class.',
      'Nobody has opened the panel in a real view-as session on production. It is merged and tested, not observed.',
      'The panel deliberately offers no way through to the admin surface, so it answers the question without becoming a second bridge.',
    ],
  },

  af1219: {
    code: 'AF12.19',
    id: 10536327768,
    slug: 'AF1219_EMPTY_SECTIONS',
    headline: 'Twelve sections that can never fill no longer drown the one that works',
    settledBy: 'PR #4350 merged 23 Nov, live in the served bundle',
    asked: 'Asked: a board showing thirteen sections of which twelve read 0 of 0 pictures work '
      + 'that went missing. An outline row is a filter, and a row that filters to nothing is a '
      + 'dead control.',
    delivered: 'Delivered: sections holding no work collapse behind a counted disclosure, default '
      + 'closed, hidden rather than deleted. The marker is in the bundle production serves, '
      + 'measured today rather than inferred from the merge.',
    kpi: [
      ['13', 'Sections per board', 'good'],
      ['12', 'That can never hold work', 'watch'],
      ['1', 'That holds all of it', 'good'],
      ['10', 'Boards, all identical', 'good'],
    ],
    shipped: [
      ['outlineSections.ts', 'The split, judged purely on whether a section holds any task and never on its name'],
      ['ProjectInterior.tsx', 'Renders the filled sections, then a counted disclosure for the rest, closed by default'],
      ['17 new tests', 'Run with no DOM against a fixture shaped like a real board, because the shape IS the bug: thirteen sections, twelve empty'],
      ['Hidden, not deleted', 'A promotion needs its rung to exist, so the rows survive behind the disclosure'],
    ],
    evidence: [
      ['Sections per agent-domain board', '13 on all ten', true],
      ['Empty sections per board', '12 on all ten', true],
      ['Hide rule on main', 'outlineSections.ts:53-58, zero tasks only', true],
      ['Default closed', 'ProjectInterior.tsx:159', true],
      ['Test fixture uses the real section name', 'outlineEmpty.test.tsx:40', true],
      ['Marker in the bundle production serves', 'Present, measured 28 Nov', true],
    ],
    ladder: [
      ['Built', true, '17 tests, pure rule plus component'],
      ['Merged', true, 'PR 4350, 23 Nov'],
      ['Deployed', true, 'Marker present in the served bundle'],
      ['Covers the reported section', true, 'Its own fixture uses that exact name'],
      ['Builder sighting reproduced', false, 'Not independently reproduced'],
    ],
    notEstablished: [
      'A builder reported that section visible on 27 Nov, four days after the merge. The fix is live and its own test asserts that exact section is hidden by default, so the sighting is consistent with the disclosure having been opened and the row then selected. That was not independently reproduced, and this ticket closes on the acceptance rather than on her screen.',
      'The rows are hidden and not deleted, on purpose. So the section remains reachable and still says it holds nothing, which is correct behavior and will look like the original complaint to anyone who opens it.',
      'Twelve of thirteen sections are still permanently empty. This made the board readable; it did not change why twelve rows can never fill.',
    ],
  },

  af1220: {
    code: 'AF12.20',
    id: 10537952853,
    slug: 'AF1220_STEP1_CREDITED',
    headline: 'The step 1 this ticket said was ignored had already been credited',
    settledBy: 'Closed on measured production state, not on a code change',
    asked: 'Asked: establish why a builder finished step 1 on 14 Nov and his board still read '
      + 'in_progress with no verified_at, and whether a capability-record citation counts as '
      + 'evidence or whether L1 stories are not looked at.',
    delivered: 'Delivered: the rung is complete and was verified at 16:22 UTC on 23 Nov by the '
      + 'repo pipeline, hours after this ticket was filed. The diagnosis it asked for is also '
      + 'answered, and the answer outlives the fix.',
    kpi: [
      ['23 Nov', 'When the rung was credited', 'good'],
      ['4', 'Rungs credited on that board', 'good'],
      ['1', 'Writer of verified_at in the repo', 'good'],
      ['0', 'Capability files the verifier reads', 'warn'],
    ],
    shipped: [
      ['No code change', 'This ticket closes on measurement. The rung was credited by the existing pipeline, so nothing needed building'],
      ['The diagnosis', 'markTaskVerifiedComplete is the only statement writing verified_at, with two callers: the repo verifier and the unrelated demo-prep path'],
      ['The evidence universe', 'Ticks in the builder own .colaberry/progress.json, a commit naming the full story id and changing a file, and the repo tree as negative evidence only'],
      ['No rung filter exists', 'The verifier judges whatever ids the published plan carries, with no story_kind filter and no L0 or L1 special case, so the second hypothesis is ruled out on code'],
    ],
    evidence: [
      ['platform L1-BY-HAND status', 'complete', true],
      ['Its verified_at', '23 Nov 2026 16:22:11 UTC', true],
      ['Its verified_by', 'build_pipeline:repo_verification', true],
      ['Rungs credited on that board', '4 of 7', true],
      ['Writers of student_tasks.verified_at', '1 statement, 2 callers', true],
      ['Capability JSON as a verifier input', 'Not an input at any level', false],
    ],
    ladder: [
      ['Diagnosed', true, 'Hypothesis (a) confirmed, (b) ruled out on code'],
      ['Rung credited', true, '23 Nov 16:22 UTC, by the pipeline'],
      ['Builder told', false, 'He was told the opposite'],
      ['Root cause ticketed', true, 'Filed today as AF12.22'],
      ['Fixed for every rung', false, 'That is AF12.22, not this'],
    ],
    notEstablished: [
      'The rung was credited by a commit in the builder own repo, not by the run-log citations in our capability file. The verifier reads his repository and never ours, so those citations were never evidence and crediting them was never going to happen.',
      'The diagnosis outlives this ticket. A capability-record citation is not in the evidence universe at all, and the L1 acceptance text asks for a run log that lives nowhere the grader looks. Filed separately as AF12.22 because it affects every rung and every builder.',
      'This ticket told a builder his best piece of work was uncredited at a moment when the pipeline had already credited it. That is a reporting failure, and closing the ticket does not undo having said it.',
    ],
  },

  fleet: {
    code: 'Fleet tab',
    id: 10539491014,
    slug: 'FLEET_TAB_PHASE1',
    headline: 'The Fleet tab answers what is running and whether it is alive',
    settledBy: 'PR #4376 merged 23 Nov, deployed and proved from the running system',
    asked: 'Asked: build phase 1 of the seven-tab Platform Operations page from the downloaded '
      + 'design template, reads only, answering what is running and is it alive.',
    delivered: 'Delivered: the page is live at /admin/system/operations. Three of its four panels '
      + 'had a data source already; the fourth did not, so which timers exist is now scanned from '
      + 'the source with the TypeScript compiler, committed, and guarded by a test.',
    kpi: [
      ['122', 'Timer call sites scanned', 'good'],
      ['74', 'That report a name', 'good'],
      ['48', 'That report none', 'warn'],
      ['47', 'New backend tests', 'good'],
    ],
    shipped: [
      ['The timer scan', 'Nothing in the repo recorded which timers exist: one table says what someone wrote down, another says what reported itself, and a schedule with no registry row appears in neither'],
      ['/admin/system/operations', 'The Fleet tab, reads only, built to the measured design reference rather than to a guess'],
      ['PLATFORM_OPERATIONS_SCREENS.md', 'The seven rendered screens committed as a measured reference, so the remaining six tabs do not guess at a value'],
      ['47 backend tests', 'Plus both typechecks clean and the full frontend suite passing at 11,197'],
    ],
    evidence: [
      ['Page in the bundle nginx serves', 'Grepped inside the container', true],
      ['Route mounted', 'The API returns 401, not 404', true],
      ['Backend and frontend typecheck', '0 errors each', true],
      ['Timer scan committed and test-guarded', 'Yes', true],
      ['Images matched the commit before recreate', 'sha-f02f769be', true],
      ['Rendered in a browser as a signed-in admin', 'Not done', false],
    ],
    ladder: [
      ['Built', true, '47 tests, both typechecks clean'],
      ['Merged', true, 'PR 4376, 23 Nov'],
      ['Deployed', true, 'Images verified before recreate'],
      ['Live', true, 'Bundle, route and font proved in the container'],
      ['Seen by a signed-in admin', false, 'Needs an admin token we do not hold'],
    ],
    notEstablished: [
      'The page was never rendered in a browser as a signed-in admin. That needs an admin token this session does not hold, so everything proved is route, bundle and container level rather than visual.',
      'This is phase 1 of seven. The remaining six tabs have no ticket yet, which means the design reference is committed and the work it describes is unscheduled.',
      '48 of 122 timer call sites report no name, ten of them in one file. The fourth panel is honest about that gap rather than complete.',
    ],
  },
};

module.exports = { STATE, COVERAGE, NEW_TICKETS, KEEPING, TICKETS, MEASURED_ON, BUCKET };
