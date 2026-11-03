/**
 * L0.4, criterion 1 — the 48-point definition of done, as the traceability matrix DOC 09
 * actually specifies.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS MODULE EXISTS SEPARATELY FROM `l04Data.js`. The matrix merged on 2 November maps
 * pull requests to board tickets. That is a useful join and it is not what the ticket asks
 * for. DOC 09 of the bootstrap names nine columns — requirement, owner, Basecamp todo, repo
 * files, test/evidence, status, launch blocker, notes — and the requirement axis it means is
 * §19, the 48-point production definition of done, which opens:
 *
 *     "Colaberry Live is not complete merely because broadcast code exists."
 *
 * `l04Data.js` contains the string "48" nowhere. So criterion 1 was open, and this is it.
 *
 * WHAT CHANGED THAT MAKES AN HONEST COUNT POSSIBLE. `docs/COLABERRY_LIVE_PROGRAM_SPEC.md` §11
 * declines to give one: "an honest one is not currently obtainable", because items 1-4 and 45
 * need the Basecamp project read, 20-26 need a status report from Piyush, and 6 is a Zoom
 * setting never verified end to end. Two of those three have since moved. The board was read
 * on 2026-11-02 (all 61 todos, project 49210714) and §4.2 of the spec established precisely
 * what is and is not true about the Zoom item. Piyush's hardware is still a report nobody has
 * filed, and the seven rows that depend on it say BLOCKED rather than guessing.
 *
 * THE EVIDENCE RULE, CARRIED FORWARD FROM L0.3. A row may claim SATISFIED or PARTIAL only if
 * it names where that was found — a file, a commit, a test, or the board read. The self-check
 * refuses to render otherwise. This is the same rule that caught L0.4's first method: scanning
 * merge commits produced three confident false negatives on shipped P0s, so status here is
 * grounded in artifacts that exist rather than in messages that mention a ticket.
 *
 * THE FINDING THIS MATRIX EXISTS TO SURFACE, and the reason the requirement axis matters:
 * FOUR OF THE 48 CONDITIONS HAVE NO BASECAMP TICKET AT ALL — 17, 18, 19 and 40. Measured
 * against all 61 todos, open and done, not just the 39 open ones. A board can never show this
 * about itself; it is only visible by walking the requirement list and asking what covers each
 * item. It is the exact inverse of the L0.3 finding, where the board overstated what was left:
 * here it understates what is in scope.
 */

const META = {
  ticket: 'L0.4',
  criterion: 1,
  title: 'Traceability matrix: the 48-point definition of done',
  doc: 'DOC 09',
  date: '2026-11-03',
  session: 'CC-20261015-t6q2',
  project: '49210714',
  todo: '10393697560',
  source: 'docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md §19 (lines 1893-1950)',
  boardRead: 'Basecamp project 49210714, all 61 todos, read 2026-11-02 inside the prod backend '
    + 'container via refreshBcToken()',
};

/**
 * The nine columns DOC 09 requires, and the field each is rendered from. Declared as data so
 * the self-check can assert that every row fills every column rather than trusting the
 * renderer to notice a blank one.
 */
const COLUMNS = [
  { key: 'id', label: 'Requirement ID' },
  { key: 'req', label: 'Requirement' },
  { key: 'owner', label: 'Owner' },
  { key: 'todo', label: 'Basecamp Todo' },
  { key: 'files', label: 'Repo files' },
  { key: 'ev', label: 'Test / evidence' },
  { key: 'status', label: 'Status' },
  { key: 'blocker', label: 'Launch blocker?' },
  { key: 'notes', label: 'Notes' },
];

/**
 * The nine bands, with the ranges §11 states verbatim. The self-check asserts they tile 1-48
 * exactly, which is how a miscopied range is caught rather than quietly splitting the count.
 */
const BANDS = [
  { key: 'basecamp', label: 'Basecamp and access', from: 1, to: 4 },
  { key: 'spine', label: 'Provider spine', from: 5, to: 9 },
  { key: 'session', label: 'Session setup and participation', from: 10, to: 19 },
  { key: 'studio', label: 'Studio', from: 20, to: 23 },
  { key: 'avatar', label: 'Avatar and voice', from: 24, to: 26 },
  { key: 'distribution', label: 'Distribution and replay', from: 27, to: 30 },
  { key: 'launch', label: 'Testing and launch', from: 31, to: 36 },
  { key: 'docs', label: 'Documentation and enablement', from: 37, to: 44 },
  { key: 'artifacts', label: 'Artifacts and case study', from: 45, to: 48 },
];

/**
 * The four statuses, and what each one is allowed to mean.
 *
 * BLOCKED is deliberately not a synonym for NOT. A row is NOT when the work has not been done
 * and could be; it is BLOCKED when no amount of reading this repository or that board can
 * establish the answer — physical hardware, an external account, or an event that has to
 * happen. Collapsing the two is what produces a completion percentage that feels like progress
 * and predicts nothing.
 */
