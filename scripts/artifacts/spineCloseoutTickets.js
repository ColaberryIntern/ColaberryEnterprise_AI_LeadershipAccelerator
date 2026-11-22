/**
 * The 23 closable spine tickets, each with what it asked, what shipped, and where its evidence is.
 *
 * ## Why this is data and not prose in a script
 *
 * Every row here is checked against `state-ledger.json` before anything renders: the code, the id
 * and the disposition must agree with the ledger, which is itself checked against a live Basecamp
 * read. A nine-digit to-do id is not verifiable by eye, and this project has already attached six
 * artifacts to six wrong ids written from memory. So the id never appears twice.
 *
 * ## The 24th ticket is deliberately absent
 *
 * Morning Five (`10501226498`) is NOT here. Its done-when is a registry entry that starts a
 * recurring outbound email, and that entry was deliberately not added inside an unreviewed
 * branch. Closing it would claim a send that does not exist. It stays open with its document
 * attached, which is a different act and is recorded as one.
 *
 * `evidence` is a path relative to the repo root, or `{ sessionTask }` to slice this session's log
 * entry for that task. Either way the document is one that already exists: a ticket artifact
 * invented for the ticket is a summary of itself.
 */

const PR = 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4311';

/** Built, tested and on an open PR. NOT merged, NOT deployed, NOT production-verified. */
const RUNG = 'Built and tested, on open PR #4311. Not merged, not deployed, not production-verified.';

