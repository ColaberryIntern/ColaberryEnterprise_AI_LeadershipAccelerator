/**
 * L0.3 — the launch-risk review for Colaberry Live. One data module, two PDFs.
 *
 * WHAT MAKES THIS DIFFERENT FROM A STATUS REPORT, and it is the ticket's second acceptance
 * criterion, which asks that at-risk calls rest on progress rather than on the date alone. Every
 * due date on this board is in October and today is 2 November, so lateness-by-date classifies
 * all 39 open tickets identically and tells Ali nothing. The date is therefore recorded and
 * then ignored as a discriminator. What classifies a ticket here is WHAT IS ACTUALLY BLOCKING
 * IT, which is a different question with a much more useful answer.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * THE FINDING THIS REVIEW EXISTS TO REPORT. Ten of the 39 open tickets are open because nobody
 * marked them done, not because the work is outstanding. The code is on main, in several cases
 * for a fortnight. L0.4 (merged 2 Nov) reported this drift and UNDERCOUNTED it, because its
 * scan walked merge commits only: `git log origin/main --merges`. The health loop landed as a
 * direct commit titled "Bind the recording, publish the replay, and stop signing a dead input"
 * (cf603349) and the input binding as "L5.4: bind a new occurrence to a live input" (a72546fb)
 * — neither is a merge, so neither appeared. That is a defect in L0.4's method, stated here
 * because it changes the count Ali was given and therefore the decisions he would make from it.
 *
 * THE EVIDENCE RULE USED THROUGHOUT. A ticket is only called `shipped` when the artifacts its
 * own acceptance criteria name were found in the tree at a commit, and the `ev` field records
 * which. Commit-message scanning is explicitly NOT trusted as evidence here, for the reason
 * above: it produced a false negative on three P0s. Where an acceptance criterion demands
 * something no amount of code can supply — a real airing, a photograph of a studio, a
 * screenshot from a phone — the ticket is classified by that requirement and not by the code,
 * however complete the code is. `acLeft` names the criterion still standing.
 *
 * WHAT THIS REVIEW DOES NOT DO. It sets no review state and it closes nothing. The project's
 * rule is that a session works a ticket to a review state and stops, and Ali closes it after
 * validating the artifact — so the `shipped` column is a recommendation to look, not a claim
 * that the box may be ticked. Nine of the ten also still carry their own evidence criteria
 * (mutation records, EXPLAIN output, real-device screenshots) that only he can confirm were
 * produced to his standard.
 */

const META = {
  ticket: 'L0.3',
  title: 'Weekly launch-risk review',
  date: '2026-11-02',
  session: 'CC-20261015-t6q2',
  project: '49210714',
  todo: '10393697558',
  due: '2026-10-18',
};

/** The board's own grouping, in board order. */
const GROUPS = [
  '00 Control', '01 Prereq', '02 Spine', '03 Session', '04 Viewer',
  '05 Studio', '06 Avatar', '07 Post', '08 Docs', '09 Launch',
];

/**
 * The five things that are actually blocking work, with the color each gets on the page.
 *
 * `shipped` is first because it is the finding. `airing` is second because it is the largest
 * single blocker and one event discharges most of it.
 */
const CLASSES = {
  shipped: {
    label: 'Built, not marked',
    blurb: 'Artifacts for every criterion are on main. Open because nobody closed it.',
    color: '#2f7d32', bg: '#eaf5ea',
  },
  airing: {
    label: 'Needs a real airing',
    blurb: 'Built or not applicable; the criterion requires a live show to have happened.',
    color: '#8a5200', bg: '#fff6e8',
  },
  owner: {
    label: 'Needs a named person',
    blurb: 'Blocked on account access or physical hardware held by someone specific.',
    color: '#1d4ed8', bg: '#eef2ff',
  },
  writable: {
    label: 'Writable now',
    blurb: 'A document nobody has written. No external dependency, no hardware, no airing.',
    color: '#6b21a8', bg: '#f6effc',
  },
  decision: {
    label: 'Needs Ali to decide',
    blurb: 'Deliberately parked on a judgment rather than on work.',
    color: '#b3261e', bg: '#fdf3f2',
  },
};