const STATUSES = {
  SATISFIED: { label: 'Satisfied', blurb: 'Met, with the evidence named in the row.',
    color: '#2f7d32', bg: '#eaf5ea' },
  PARTIAL: { label: 'Partial', blurb: 'Part of the condition is met; the row says which part is not.',
    color: '#8a5200', bg: '#fff6e8' },
  NOT: { label: 'Not met', blurb: 'Not done, and doable — no external blocker.',
    color: '#b3261e', bg: '#fdf3f2' },
  BLOCKED: { label: 'Not assessable', blurb: 'Needs hardware, an external account or a live '
    + 'event. Reading the repo cannot settle it.', color: '#1d4ed8', bg: '#eef2ff' },
};

/**
 * All 48 conditions. `req` is verbatim from §19 — the wording is the contract, so it is quoted
 * rather than paraphrased.
 *
 * `todo` is an array because DOC 09 says "one or more". An empty array is a coverage gap and
 * must appear in NO_TICKET with a reason; the self-check ties the two together so neither can
 * drift from the other.
 */
const ITEMS = [
  // ── Basecamp and access (1-4) ─────────────────────────────────────────────────────────────
  { id: 1, req: 'Basecamp Colaberry Live project exists.', owner: 'Ali',
    todo: ['L0.1'], files: 'scripts/artifacts/tickets/l03Data.js (META.project)',
    ev: 'Board read 2026-11-02: project 49210714, 10 groups, 61 todos',
    status: 'SATISFIED', blocker: false,
    notes: 'The one condition on this list that was never in doubt.' },
  { id: 2, req: 'Ali, Piyush, Sohail, and Aleem have the intended access.', owner: 'Ali',
    todo: ['L0.1', 'L1.4'], files: '—',
    ev: 'Board read 2026-11-02: all four hold assigned todos (Ali, Piyush, Sohail, Aleem)',
    status: 'PARTIAL', blocker: false,
    notes: 'Project membership is proven by assignment. The word "intended" is not: no document '
      + 'states what access each person was meant to have, so there is nothing to compare '
      + 'against. Sohail\'s YouTube console access is separately open as L1.4.' },
  { id: 3, req: 'All project docs exist and are AI-readable.', owner: 'Ali',
    todo: ['L11.8', 'L11.1', 'L11.2', 'L11.3', 'L11.4', 'L11.5', 'L11.6', 'L11.7', 'L0.4'],
    files: 'docs/COLABERRY_LIVE_TESTING_STRATEGY.md (DOC 15); this matrix (DOC 09)',
    ev: '2 of the 18 required documents (DOC 00-17) exist as canonical Markdown',
    status: 'NOT', blocker: false,
    notes: 'DOC 15 landed 2026-11-03 in PR 3619; DOC 09 is this artifact. The remaining 16 are '
      + 'L11.8 (DOC 00-08, eight of them), L11.1 (11), L11.2 (12), L11.3 (13), L11.4 (14), '
      + 'L11.6 (16), L11.7 (17). DOC 10 was delivered as a Basecamp artifact under L0.1 rather '
      + 'than as a repo document.' },
  { id: 4, req: 'Current historical work has been migrated/reconciled.', owner: 'Ali',
    todo: ['L0.1'], files: '—',
    ev: 'L0.1 closed 2026-10-17 with the published gap list',
    status: 'SATISFIED', blocker: false,
    notes: 'Satisfied as a migration event. It has since drifted again, which is item 48 rather '
      + 'than this one: L0.3 measured ten open tickets holding finished work on 2026-11-02.' },

  // ── Provider spine (5-9) ──────────────────────────────────────────────────────────────────
  { id: 5, req: 'Cloudflare Stream is live and credentialed.', owner: 'Ali',
    todo: ['L1.2', 'L1.3', 'L5.1'],
    files: 'backend/src/services/broadcast/ (Cloudflare provider adapter)',
    ev: 'L1.2 and L1.3 closed; credentials installed in the production environment',
    status: 'SATISFIED', blocker: false,
    notes: 'L1.5 asks whether the three Cloudflare accounts stay split. That is a tidiness '
      + 'question and changes no DNS, so it does not hold this item open.' },
  { id: 6, req: 'Zoom custom RTMP is verified and usable.', owner: 'Ali',
    todo: ['L1.1'], files: 'directives/go-live-colaberry-live-broadcast.md §2',
    ev: 'Spec §4.2: the 2026-10-29 airing failed because the host was signed in from something '
      + 'other than the Zoom desktop client and had no way to start the stream',
    status: 'PARTIAL', blocker: true,
    notes: 'THE CHEAPEST OPEN ITEM IN THE PROGRAM, and it gates R9 completely. L1.1 closed the '
      + 'account-level setting. Four separate things can remove the control and only one is '
      + 'that setting — the account tick, the host license and tier, the client and its '
      + 'version, and per-user scoping. The runbook now carries all four. What is missing is '
      + 'the one check that proves it: the host seeing the menu item in a throwaway meeting. '
      + 'Ten minutes of Ali\'s time, and no repository work can substitute for it.' },
  { id: 7, req: 'Zoom can feed Cloudflare.', owner: 'Ali',
    todo: ['L5.2'], files: 'backend/src/services/broadcast/broadcastInputBinding.ts',
    ev: 'L5.2 closed; two airings exist in the Cloudflare account (13 Oct, and Test 2 on 20 Oct)',
    status: 'SATISFIED', blocker: false,
    notes: 'Proven by airings that happened rather than by configuration that looks right.' },
  { id: 8, req: 'Cloudflare HLS plays in the Colaberry persistent player.', owner: 'Ali',
    todo: ['L2.2', 'L4.1'],
    files: 'frontend/src/components/portal/LiveMiniPlayer.tsx; '
      + 'frontend/src/services/broadcastPlaybackAdapter.ts',
    ev: 'L2.2 and L4.1 closed. Spec §8: the <video> is a sibling of <Outlet/> in the layout '
      + 'route, so it is the same DOM node across navigations',
    status: 'SATISFIED', blocker: false,
    notes: 'The persistence requirement is met structurally rather than by re-mounting logic, '
      + 'which is why navigation cannot restart the video.' },
  { id: 9, req: 'Signed playback works and renews.', owner: 'Ali',
    todo: ['L2.1', 'L3.3'], files: 'backend/src/services/broadcast/ (grant and renewal path)',
    ev: 'L2.1 closed ("mid-playback credential renewal"); L3.3 closed (fail-closed entitlement, '
      + 'deadline-bounded grant)',
    status: 'PARTIAL', blocker: false,
    notes: 'The renewal code exists and is tested. Spec §7 records that renewal OVER TIME is '
      + 'not separately evidenced — nobody has watched a grant expire and renew during a real '
      + 'airing. That is a Test 1 residue, not missing code.' },

  // ── Session setup and participation (10-19) ───────────────────────────────────────────────
  { id: 10, req: 'Session setup can create/prepare a Broadcast Occurrence.', owner: 'Ali',
    todo: ['L7.1', 'L5.4'],
    files: 'backend/src/services/broadcast/broadcastSessionOccurrence.ts:204; '
      + 'broadcastInputBinding.ts',
    ev: 'a72546fb; broadcastInputBinding.test.ts; BROADCAST_INPUT_STRATEGY in .env.example',
    status: 'SATISFIED', blocker: false,
    notes: 'L7.1 created occurrences that could not resolve playback; L5.4 bound them to a live '
      + 'input. Both halves are needed for this item and both are on main.' },
  { id: 11, req: 'A live workspace URL is generated/available.', owner: 'Ali',
    todo: ['L7.2'], files: 'backend/src/services/broadcast/broadcastSessionLinks.ts',
    ev: 'L7.2 closed: workspace URL, companion URL and QR at session readiness',
    status: 'SATISFIED', blocker: false,
    notes: 'The watch button on that page used to link to the page it was on; fixed 2026-10-31 '
      + 'and now pinned by a test that fails if any anchor points at its own route.' },
  { id: 12, req: 'The phone companion/QR path works.', owner: 'Aleem',
    todo: ['L4.7'],
    files: 'frontend/src/components/portal/CompanionDeck.tsx; LivePromptCard.tsx; livePulse.ts',
    ev: '97398e19; CompanionDeck.test.tsx; route portalRoutes.tsx:132',
    status: 'PARTIAL', blocker: false,
    notes: 'Built and in production — sticky player, four pulse states, exact label match on '
      + 'Following/Building/Stuck/Finished. L4.7\'s first criterion is a real phone with '
      + 'screenshots from the device, which is Aleem\'s to produce and no test can stand in for.' },
  { id: 13, req: 'Timeline moments can drive audience participation.', owner: 'Ali',
    todo: ['L7.3'], files: 'backend/src/services/classKit/runOfShow.ts; '
      + 'backend/src/services/broadcast/broadcastRundown.ts',
    ev: 'e4d0e590 (rundown + ProducerRundown.tsx); spec §8, the thirteen DOC 03 rows',
    status: 'PARTIAL', blocker: false,
    notes: 'There is no timeline RUNTIME. The run of show is static template data and the only '
      + 'cursor is slide_index in a last-write-wins row; broadcastStateMachine.ts:12 states the '
      + 'rule outright — "Time cannot publish anything." So every "the timeline drives X" '
      + 'requirement reads today as "the presenter\'s keypress drives X". Participation does '
      + 'reach the audience; a clock does not drive it.' },
  { id: 14, req: 'Polls work.', owner: 'Ali',
    todo: ['L7.3'], files: 'backend/src/db/ensureLiveSessionSchema.ts:160 (session_poll_responses); '
      + 'backend/src/services/sessionLiveStateService.ts (recordPollResponse, getPollTally)',
    ev: 'In production. UNIQUE (session_id, enrollment_id, poll_key); server-enforced '
      + 'PollLockedError to 409; guest voting via session_guest_poll_responses',
    status: 'SATISFIED', blocker: false,
    notes: 'This item was nearly built a second time on 2026-11-02, in the broadcast tree, with '
      + 'ON CONFLICT DO NOTHING instead of the production table\'s update-on-re-answer. Caught '
      + 'before commit. The real one lives outside the broadcast_* tree, which is why it reads '
      + 'as missing to anyone searching there.' },
  { id: 15, req: 'Prompt Drops work.', owner: 'Ali',
    todo: ['L7.3'], files: 'frontend/src/components/portal/LivePromptCard.tsx; CompanionDeck.tsx',
    ev: 'Spec §8, DOC 03 row 4 and DOC 04 desktop Prompt row',
    status: 'PARTIAL', blocker: false,
    notes: 'The push path and both renderings exist. Two gaps, both named in §8: a drop fires on '
      + 'slide arrival and there is no control to drop one ad hoc, and the phone renders a '
      + 'subset — ccMode and rescue reach no viewer on either phone surface.' },
  { id: 16, req: 'Builder pulse works.', owner: 'Ali',
    todo: ['L7.3'], files: 'frontend/src/components/portal/livePulse.ts; '
      + 'backend/src/db/ensureLiveSessionSchema.ts (session_pulse)',
    ev: 'Spec §8, DOC 03 row 8; CompanionDeck.tsx:50-55 wire values match the DB CHECK constraint',
    status: 'PARTIAL', blocker: false,
    notes: 'Viewers can set their pulse and the aggregate exists. It is instructor-only and has '
      + 'never been exposed to viewers, so "Builder pulse works" is true of the capture half '
      + 'and not of the room seeing itself.' },
  { id: 17, req: 'Claude pathway works.', owner: 'Ali',
    todo: [], files: 'frontend/src/components/portal/LivePromptCard.tsx (pasteWhere, ccMode, rescue)',
    ev: 'Spec §8, DOC 04 "Claude Code controls" row: PARTIAL, nothing launches anything',
    status: 'PARTIAL', blocker: false,
    notes: 'NO BASECAMP TICKET COVERS THIS. The prompt card tells a viewer which tool and which '
      + 'mode; pasteWhere and ccMode are free text authored per week ("Claude Code", "Plan '
      + 'Mode"). Guessing a destination from prose sends somebody to a chat window for a '
      + 'terminal exercise. A real launch control needs the session builder\'s tool-mode '
      + 'declaration, which requirements §9 specifies and no ticket schedules.' },
  { id: 18, req: 'Claude Code desktop pathway works.', owner: 'Ali',
    todo: [], files: 'frontend/src/components/portal/LivePromptCard.tsx',
    ev: 'Spec §8, DOC 04 phone rows: "Open in Claude" NOT BUILT; "Save Claude Code version for '
      + 'later" NOT BUILT — copy-to-clipboard is the only prompt action',
    status: 'NOT', blocker: false,
    notes: 'NO BASECAMP TICKET COVERS THIS. Distinct from item 17: 17 is knowing which tool, 18 '
      + 'is getting there from the device in your hand. Neither phone action specified in DOC 04 '
      + 'exists.' },
  { id: 19, req: 'Builder Room/community participation works at the agreed access tier.',
    owner: 'Ali', todo: [],
    files: 'frontend/src/components/portal/SessionChatPanel.tsx; '
      + 'backend/src/db/ensureLiveSessionSchema.ts (session_chat_messages)',
    ev: 'Spec §8: desktop Chat/Builder Room BUILT 2026-10-31; phone Chat NOT BUILT; access_mode '
      + 'and broadcast_series.default_access_mode recorded as declared-but-unreachable',
    status: 'PARTIAL', blocker: false,
    notes: 'NO BASECAMP TICKET COVERS THIS. L4.8 is Events and Community DISCOVERY PLACEMENTS, a '
      + 'different thing. The thread got its first reader on 2026-10-31, and giving it one '
      + 'immediately exposed two defects invisible while nothing read it: the response handed '
      + 'every classmate the author\'s enrollment_id, and limit with ORDER BY ASC returned the '
      + 'oldest hundred messages. The "agreed access tier" half is the unreachable part — '
      + 'nothing reads access_mode.' },

  // ── Studio (20-23) ────────────────────────────────────────────────────────────────────────
  { id: 20, req: 'Studio equipment is purchased and installed.', owner: 'Piyush',
    todo: ['L6.1', 'L6.2'], files: '—',
    ev: 'L6.1 closed (list researched and approved with live pricing); L6.2 open',
    status: 'BLOCKED', blocker: true,
    settledBy: 'Piyush installing the equipment and filing L6.2\'s evidence: the reviewed A/V '
      + 'sample, the lighting check, the wired network and the setup photos.',
    notes: 'Blocked on Piyush and physical hardware. L6.2 is the longest dependency chain on the '
      + 'board: it blocks L6.3, L6.4, L10.3, L10.4, L10.5 and L11.3, and no code shortens it.' },
  { id: 21, req: 'Ali camera/audio/light/network quality passes.', owner: 'Piyush',
    todo: ['L6.2'], files: '—',
    ev: 'L6.2 criteria: reviewed A/V sample, no clipping, even lighting, wired network, photos',
    status: 'BLOCKED', blocker: true,
    settledBy: 'A reviewed A/V sample from the installed studio showing no clipping, even '
      + 'lighting and a wired connection.',
    notes: 'Blocked on item 20. A quality pass needs installed equipment to assess.' },
  { id: 22, req: 'OBS setup is documented and repeatable.', owner: 'Piyush',
    todo: ['L6.3'], files: '—',
    ev: 'L6.3 criteria: five-minute two-voice recording, exported scene collection, routing diagram',
    status: 'BLOCKED', blocker: true,
    settledBy: 'L6.3\'s three artifacts: the exported OBS scene collection, the audio routing '
      + 'diagram, and a five-minute two-voice recording with no duplicate audio.',
    notes: 'Blocked on item 20 plus a second speaker in the room.' },
  { id: 23, req: 'Piyush has an operating production workflow.', owner: 'Piyush',
    todo: ['L6.3', 'L11.3'], files: '—',
    ev: 'L11.3 is the operator manual and has not started',
    status: 'BLOCKED', blocker: true,
    settledBy: 'Items 20-22, then L11.3 written and proven followable by Piyush running a show '
      + 'from it.',
    notes: 'Blocked on items 20-22. L11.3 is an operator manual for a studio that is not '
      + 'installed, and L10.3 cannot run without it.' },

  // ── Avatar and voice (24-26) ──────────────────────────────────────────────────────────────
  { id: 24, req: 'HeyGen avatar training is complete.', owner: 'Piyush',
    todo: ['L9.1', 'L9.2'], files: '—',
    ev: 'L9.1 open (verify the current official workflow on the execution date); L9.2 open',
    status: 'BLOCKED', blocker: false,
    settledBy: 'L9.1\'s sourced research first — the current official workflow, cited with URL '
      + 'and access date — then Ali recording the approved footage under L9.2 with the consent '
      + 'wording captured verbatim.',
    notes: 'L9.1 alone is writable from a desk — it is sourced research, naming the product and '
      + 'citing duration and consent from official documentation with URL and access date. The '
      + 'training itself needs Ali in front of a camera. L0.3 proposes the whole avatar group as '
      + 'the first cut: no launch test depends on it.' },
  { id: 25, req: 'Voice-AI/voice-clone training is complete if selected.', owner: 'Piyush',
    todo: ['L9.3'], files: '—', ev: 'L9.3 open: select provider, verify requirements, record, QA',
    status: 'BLOCKED', blocker: false,
    settledBy: 'Piyush naming a provider under L9.3, or a written decision not to clone a voice '
      + 'at all. Either answer closes this item; the absence of a decision is what holds it open.',
    notes: 'Conditional on a selection that has not been made, so the condition has no subject '
      + 'yet. First cut candidate; no launch test depends on it.' },
  { id: 26, req: 'AI Ali sample is reviewed.', owner: 'Ali',
    todo: ['L9.4'], files: '—',
    ev: 'L9.4 open: scored per dimension, outside reviewer, usage policy, disclosure answered',
    status: 'BLOCKED', blocker: false,
    settledBy: 'A sample scored per dimension by a reviewer outside the project, plus the Real '
      + 'Ali versus AI Ali usage policy and an answered disclosure question.',
    notes: 'Needs items 24 and 25 plus a reviewer outside the project. L9.4 blocks nothing.' },

  // ── Distribution and replay (27-30) ───────────────────────────────────────────────────────
  { id: 27, req: 'YouTube live distribution is tested.', owner: 'Sohail',
    todo: ['L1.4', 'L8.1'], files: '—',
    ev: '31a889ed shipped a release packet and rollback under L8.1 — not the simulcast proof',
    status: 'NOT', blocker: false,
    notes: 'Blocked on the YouTube channel console, which is Sohail\'s. L8.1 asks for simulcast '
      + 'proven with a real test event rather than configured and assumed, and L1.4 has to '
      + 'confirm ownership and live eligibility first.' },
  { id: 28, req: 'Replay processing works.', owner: 'Ali',
    todo: ['L8.4'], files: 'backend/src/services/broadcast/broadcastRecordingBinding.ts; '
      + 'backend/src/db/ensureBroadcastSchema.ts:153 (broadcast_source_refs UNIQUE)',
    ev: 'cf603349; broadcastPopulationService.ts; the replay list that depends on it is live',
    status: 'SATISFIED', blocker: false,
    notes: 'Resolution could not be broken without the replay listing breaking with it, which is '
      + 'the cheapest available proof that the binding resolves.' },
  { id: 29, req: 'Replay discovery/listing exists for users who should see it.', owner: 'Ali',
    todo: ['L8.3'], files: 'backend/src/services/broadcast/broadcastReplayQuery.ts; '
      + 'route broadcastRoutes.ts:100; frontend ReplaysPage via portalRoutes.tsx:181',
    ev: '5e443c17; replaysNavGate.test.ts',
    status: 'PARTIAL', blocker: false,
    notes: 'Endpoint, portal surface, entitlement filter and nav gate all exist and are tested. '
      + 'L8.3\'s third criterion is mutation evidence naming the test that fails when the filter '
      + 'is reversed — producible from this repo today, and not yet produced.' },
  { id: 30, req: 'Long-form/Shorts media handoff exists.', owner: 'Piyush',
    todo: ['L8.2'], files: 'backend/src/services/broadcast/ (clip markers); the Class Kit CSV',
    ev: 'Spec §8 finding 2: clip markers got their reader on 2026-11-01 — SessionClipList plus '
      + 'the CSV, described there as "R7\'s first brick"',
    status: 'PARTIAL', blocker: false,
    notes: 'The handoff has a first brick and not a workflow. Spec §1 records that nothing in P1 '
      + 'through P7 produces an edited long-form video, Shorts, thumbnails, titles, descriptions '
      + 'or captions, so building the seven phases to completion still does not deliver R7. '
      + 'L8.2 needs a real recording to cut.' },

  // ── Testing and launch (31-36) ────────────────────────────────────────────────────────────
  { id: 31, req: 'Failure drills are passed.', owner: 'Ali',
    todo: ['L10.4'], files: 'directives/rehearse-colaberry-live-airing-procedure.md',
    ev: 'Bootstrap §15 Test 5 lists thirteen deliberate failures; none has been exercised live',
    status: 'NOT', blocker: true,
    notes: 'Several of the thirteen now have code and tests behind them — expired grant renewal, '
      + 'fail-closed entitlement, provider timeout, auto-end. L10.4\'s criterion is that every '
      + 'failure mode is EXERCISED rather than reasoned about, so test coverage does not '
      + 'discharge it. Needs item 32 first.' },
  { id: 32, req: 'Full dress rehearsal is passed.', owner: 'Piyush',
    todo: ['L10.3'], files: '—',
    ev: 'Not run. Four dependencies, two of them the uninstalled studio and the unwritten manual',
    status: 'BLOCKED', blocker: true,
    settledBy: 'L10.3 run start to finish in the real studio, with the operator manual followed '
      + 'as written and per-segment timings recorded.',
    notes: 'Blocked on items 20-23 and 37.' },
  { id: 33, req: 'Production launch readiness report is approved.', owner: 'Ali',
    todo: ['L10.5'], files: '—', ev: 'Not produced',
    status: 'NOT', blocker: true, notes: 'Needs items 31 and 32. The report is the go/no-go.' },
  { id: 34, req: 'A real production Colaberry Live session airs.', owner: 'Ali',
    todo: ['L10.5'], files: '—',
    ev: 'Spec §4.1: the 2026-10-29 Open House was the intended first public airing and did not '
      + 'stream',
    status: 'NOT', blocker: true,
    notes: 'The item the deadline was set by. It did not happen, and §4.1 is explicit that this '
      + 'is a scheduling fact rather than a build failure — R5, R6 and R7 have not started. What '
      + 'moves is Ali\'s call.' },
  { id: 35, req: 'Replay is verified after the live.', owner: 'Ali',
    todo: ['L10.5', 'L10.6'], files: '—', ev: 'Needs item 34',
    status: 'NOT', blocker: false,
    notes: 'The code path is item 28 and is satisfied. This is the verification after a real '
      + 'airing, which has not happened.' },
  { id: 36, req: 'Analytics are verified.', owner: 'Ali',
    todo: ['L10.6', 'L4.6', 'L4.9'],
    files: 'backend/src/services/broadcast/broadcastTelemetryService.ts (readLiveAudience); '
      + 'route broadcastRoutes.ts:131; frontend LiveMiniPlayer.tsx posts beats',
    ev: '3fac2543; 2467360c; 97d20e66; broadcastTelemetryQuery.test.ts asserts the query as text; '
      + 'liveMiniPlayer.heartbeat.test.tsx asserts the call',
    status: 'PARTIAL', blocker: false,
    notes: 'Collection and the unavailable-never-zero read both exist, and the defect that made '
      + 'measurement record nothing — a player that never called the endpoint — is fixed and '
      + 'pinned by a test. Verifying the numbers needs an airing to produce some. L10.6 also '
      + 'requires every number to cite its dictionary definition.' },

  // ── Documentation and enablement (37-44) ──────────────────────────────────────────────────
  { id: 37, req: 'The operator runbook is complete.', owner: 'Piyush',
    todo: ['L11.3'], files: '—', ev: 'Not started',
    status: 'BLOCKED', blocker: true,
    settledBy: 'Item 22, then L11.3 written and walked through in the installed studio by '
      + 'somebody who did not write it.',
    notes: 'DOC 13. Blocked on item 22 — a manual has to be followable as written in the real '
      + 'studio, and the studio is not installed. L10.3 cannot run without it.' },
  { id: 38, req: 'System Architecture Handbook is complete and current.', owner: 'Ali',
    todo: ['L11.1'], files: '—', ev: 'Not started',
    status: 'NOT', blocker: false,
    notes: 'DOC 11. Writable from this repository. Needs L11.8 first so that the handbook is not '
      + 'written on top of a picture the board has already been shown to overstate.' },
  { id: 39, req: 'Required architecture diagrams are complete and rendered.', owner: 'Ali',
    todo: ['L11.2'], files: 'scripts/artifacts/ (the Mermaid rendering pipeline exists)',
    ev: 'Not started. Ten diagrams required; the tooling to render them is already in the repo',
    status: 'NOT', blocker: false,
    notes: 'DOC 12. L0.3 proposes a partial cut: the three diagrams L11.3 actually needs — '
      + 'signal path, state machine, deploy topology — against the other seven, which are for '
      + 'readers who do not exist yet.' },
  { id: 40, req: 'Ali + Piyush have a recorded walkthrough and can explain/operate the system.',
    owner: 'Ali', todo: [], files: '—',
    ev: 'No ticket; no recording. Searched all 61 todos for "walkthrough" and "recorded"',
    status: 'NOT', blocker: false,
    notes: 'NO BASECAMP TICKET COVERS THIS. L11.6 is the Ram brief and briefing session, which is '
      + 'item 44. The bootstrap §18.1 schedules a 10-15 minute walkthrough recorded FOR Ram; '
      + 'this item is Ali and Piyush being able to operate the system themselves, which is a '
      + 'different artifact and a different audience.' },
  { id: 41, req: 'Developer & AI Maintenance Runbook is complete.', owner: 'Ali',
    todo: ['L11.4'], files: 'docs/broadcast/ROLLOUT_RUNBOOK.md (partial: five operational levers)',
    ev: 'Extended 2026-11-03 from one documented lever to five (PR 3619)',
    status: 'PARTIAL', blocker: false,
    notes: 'DOC 14. The rollout runbook is a component of it, not the whole: the deploy, rollback '
      + 'and test paths all exist and are documented in pieces. L11.4\'s criterion is that it be '
      + 'readable by a future session with no chat history.' },
  { id: 42, req: 'Testing Strategy & Evidence Matrix is complete.', owner: 'Ali',
    todo: ['L11.5'], files: 'docs/COLABERRY_LIVE_TESTING_STRATEGY.md',
    ev: 'Generated from scripts/artifacts/tickets/l115Data.js; merged 2026-11-03 in PR 3619; '
      + '73 suites / 1,208 tests measured, with the command to re-derive each count',
    status: 'SATISFIED', blocker: false,
    notes: 'DOC 15, and the only one of the 48 to move to satisfied this week. It records what is '
      + 'NOT covered as a condition of rendering: the integration tier is one file behind a '
      + 'HAS_DB skip, and broadcast E2E is deliberately zero.' },
  { id: 43, req: 'Ram Executive Brief is complete.', owner: 'Ali',
    todo: ['L11.6'], files: '—', ev: 'Not started',
    status: 'NOT', blocker: false,
    notes: 'DOC 16. Needs item 39 for its diagrams. On L0.3\'s cut list — a communication '
      + 'artifact about the launch rather than an input to it.' },
  { id: 44, req: 'Ram has received a walkthrough/briefing and follow-up actions are captured.',
    owner: 'Ali', todo: ['L11.6'], files: '—', ev: 'Not scheduled',
    status: 'NOT', blocker: false, notes: 'Needs item 43.' },

  // ── Artifacts and case study (45-48) ──────────────────────────────────────────────────────
  { id: 45, req: 'Every Basecamp task has at least one required artifact.', owner: 'Ali',
    todo: ['L0.1', 'L0.4'], files: 'scripts/artifacts/tickets/ (18 Colaberry Live modules)',
    ev: 'Board read 2026-11-02 captured status, title, owner and due date for all 61 todos. '
      + 'Descriptions were NOT read: a second read was refused by the auto-mode classifier',
    status: 'BLOCKED', blocker: false,
    settledBy: 'A read of all 61 todo descriptions from inside the production backend container, '
      + 'checking each "Deliverable / artifact" section. The auto-mode classifier refused the '
      + 'second such read on 2026-11-02, so this needs Ali to authorize it or run it.',
    notes: 'The one item on this list blocked by tooling rather than by the world. Judging it '
      + 'needs every todo\'s "Deliverable / artifact" section, which means reading 61 '
      + 'descriptions from inside the production container. What can be said: every ticket this '
      + 'session worked shipped a durable artifact, and L0.3 records that nine of the ten '
      + 'built-not-marked tickets still carry their own evidence criteria.' },
  { id: 46, req: 'Case Study Source Pack is complete through first production airing.',
    owner: 'Ali', todo: ['L11.7'], files: '—', ev: 'Not started',
    status: 'NOT', blocker: false,
    notes: 'DOC 17. It was specified to be maintained DURING the build rather than written after '
      + 'it, so every week it stays open it gets more expensive, not less. L0.3 puts it on the '
      + 'cut list and says so there too — cutting it has a real cost.' },
  { id: 47, req: 'Final Colaberry Live case study has been created through the Case Study OS '
      + 'after launch.', owner: 'Ali', todo: [], files: '—',
    ev: 'Needs item 34. The Case Study OS exists as a platform capability',
    status: 'NOT', blocker: false,
    notes: 'Post-launch by construction. Not counted as a coverage gap: it is downstream of item '
      + '46 and of an airing that has not happened, so a ticket now would have nothing to do.' },
  { id: 48, req: 'Basecamp final state matches repository and production truth.', owner: 'Ali',
    todo: ['L0.1', 'L0.3', 'L0.4'],
    files: 'scripts/artifacts/tickets/l03Data.js; scripts/artifacts/tickets/l04DodData.js',
    ev: 'L0.3, 2026-11-02: ten of the 39 open tickets hold finished work, merged and in several '
      + 'cases deployed a fortnight earlier',
    status: 'NOT', blocker: false,
    notes: 'Measured, not estimated, and the board overstates what is left by about a quarter. '
      + 'The cost is not the bookkeeping — it is that every plan drawn from the board is wrong '
      + 'in the same direction. Closing this needs review states Ali sets, not code.' },
];