const TICKETS = [
  // ---------------------------------------------------------------- document updates
  {
    code: 'L0.4', id: '10396175975', disposition: 'document-update',
    title: 'Acceptance matrix: LC-01 to LC-18',
    asked: 'Any LC id reaches its evidence in one hop, and every row says deployed versus activated rather than just "done".',
    shipped: 'LC-10 and LC-11 now cite the L9.7 ruling BY FILENAME and PR #3613, and read RE-SCOPED rather than anything countable as met. The status records that its L9.7 input is satisfied and that Phase 8 is what remains.',
    proof: '`releaseDocumentCurrency.test.ts`: the citation is asserted per ROW, not per document, because this table is read one line at a time. 24 of 24 mutations caught.',
    evidence: 'docs/project-lifecycle/acceptance-matrix-l04.md',
  },
  {
    code: 'L8.1', id: '10396178422', disposition: 'document-update',
    title: 'Release packet: migration order, activation control, prior SHA, rollback',
    asked: 'The exact reviewed head is identified, and the rollback is a command someone can run, not a paragraph.',
    shipped: 'The packet said "There is no migration in these two PRs". That sentence is GONE: this release adds three additive columns through `ensureConnectedDemoSchema` at boot. The reviewed head and PR #4311 are named.',
    proof: 'Asserted in BOTH directions: the new strings present AND the stale sentence absent. The packet still says it cannot close, because L7.6 was still its open input when it was written.',
    evidence: 'docs/project-lifecycle/release-packet-l81.md',
  },
  {
    code: 'L8.6', id: '10396178623', disposition: 'document-update',
    title: 'Owner testing guide: the live checks',
    asked: 'An owner can decide whether to approve without reading code, opening a log, or asking what a field means.',
    shipped: 'The guide did not contain the word demo. It now carries five checks an owner runs with no account at all, four stated limitations, and a citation of the L7.1 corpus run with the command that regenerates it.',
    proof: 'Each check asserted per numbered section rather than per document, after a mutation passed a document-wide check while one check had been rewritten to name the wrong column.',
    evidence: 'docs/project-lifecycle/owner-testing-guide.md',
  },

  // ---------------------------------------------------------------- already ruled
  {
    code: 'L4.7', id: '10396177127', disposition: 'already-ruled',
    title: 'Blocked ticket ruling',
    asked: 'A ruling in writing, so the row is neither silently open nor falsely closed.',
    shipped: 'Ruled in PR #3613 and recorded in `blocked-ticket-rulings-l47-l53-l58.md`. This change asserts that document is NOT modified, pinned by content hash.',
    proof: 'The hash is taken over newline-normalized text and is checked every run, so an edit to the ruling fails the suite and names the file.',
    evidence: 'docs/project-lifecycle/blocked-ticket-rulings-l47-l53-l58.md',
  },
  {
    code: 'L5.3', id: '10396177225', disposition: 'already-ruled',
    title: 'Blocked ticket ruling',
    asked: 'A ruling in writing, so the row is neither silently open nor falsely closed.',
    shipped: 'Ruled in PR #3613. Its approval-role limb was separately CLOSED on main in `d70d72ee3`: `assertApproverRole` compares the approving role rather than only recording it.',
    proof: 'The ruling document is pinned by content hash. The role enforcement is asserted against `lifecycleStatus.ts` and `approverRolePolicy.ts` by a test, in both directions.',
    evidence: 'docs/project-lifecycle/blocked-ticket-rulings-l47-l53-l58.md',
  },
  {
    code: 'L5.8', id: '10396177458', disposition: 'already-ruled',
    title: 'Blocked ticket ruling',
    asked: 'A ruling in writing, so the row is neither silently open nor falsely closed.',
    shipped: 'Ruled in PR #3613 and recorded. This change asserts the document is NOT modified.',
    proof: 'Content-hash pinned, checked every run.',
    evidence: 'docs/project-lifecycle/blocked-ticket-rulings-l47-l53-l58.md',
  },
  {
    code: 'L9.2', id: '10396178684', disposition: 'already-ruled',
    title: 'Phase 4 isolated review',
    asked: 'An isolated review of Phase 4, recorded.',
    shipped: 'Recorded in `phase4-isolated-review-l92.md` (PR #3613), asserted unmodified. Its central finding is quoted and ACTED ON by this change: `ensureProjectLifecycleSchema` applies its DDL warn-only, so the new `ensureConnectedDemoSchema` REJECTS instead.',
    proof: 'Content-hash pinned. The inverse behavior is asserted: the new ensure rejects on a failed statement and on a missing column.',
    evidence: 'docs/project-lifecycle/phase4-isolated-review-l92.md',
  },

  // ---------------------------------------------------------------- runs
  {
    code: 'L7.1', id: '10396178198', disposition: 'run',
    title: 'Run the reference corpus across all six stages',
    asked: 'The reference corpus, run across the stages.',
    shipped: 'All eight reference shapes run and RECORDED PER SHAPE. The ticket says six stages; the generation vocabulary is ten and a case is driven across fifteen names. Every count is read from the code, not from the ticket.',
    proof: 'The generator REFUSES to write if a shape has no outcome, a partition is incomplete, or the over-limit shape is not refused. All three guards were broken deliberately and each exits non-zero writing nothing. 93 corpus tests; 13 of 13 mutations caught.',
    evidence: { run: 'results/corpus-run-l71.md' },
  },
  {
    code: 'L7.6', id: '10396178398', disposition: 'run',
    title: 'Full gates and the independent scope-and-evidence review',
    asked: 'Every gate run, plus an independent review: a second pair of eyes, not a check that can be run.',
    shipped: 'All nine CI jobs run with the commands `ci.yml` actually uses, recorded per job. The independent review ran and FAILED the branch at 10 of 12 on two findings; both were real and both are fixed.',
    proof: 'The gate run found a failure of its own: eleven type errors in six new test files, invisible to `tsc --noEmit` because it excludes `__tests__`. The integration tier could not run locally and is stated as UNKNOWN rather than inferred.',
    evidence: { run: 'results/gates-l76.md' },
  },

  // ---------------------------------------------------------------- builds
  {
    code: 'L9.6', id: '10396178803', disposition: 'build',
    title: 'Rule on the source-overflow block',
    asked: 'Rule whether an over-budget source is blocked or clipped, and prove the ruling cannot break a build that works today.',
    shipped: 'Ruled BLOCK. `ENABLE_SBP_SOURCE_OVERFLOW_BLOCK` defaults ON, so an over-budget source is REFUSED with `SourceOverflowBlocked` rather than clipped with a label inside the prompt.',
    proof: 'Measured on production, read-only: 0 of 56 intakes and 0 of 26 understandings ever over budget. The structural margin was stated 9x too generously in a first draft and is corrected to 10,000 against 150,000. The claim is now scoped to the STUDENT path, because a second caller rides the same refusal unmeasured.',
    evidence: { sessionTask: 'L9.6: the source-overflow block turned ON' },
  },
  {
    code: 'L10.8', id: '10477776543', disposition: 'build',
    title: 'Five Herriman delivery stories fail their own contract',
    asked: 'Write the approval policies so the stories pass their own contract. Do NOT weaken the gate.',
    shipped: 'The policies are written: the bridge resolves the accountable role from the allocation and requires it to be HUMANLY HELD, reusing the existing predicate rather than a second definition.',
    proof: 'The FIRST attempt weakened the gate and a verifier measured two inputs proving it: a roster role nobody fills, and worse, an R4 task accountable only to an agent. Both now refuse, both have a test. 0 blocking issues for Herriman AND a synthetic unapproved R4 still refused.',
    evidence: { sessionTask: 'L10.8: the Herriman approval refusals' },
  },
  {
    code: 'L13.1', id: '10534179401', disposition: 'build',
    title: 'Vendor the Connected Demo kit',
    asked: 'Kit source must live in ONE place so two copies cannot drift. Every kit path must pass isAllowedPath.',
    shipped: 'Four kit files served from one generated bundle, in a fixed order so document rendering stays byte-identical across calls and shuffled inputs.',
    proof: 'A drift suite compares the bundle against the readable files byte for byte. That proved insufficient on its own and this change says so: both copies were equally wrong about the spec version, so a second suite now runs the SHIPPED bytes and validates the output against the renderer contract.',
    evidence: { sessionTask: 'STORY-900 wired into the spine' },
  },
  {
    code: 'L13.2', id: '10534179407', disposition: 'build',
    title: 'The four wiring edits',
    asked: 'renderDocs, materializeTasks, verification/storyPoints and planDocSections.',
    shipped: 'All four wired. `storyPoints` matters most: without it the task is built and pushed but never verified or paid, which is the AF3.9 gap.',
    proof: 'A directory SWEEP, not a list: every caller of `planStorySpecs` and of `renderDocs` must resolve the story from the project. A caller added later without it would otherwise render a student\'s doc away silently.',
    evidence: { sessionTask: 'STORY-900 wired into the spine' },
  },
  {
    code: 'L13.3', id: '10534179421', disposition: 'build',
    title: 'The rollout gate',
    asked: 'In the shape of the existing agentScopingEnabledFor gate. Omitted means OFF.',
    shipped: 'Three-way flag: off by default, `all`, or a CSV of enrollment ids. The WRITE decision asks the flag; the READ decision asks the board row, so turning the flag off cannot orphan a demo a student is already building.',
    proof: 'A first pass left `storyPoints` out, which would have paid `budget/(N+1)` while advertising `budget/N`. 26 of 26 mutations caught, including three that survived a first attempt.',
    evidence: { sessionTask: 'The Connected Demo rollout gate' },
  },
  {
    code: 'L13.4', id: '10534179432', disposition: 'build',
    title: 'The public share_token demo route',
    asked: 'A disabled token must 404. The page must carry a persistent visible "simulated, not live" label. Fixture data only.',
    shipped: 'One 404 body for all four negative cases, a database-level attribute allow-list, `noindex` as both a meta tag and a header, `no-store`, `no-referrer`, and the token never logged.',
    proof: 'The spec is parsed through the contract before rendering, so the route cannot serve a spec the contract refuses. `/demo/:token` is deliberately NOT registered, with the nginx escalation written down rather than assumed.',
    evidence: { sessionTask: 'The authenticated publish control' },
  },
  {
    code: 'L13.5', id: '10534179445', disposition: 'build',
    title: 'The demo link on both Command Centers',
    asked: 'A project with no demo renders "no demo yet", never a broken link.',
    shipped: 'The per-project Command Center via STORY-900 step 4, and an admin panel listing every project with three honest states.',
    proof: 'A verifier deleted BOTH panels and every suite stayed green, so mount existence is now asserted in both directions, including the failed-view case. 21 plus 17 mutations caught.',
    evidence: { sessionTask: 'The demo link on both Command Centers' },
  },
  {
    code: 'L13.6', id: '10534179458', disposition: 'build',
    title: 'The Agentic UX Trust Design Standard as a repo gate',
    asked: 'Ten weighted dimensions totalling 100, eight hard gates, five autonomy tiers, the event contract. The weighted total COMPUTED, never fabricated.',
    shipped: 'The rubric ships with the total computed from the per-dimension scores, and the artifact states plainly that this is a PROPOSED INTERNAL STANDARD, not an industry certification, and that an initial score is an assessment rather than conformance.',
    proof: 'The weights are asserted to sum to 100 and the total to be derived rather than stored, so a fabricated score fails.',
    evidence: { sessionTask: 'The Agentic UX and Trust Design Standard as a repo gate' },
  },
  {
    code: 'L13.7', id: '10534179480', disposition: 'build',
    title: 'Close the ten gaps in the demo-spec contract, in the ENGINE',
    asked: 'Universal trust timeline, structured actor identity plus responsible human, mandatory causal and evidence fields, the full action lifecycle, and generated trust and failure scenarios alongside the happy path.',
    shipped: 'Contract v2 with all of it. Actor identity is structured and carries `verified`, which is always false because a demo can verify nothing and must say so. The accountable human is required even when the actor IS a human.',
    proof: 'The generated timeline SPREADS the lifecycle: every third action fails and every fifth is reverted, so a demo always shows an action that did not complete and what was done about it. A timeline where everything succeeded is the demo the standard exists to prevent.',
    evidence: { sessionTask: 'The kit\'s authoring tool brought up to the contract' },
  },

  // ---------------------------------------------------------------- decisions
  {
    code: 'L9.7', id: '10396178831', disposition: 'decide',
    title: 'Rule on LC-10 and LC-11',
    asked: 'Rule in writing so the acceptance matrix shows a DECISION rather than a GAP.',
    shipped: 'Both rows are WITHDRAWN from the Phase 0 to 8 acceptance set and re-scoped as named follow-on work. Not satisfied, not silently open. The record rejects the three easier answers in writing and lists what would reopen each row.',
    proof: 'The record is bound to the code by a test, in both directions. That was added because the FIRST version asserted "no role is compared at approval time" and offered a git grep as proof: the grep disproves the record. The claim is retracted in writing rather than edited away.',
    evidence: 'docs/project-lifecycle/decision-l97-lc10-lc11-rescoped.md',
  },
  {
    code: 'L11.7', id: '10516239480', disposition: 'decide',
    title: 'Sweep the pre-existing stories for artifact contracts?',
    asked: 'Decide whether roughly 200 open stories are retrofitted.',
    shipped: 'The ticket\'s own recommendation stands: NO sweep. New stories carry contracts, a pre-existing story gains one when it is touched for another reason, and the boards are not audited against a contract their rows predate.',
    proof: 'Four reasons, each checkable: it changes what a student is graded on mid-build; the blast radius is four live boards at once with no staged rollout; the benefit is retrospective; and no verification run, payment dispute or student report traces back to a missing one.',
    evidence: 'docs/project-lifecycle/decision-l117-no-artifact-contract-sweep.md',
  },

  // ---------------------------------------------------------------- already merged
  {
    code: 'L11.6', id: '10516239470', disposition: 'already-merged',
    title: 'Closed out by citation',
    asked: 'The work this ticket names.',
    shipped: 'Already merged before this change. Closed out by citation, and the citation is named so the claim is checkable rather than asserted.',
    proof: 'The ledger carries the citation for every already-merged row. One row was found carrying a note and no citation, which broke the ledger\'s own rule, and it now carries one.',
    evidence: { ledgerRow: '10516239470' },
  },
  {
    code: 'L12.1', id: '10530020019', disposition: 'already-merged',
    title: 'Closed out by citation',
    asked: 'The work this ticket names.',
    shipped: 'Already merged before this change. Closed out by citation.',
    proof: 'Citation named in the ledger and checkable.',
    evidence: { ledgerRow: '10530020019' },
  },
  {
    code: 'L12.2', id: '10530022520', disposition: 'already-merged',
    title: 'Raise MAX_BRIEF_CHARS to 150,000',
    asked: 'The work this ticket names.',
    shipped: 'Already merged. It is why L9.6\'s earlier measurement was stale: the budget L9.6 is measured against is the 150,000 this ticket set.',
    proof: '`MAX_BRIEF_CHARS = 150_000` in `decomposePrompt.ts`, a file this change does not touch, so the citation is checkable in one grep.',
    evidence: { ledgerRow: '10530022520' },
  },
];

/** The one deliberately NOT closed, carried here so the omission is a record rather than a gap. */
const HELD_OPEN = {
  code: 'Morning Five', id: '10501226498',
  why: 'Its done-when is a reporting-registry entry that starts a recurring outbound email. That '
    + 'entry was deliberately NOT added inside an unreviewed branch, because the first thing a '
    + 'deploy would then do is start sending. The defaults are decided and the exact registration '
    + 'object is written down for whoever approves it. The ticket closes when that one line lands.',
  evidence: 'docs/project-lifecycle/morning-five-schedule.md',
};

module.exports = { TICKETS, HELD_OPEN, PR, RUNG };