/**
 * All 39 open tickets.
 *
 * `ev`  — the artifact found, and the commit it was found at. Empty when nothing was found,
 *         which is itself the evidence for `writable` and for the untouched launch tests.
 * `why` — the progress-based judgment (criterion 2). Never "the date passed".
 * `acLeft` — the acceptance criterion still standing, where one is.
 */
const TICKETS = [
  // ── 00 Control ────────────────────────────────────────────────────────────────────────────
  { id: 'L0.2', g: 0, p: 'P1', due: '2026-10-24', who: 'Ali', cls: 'writable',
    why: 'L0.1 is done, so nothing blocks it. The upkeep pass has never been run.',
    acLeft: 'Every document compared against implementation, not skimmed',
    ev: '' },
  { id: 'L0.3', g: 0, p: 'P1', due: '2026-10-18', who: 'Ali', cls: 'writable',
    why: 'This review is the artifact. Delivered by this PR; Ali sets the review state.',
    acLeft: 'Ali validates the one-pager and closes',
    ev: 'this PR: scripts/artifacts/buildL03Artifacts.js' },
  { id: 'L0.4', g: 0, p: '', due: '2026-10-30', who: 'Ali', cls: 'shipped',
    why: 'Matrix merged 2 Nov (PR 3580). Its method undercounted — see this module header.',
    acLeft: 'Whether all 48 conditions are covered, not just PR-to-ticket joins',
    ev: 'PR 3580 merged; a33b9e6a acceptance index' },

  // ── 01 Prereq ─────────────────────────────────────────────────────────────────────────────
  { id: 'L1.4', g: 1, p: 'P1', due: '2026-10-20', who: 'Sohail', cls: 'owner',
    why: 'Needs the YouTube channel console. No repo work can produce the screenshots.',
    acLeft: 'Ownership screenshot, live eligibility confirmed, test unlisted event',
    ev: '' },
  { id: 'L1.5', g: 1, p: '', due: '2026-10-24', who: 'Ali', cls: 'owner',
    why: 'Needs sight of all three Cloudflare accounts. Deliberately changes no DNS.',
    acLeft: 'Three accounts documented with admin access per account',
    ev: '' },

  // ── 02 Spine ──────────────────────────────────────────────────────────────────────────────
  { id: 'L5.3', g: 2, p: 'P0', due: '2026-10-17', who: 'Ali', cls: 'airing',
    why: 'An airing DID occur on 20 Oct — L5.4, L5.5 and L7.4 were all raised from it. '
       + 'Whether that airing satisfies THIS ticket is the open judgment.',
    acLeft: 'Three viewers on separate networks; latency recorded; flag returned to false',
    ev: 'Test 2 referenced as "FOUND BY TEST 2 (L10.1), 20 Oct 2026" in three ticket bodies' },
  { id: 'L5.4', g: 2, p: 'P0', due: '2026-10-22', who: 'Ali', cls: 'shipped',
    why: 'Resolver built, called at creation, strategy configurable, refusal path and tests all '
       + 'present. Every one of the five criteria has an artifact.',
    acLeft: 'None found outstanding',
    ev: 'a72546fb broadcastInputBinding.ts; called broadcastSessionOccurrence.ts:204; '
      + 'BROADCAST_INPUT_STRATEGY=shared in .env.example; broadcastInputBinding.test.ts' },
  { id: 'L5.5', g: 2, p: 'P0', due: '2026-10-23', who: 'Ali', cls: 'airing',
    why: 'The loop exists AND is started by the server — a wiring test asserts the call is live '
       + 'code and not a comment. Criteria 1-5 are covered by tests. Only 6 is not.',
    acLeft: '6 — verified against a real airing',
    ev: '1b9dad74 broadcastHealthPolicy.ts; cf603349 broadcastHealthRunner/Loop.ts; '
      + 'started server.ts:3541; broadcastHealthLoop.wiring.test.ts + .query.test.ts' },

  // ── 03 Session ────────────────────────────────────────────────────────────────────────────
  { id: 'L7.3', g: 3, p: 'P1', due: '2026-10-23', who: 'Ali', cls: 'airing',
    why: 'Every named surface exists: rundown, clip markers, and Prompt Drops and polls already '
       + 'reach the phone through session_broadcast to getCompanionState to CompanionDeck. '
       + 'Criteria 1 and 2 are met. The walkthrough needs a show to walk through.',
    acLeft: '3 — walkthrough recording. Plus one real gap: see the gap list',
    ev: 'e4d0e590 broadcastRundown.ts + ProducerRundown.tsx; f5eb67dd clip markers; '
      + 'CompanionDeck.tsx renders LivePromptCard + the poll card' },
  { id: 'L7.4', g: 3, p: 'P1', due: '2026-10-23', who: 'Ali', cls: 'shipped',
    why: 'Both halves are built: the End control and the auto-end timeout with hysteresis. '
       + 'The audit trail and the configurable window each have their own artifact.',
    acLeft: 'None found outstanding',
    ev: 'c6184306 broadcastAutoEndPolicy.ts; broadcastHealthRunner.autoEnd.test.ts; '
      + 'ensureBroadcastEndReasonSchema.ts; BROADCAST_AUTO_END_WINDOW_SECONDS=300' },

  // ── 04 Viewer ─────────────────────────────────────────────────────────────────────────────
  { id: 'L4.6', g: 4, p: 'P1', due: '2026-10-19', who: 'Ali', cls: 'shipped',
    why: 'Route, service and aggregation read all exist, and the SQL text is asserted so the '
       + 'DISTINCT and the freshness window cannot silently drift.',
    acLeft: '4 and 5 are evidence artifacts — mutation record and EXPLAIN — Ali confirms those',
    ev: '3fac2543 broadcastTelemetryService.ts readLiveAudience; route broadcastRoutes.ts:131; '
      + 'broadcastTelemetryQuery.test.ts asserts the query as text' },
  { id: 'L4.7', g: 4, p: 'P1', due: '2026-10-24', who: 'Aleem', cls: 'owner',
    why: 'The companion is built and in production — sticky player, four pulse states, no '
       + 'second player. Only the real-device evidence is missing.',
    acLeft: '1 — tested on a real phone, with screenshots from the device',
    ev: '97398e19 CompanionDeck.tsx + LivePromptCard.tsx + livePulse.ts; '
      + 'route portalRoutes.tsx:132; CompanionDeck.test.tsx' },
  { id: 'L4.8', g: 4, p: '', due: '2026-10-28', who: 'Ali', cls: 'decision',
    why: 'Deferred by decision, and its first criterion requires first-airing evidence that '
       + 'does not exist yet. Correctly parked.',
    acLeft: 'A decision grounded in first-airing evidence, or a written decision not to build',
    ev: '' },
  { id: 'L4.9', g: 4, p: 'P0', due: '2026-10-22', who: 'Ali', cls: 'airing',
    why: 'The missing caller now exists and criterion 5 — the test that the player actually '
       + 'CALLS the endpoint, whose absence caused the original defect — is satisfied.',
    acLeft: '6 — verified against a real airing',
    ev: '2467360c broadcastHeartbeat.ts; 97d20e66 LiveMiniPlayer.tsx posts beats; '
      + 'liveMiniPlayer.heartbeat.test.tsx asserts the call' },

  // ── 05 Studio ─────────────────────────────────────────────────────────────────────────────
  { id: 'L6.2', g: 5, p: 'P0', due: '2026-10-18', who: 'Piyush', cls: 'owner',
    why: 'Physical hardware install. Blocks L6.3, L6.4 and the dress rehearsal — the longest '
       + 'chain on the board that no code can shorten.',
    acLeft: 'Reviewed A/V sample, no clipping, even lighting, wired network, setup photos',
    ev: '' },
  { id: 'L6.3', g: 5, p: 'P0', due: '2026-10-21', who: 'Piyush', cls: 'owner',
    why: 'Needs L6.2 and a second speaker in the room. Blocks L10.3 and L11.3.',
    acLeft: 'Five-minute two-voice recording, exported scene collection, routing diagram',
    ev: '' },

  // ── 06 Avatar ─────────────────────────────────────────────────────────────────────────────
  { id: 'L9.1', g: 6, p: 'P1', due: '2026-10-19', who: 'Piyush', cls: 'writable',
    why: 'Pure sourced research — name the product, cite duration and consent from official '
       + 'docs with URL and access date. Needs no hardware and no account.',
    acLeft: 'Consent requirement captured verbatim, with URL and access date',
    ev: '' },
  { id: 'L9.2', g: 6, p: 'P1', due: '2026-10-22', who: 'Ali', cls: 'owner',
    why: 'Ali recording himself locally, after L9.1 and L6.2. Physical.',
    acLeft: 'One uninterrupted local take with consent recorded verbatim',
    ev: '' },
  { id: 'L9.3', g: 6, p: '', due: '2026-10-24', who: 'Piyush', cls: 'owner',
    why: 'Partly decidable on paper, but the QA sample has to be produced and scored.',
    acLeft: 'Separate clone decided explicitly; QA sample scored, not just produced',
    ev: '' },
  { id: 'L9.4', g: 6, p: '', due: '2026-10-26', who: 'Ali', cls: 'owner',
    why: 'Cannot start until L9.2 and L9.3 exist, and needs a reviewer outside the project.',
    acLeft: 'Scored per dimension, outside reviewer, usage policy, disclosure answered',
    ev: '' },

  // ── 07 Post ───────────────────────────────────────────────────────────────────────────────
  { id: 'L8.1', g: 7, p: 'P1', due: '2026-10-25', who: 'Sohail', cls: 'owner',
    why: 'A release packet shipped under this id (PR 3605), but the ticket asks for simulcast '
       + 'proven with a real YouTube test event. That part needs the channel.',
    acLeft: 'Simulcast proven with a real test event, not configured and assumed',
    ev: '31a889ed release packet + rollback (PR 3605) — not the simulcast proof' },
  { id: 'L8.2', g: 7, p: '', due: '2026-10-27', who: 'Piyush', cls: 'airing',
    why: 'Requires a real recording to cut. Nothing to edit until a class has aired.',
    acLeft: 'Workflow run end to end against a real recording; 5+ Shorts produced',
    ev: '' },
  { id: 'L8.3', g: 7, p: 'P1', due: '2026-10-26', who: 'Ali', cls: 'shipped',
    why: 'Endpoint AND portal surface both exist, with the entitlement filter and a nav gate '
       + 'under test. The route comment cites this ticket by id.',
    acLeft: '3 — mutation evidence naming the test that fails when the filter is reversed',
    ev: '5e443c17 broadcastReplayQuery.ts; /replays route broadcastRoutes.ts:100; '
      + 'ReplaysPage via portalRoutes.tsx:181; replaysNavGate.test.ts' },
  { id: 'L8.4', g: 7, p: '', due: '2026-10-24', who: 'Ali', cls: 'shipped',
    why: 'Recording binding and the source-ref mapping are built, and the replay list that '
       + 'depends on it is live — which it could not be if resolution were broken.',
    acLeft: 'The naming cleanup it asks for: 15 internal phase keys still say P6-01, not L8.4',
    ev: 'cf603349 broadcastRecordingBinding.ts; broadcast_source_refs UNIQUE '
      + 'ensureBroadcastSchema.ts:153; broadcastPopulationService.ts' },

  // ── 08 Docs ───────────────────────────────────────────────────────────────────────────────
  { id: 'L11.8', g: 8, p: 'P1', due: '2026-10-26', who: 'Ali', cls: 'writable',
    why: 'Head of the documentation chain — blocks L11.1, which blocks L11.2/3/4. Writable '
       + 'from the repo today. The highest-leverage unwritten document on the board.',
    acLeft: 'Eight documents; unbuilt things named explicitly rather than omitted',
    ev: '' },
  { id: 'L11.1', g: 8, p: 'P1', due: '2026-10-28', who: 'Ali', cls: 'writable',
    why: 'Needs L11.8 first. Writable from the repo once that lands.',
    acLeft: 'Every capability claim states whether it is proven by test or in production',
    ev: '' },
  { id: 'L11.2', g: 8, p: 'P1', due: '2026-10-28', who: 'Ali', cls: 'writable',
    why: 'Ten Mermaid diagrams. The repo already renders Mermaid in the artifact pipeline, so '
       + 'the tooling exists; the diagrams do not.',
    acLeft: 'Ten diagrams, Mermaid source plus rendered artifacts',
    ev: '' },
  { id: 'L11.3', g: 8, p: 'P0', due: '2026-10-29', who: 'Piyush', cls: 'owner',
    why: 'An operator manual for a studio that is not installed yet. Needs L6.3. Blocks L10.3.',
    acLeft: 'The manual, followable as written in the real studio',
    ev: '' },
  { id: 'L11.4', g: 8, p: 'P1', due: '2026-10-29', who: 'Ali', cls: 'writable',
    why: 'Needs L11.1. Writable from the repo — the deploy, rollback and test paths all exist.',
    acLeft: 'Readable by a future session with no chat history',
    ev: '' },
  { id: 'L11.5', g: 8, p: 'P1', due: '2026-10-29', who: 'Ali', cls: 'writable',
    why: 'Dependencies: none. Writable from the repo right now — 640 broadcast tests, the '
       + 'mutation records and the wiring tests are all in the tree to be cataloged.',
    acLeft: 'Testing strategy and evidence matrix',
    ev: '' },
  { id: 'L11.6', g: 8, p: 'P1', due: '2026-10-30', who: 'Ali', cls: 'writable',
    why: 'Needs L11.2 for its diagrams. Not launch-blocking.',
    acLeft: 'Ram executive brief and the briefing session',
    ev: '' },
  { id: 'L11.7', g: 8, p: '', due: '2026-10-31', who: 'Ali', cls: 'writable',
    why: 'Dependencies: none, and it was meant to be maintained DURING the build rather than '
       + 'written after it — so every week it stays open it gets harder, not easier.',
    acLeft: 'Case study source pack',
    ev: '' },

  // ── 09 Launch ─────────────────────────────────────────────────────────────────────────────
  { id: 'L10.1', g: 9, p: '', due: '2026-10-20', who: 'Ali', cls: 'airing',
    why: 'Its own body records preconditions verified on production on 18 Oct and three fixes '
       + 'deployed, and three other tickets cite findings FROM this test. It reads as a test '
       + 'that ran and was never written up.',
    acLeft: 'The write-up: real bitrate, three viewers, the two deferred defects',
    ev: 'Body states all three fixes DEPLOYED, confirmed by content in the deployed tree' },
  { id: 'L10.7', g: 9, p: 'P0', due: '2026-10-23', who: 'Ali', cls: 'airing',
    why: 'Dependencies: none, and entitlement has NEVER been exercised — not once. The '
       + 'cheapest P0 on the board and the one carrying the most risk per hour unspent.',
    acLeft: 'All seven: non-staff cohort member watches, wrong cohort refused and cannot see it',
    ev: '' },
  { id: 'L10.2', g: 9, p: 'P0', due: '2026-10-24', who: 'Ali', cls: 'airing',
    why: 'Needs L5.3 and L10.1 settled first. Should absorb L10.7 or run after it.',
    acLeft: 'Three colleagues attend; findings with severity, owner and blocking flag',
    ev: '' },
  { id: 'L10.3', g: 9, p: 'P0', due: '2026-10-28', who: 'Piyush', cls: 'airing',
    why: 'Four dependencies, two of them the uninstalled studio and the unwritten manual.',
    acLeft: 'Full show start to finish; manual followed as written; per-segment timings',
    ev: '' },
  { id: 'L10.4', g: 9, p: 'P0', due: '2026-10-29', who: 'Ali', cls: 'airing',
    why: 'Failure drills against a rehearsed show. Needs L10.3.',
    acLeft: 'Every failure mode exercised, not reasoned about; no fabricated zero',
    ev: '' },
  { id: 'L10.5', g: 9, p: 'P0', due: '2026-10-30', who: 'Ali', cls: 'airing',
    why: 'The public airing. Needs L10.3 and L10.4, and gates L10.6 and L4.8.',
    acLeft: 'Recorded go/no-go; a real public class aired; replay and analytics verified',
    ev: '' },
  { id: 'L10.6', g: 9, p: 'P1', due: '2026-10-31', who: 'Ali', cls: 'airing',
    why: 'Post-launch metrics. Needs L10.5 to have happened and L4.6 to have collected.',
    acLeft: 'Every number cites its dictionary definition; unmeasurable things stated',
    ev: '' },
];