/**
 * The coverage gap, stated as data so the self-check can hold it against the rows.
 *
 * Item 47 is deliberately not here: its `todo` is empty because it is downstream of an airing
 * that has not happened, which is a sequencing fact rather than a missing ticket. The reason is
 * recorded per item so the distinction survives into the document.
 */
const NO_TICKET = [
  { id: 17, why: 'The Claude pathway is specified in requirements §9 and DOC 04 and scheduled '
      + 'nowhere. The nearest board item, L7.3, is the timeline and does not mention it.' },
  { id: 18, why: 'The Claude Code desktop pathway. DOC 04 names two phone actions — "Open in '
      + 'Claude" and "Save Claude Code version for later" — and neither exists or is ticketed.' },
  { id: 19, why: 'Builder Room participation AT THE AGREED ACCESS TIER. The thread exists; '
      + 'nothing reads access_mode. L4.8 is discovery placements, which is a different thing.' },
  { id: 40, why: 'The Ali and Piyush operating walkthrough. L11.6 covers the Ram briefing '
      + '(item 44); this item is the operators themselves and has no ticket.' },
];

const SEQUENCED = [47];

/** Derived, never typed. The document and the one-pager must not be able to disagree. */
const TOTALS = (() => {
  const by = {};
  Object.keys(STATUSES).forEach((k) => { by[k] = 0; });
  ITEMS.forEach((i) => { by[i.status] += 1; });
  const byBand = {};
  BANDS.forEach((b) => {
    const rows = ITEMS.filter((i) => i.id >= b.from && i.id <= b.to);
    byBand[b.key] = {
      count: rows.length,
      satisfied: rows.filter((r) => r.status === 'SATISFIED').length,
      partial: rows.filter((r) => r.status === 'PARTIAL').length,
    };
  });
  return {
    total: ITEMS.length,
    by,
    byBand,
    blockers: ITEMS.filter((i) => i.blocker).length,
    noTicket: ITEMS.filter((i) => !i.todo.length).length,
    // The honest headline. Satisfied counts only; partial is not progress toward a yes.
    satisfied: by.SATISFIED,
    assessable: ITEMS.length - by.BLOCKED,
  };
})();

module.exports = {
  META, COLUMNS, BANDS, STATUSES, ITEMS, NO_TICKET, SEQUENCED, TOTALS,
};