/** Derived, never typed — the page and the document must not be able to disagree. */
const TOTALS = (() => {
  const by = {};
  Object.keys(CLASSES).forEach((k) => { by[k] = 0; });
  TICKETS.forEach((t) => { by[t.cls] += 1; });
  return {
    open: TICKETS.length,
    by,
    withEvidence: TICKETS.filter((t) => t.ev).length,
    p0: TICKETS.filter((t) => t.p === 'P0').length,
    // The headline: built work sitting in an open ticket.
    builtNotMarked: TICKETS.filter((t) => t.cls === 'shipped').length,
    // Everything one live show would unblock.
    airingGated: TICKETS.filter((t) => t.cls === 'airing').length,
  };
})();

/**
 * The cut list (criterion 3), in priority order — what to drop first if a date must hold.
 *
 * Ordered by how little the launch path depends on each item, cheapest cut first. The rule
 * applied: nothing is proposed for cutting if a launch test names it as a dependency.
 */
const CUTS = [
  { n: 1, what: 'The whole AI Avatar group (L9.1-L9.4)', saves: '4 tickets',
    why: 'No launch test depends on it and L9.4 blocks nothing. It is a parallel product '
       + 'thread that happens to live on this board.' },
  { n: 2, what: 'L4.8 Events and Community discovery placements', saves: '1 ticket',
    why: 'Already deferred by decision, and it cannot be judged before a first airing anyway.' },
  { n: 3, what: 'L11.6 Ram brief and L11.7 case study pack', saves: '2 tickets',
    why: 'Both are communication artifacts about the launch rather than inputs to it. L11.7 '
       + 'gets more expensive the longer it waits, so cutting it has a real cost — stated '
       + 'rather than hidden.' },
  { n: 4, what: 'L8.2 post-production workflow', saves: '1 ticket',
    why: 'Needed after a first airing exists to cut, not before one.' },
  { n: 5, what: 'L11.2 reduced from ten diagrams to the three L11.3 needs', saves: 'most of 1',
    why: 'A partial cut. The operator manual needs the signal path, the state machine and the '
       + 'deploy topology; the other seven are for readers who do not exist yet.' },
  { n: 6, what: 'L1.5 Cloudflare consolidation memo', saves: '1 ticket',
    why: 'Explicitly changes no DNS, so it carries no launch risk either way.' },
];

/** What must not be cut, and the one-line reason. Stated so the cut list is not read as all of it. */
const KEEP = [
  { what: 'L10.7 prove the paywall', why:
    'P0, no dependencies, and entitlement has never once been exercised. Everything else '
    + 'assumes the right people can watch and the wrong people cannot.' },
  { what: 'L6.2 and L6.3 the studio', why:
    'The longest dependency chain on the board: they block L6.4, L10.3, L10.4, L10.5 and L11.3.' },
  { what: 'L11.3 the operator manual', why: 'L10.3 cannot be run without it.' },
  { what: 'The real-airing criteria on L5.5 and L4.9', why:
    'Every defect in this subsystem so far was invisible to a passing suite and obvious within '
    + 'minutes of a live stream.' },
];

/** Risks that are not any one ticket. */
const GAPS = [
  { sev: 'bad', h: 'Ten tickets hold finished work',
    d: 'Built, merged, in several cases deployed a fortnight ago, and still open. The cost is '
     + 'not the bookkeeping — it is that the board overstates what is left by about a quarter, '
     + 'so every plan drawn from it is wrong in the same direction.' },
  { sev: 'bad', h: 'L0.4 undercounted this, and the method is why',
    d: 'It scanned merge commits only. The health loop and the input binding both landed as '
     + 'direct commits, so a scan that reads merges cannot see them. Reported here because it '
     + 'changes a number Ali has already been given.' },
  { sev: 'watch', h: 'One airing discharges nine tickets',
    d: 'Nine of the 39 are gated on a live show, including both outstanding real-airing '
     + 'criteria. No amount of engineering moves any of them.' },
  { sev: 'watch', h: 'A broadcast viewer outside the cohort gets no cue at all',
    d: 'L7.3 is satisfied for enrolled students: Prompt Drops and polls reach the phone through '
     + 'companion-state. But that route is requireParticipant plus denyIfNotInCohort, so a '
     + 'public viewer is refused 403. Widening it is a security boundary, so it is Ali\'s call '
     + 'rather than a fix to make unattended.' },
  { sev: 'watch', h: 'Fifteen internal phase keys have no board ticket',
    d: 'L8.4 records that shipped broadcast source cites fifteen phase keys like P6-01 that '
     + 'correspond to no ticket. That is the same drift seen from the other side.' },
];

module.exports = { META, GROUPS, CLASSES, TICKETS, TOTALS, CUTS, KEEP, GAPS };
