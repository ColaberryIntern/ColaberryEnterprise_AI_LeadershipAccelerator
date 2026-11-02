/**
 * L0.4 traceability matrix - the single data module behind both the visual and the document.
 *
 * WHAT THIS IS. L0.4 asks that every requirement map to a ticket and to evidence. This module
 * holds that mapping: the live Basecamp board on one side, the merged pull requests on the other,
 * and an explicit confidence on every join between them.
 *
 * WHERE EACH NUMBER COMES FROM, because a traceability matrix that cannot be audited is worth
 * nothing:
 *
 *  - BOARD and TICKETS: read live from Basecamp project 49210714, todolist 10392808012, on
 *    2026-11-02, by a GET-only script run inside the production backend container so that
 *    refreshBcToken() could reach the CCPP vault. Status, owner and due date are therefore
 *    live facts, not recollection.
 *
 *  - PRS: computed locally from git, not from recollection and not from the GitHub API. Each
 *    row is `git diff --numstat <merge>^1 <merge>` over the merge commit named in `sha`, so the
 *    file and line counts are the diff the merge actually introduced. Merge-from-main commits
 *    on the same branches are excluded; including them would have inflated one row to 951 files.
 *
 *  - MAP: authored here. `conf` is the honest part. 'stated' means the PR title names the ticket
 *    id. 'inferred' means the join is mine, made from the PR's scope against the ticket's title.
 *    'unmapped' means merged, deployed work that corresponds to no ticket on the board.
 *
 * THE LIMIT, STATED ONCE AND REPEATED IN THE ARTIFACT. Ticket DESCRIPTIONS were never read: a
 * second production read was refused by the auto-mode classifier after the first succeeded. So
 * every join below is made against a ticket's TITLE, never against its acceptance criteria. That
 * is the difference between "this PR is about the same subject as this ticket" and "this PR
 * satisfies this ticket", and only the second one justifies a review state. Nothing here closes
 * a ticket, and nothing here sets a review state.
 */

const META = {
  title: 'Colaberry Live traceability matrix',
  ticket: 'L0.4',
  date: '2026-11-02',
  session: 'CC-20261015-t6q2',
  project: 'Basecamp 49210714 - Colaberry Live',
  list: 'Colaberry Live - build to 31 Oct 2026 (10392808012)',
};

/** Per-group open/done, as read from the board. Totals asserted in build(). */
const BOARD = [
  { g: '00 Control, source of truth, governance', open: 3, done: 1 },
  { g: '01 External prerequisites and accounts', open: 2, done: 3 },
  { g: '02 Live provider spine', open: 3, done: 4 },
  { g: '03 Session, occurrence and timeline', open: 2, done: 7 },
  { g: '04 Viewer, companion and discovery', open: 4, done: 5 },
  { g: '05 Studio, equipment and OBS', open: 2, done: 2 },
  { g: '06 AI avatar and voice', open: 4, done: 0 },
  { g: '07 YouTube and post production', open: 4, done: 0 },
  { g: '08 Documentation and enablement', open: 8, done: 0 },
  { g: '09 Rehearsal, launch and evidence', open: 7, done: 0 },
];

const TOTALS = { open: 39, done: 22, all: 61 };

/**
 * The 14 merged pull requests on workstream/colaberry-live* branches, oldest first.
 * `adds` is lines added by that merge alone.
 */
const PRS = [
  { pr: 3070, sha: 'c158c29e', date: '2026-10-12', files: 93, tests: 39, adds: 17319,
    t: 'L5.1: Cloudflare Stream live playback behind the existing grant' },
  { pr: 3112, sha: 'd4bf402f', date: '2026-10-15', files: 4, tests: 1, adds: 181,
    t: 'Stop replaying the last 100 seconds on every credential renewal' },
  { pr: 3114, sha: '31d171f5', date: '2026-10-15', files: 3, tests: 1, adds: 150,
    t: 'Stop asking a health endpoint that refuses once the stream is live' },
  { pr: 3119, sha: '87584275', date: '2026-10-15', files: 4, tests: 1, adds: 128,
    t: 'Record the end instant, which nothing had ever written' },
  { pr: 3131, sha: '0d323bf9', date: '2026-10-16', files: 10, tests: 4, adds: 821,
    t: 'L4.6: heartbeat ingestion, the audience read, and its tests' },
  { pr: 3512, sha: 'b04a9934', date: '2026-10-30', files: 6, tests: 0, adds: 3113,
    t: 'Put the Colaberry Live requirements in the repo and reconcile them' },
  { pr: 3515, sha: '7aef89d7', date: '2026-10-31', files: 3, tests: 0, adds: 302,
    t: 'Make Test 2 executable, and name the QR surface the audit missed' },
  { pr: 3519, sha: '81eb51bc', date: '2026-10-31', files: 18, tests: 6, adds: 1716,
    t: 'A producer control to put a class on air, and the version token' },
  { pr: 3536, sha: '8fe6ba85', date: '2026-10-31', files: 14, tests: 5, adds: 1795,
    t: 'The desktop viewer becomes the workspace; class chat gets a reader' },
  { pr: 3540, sha: '5f83ed6f', date: '2026-10-31', files: 8, tests: 2, adds: 967,
    t: 'The class check-in page gets its first tests, and the pulse control' },
  { pr: 3547, sha: '8e0cffd8', date: '2026-11-01', files: 8, tests: 2, adds: 981,
    t: 'Producer strip: a live clock that counts past a missed start' },
  { pr: 3555, sha: 'f06df015', date: '2026-11-01', files: 8, tests: 3, adds: 544,
    t: 'Cancel this airing: say that it retires the class' },
  { pr: 3562, sha: 'db32be65', date: '2026-11-02', files: 9, tests: 2, adds: 1132,
    t: 'Clip markers get a reader, and the editor gets a file he can open' },
  { pr: 3571, sha: '40683676', date: '2026-11-02', files: 20, tests: 6, adds: 2290,
    t: 'The segment rundown, and a second class clock' },
];

/**
 * PR to ticket. `conf`: stated | inferred | unmapped. `state` is the TICKET's live status.
 * `note` says what landed and, where it matters, what the ticket still asks for.
 */
const MAP = [
  { pr: 3070, id: 'L5.1', state: 'DONE', conf: 'stated',
    note: 'Ticket id in the PR title and the ticket is closed. The only fully consistent row in the set.' },
  { pr: 3112, id: 'L2.1', state: 'DONE', conf: 'inferred',
    note: 'A defect fix inside the replay adapter L2.1 delivered. Fix landed after the ticket closed.' },
  { pr: 3114, id: 'L5.5', state: 'OPEN', conf: 'inferred',
    note: 'Touches provider health, which is L5.5 subject matter. Partial at most: L5.5 says nothing ever tells an occurrence the stream is alive, and that loop still does not exist.' },
  { pr: 3119, id: 'L7.4', state: 'OPEN', conf: 'inferred',
    note: 'Writes the end instant, a prerequisite for ending a broadcast cleanly. Not the auto-end safety net itself.' },
  { pr: 3131, id: 'L4.6', state: 'OPEN', conf: 'stated',
    note: 'THE SHARPEST GAP. The PR title names L4.6, it merged on 2026-10-16, and the ticket is still open 17 days later. Either the ticket was never marked or the PR did not finish it.' },
  { pr: 3512, id: 'L0.2', state: 'OPEN', conf: 'inferred',
    note: 'Documentation-as-code upkeep. This is also the PR where ticket ids stopped appearing in titles.' },
  { pr: 3515, id: 'L10.1', state: 'OPEN', conf: 'inferred',
    note: 'The Test 2 run sheet, which is preparation for L10.1 rather than L10.1. The airing has not been run.' },
  { pr: 3519, id: 'L7.4', state: 'OPEN', conf: 'inferred',
    note: 'The producer control half of L7.4, in production. The auto-end safety net half has no evidence in any PR.' },
  { pr: 3536, id: null, state: null, conf: 'unmapped',
    note: '14 files and 1,795 lines merged and deployed against no ticket on the board.' },
  { pr: 3540, id: null, state: null, conf: 'unmapped',
    note: '8 files and 967 lines merged and deployed against no ticket on the board.' },
  { pr: 3547, id: 'L7.4', state: 'OPEN', conf: 'inferred',
    note: 'The producer clock, part of the same producer surface as 3519.' },
  { pr: 3555, id: 'L7.4', state: 'OPEN', conf: 'inferred',
    note: 'Cancellation is a lifecycle terminal state, so it sits with ending a broadcast.' },
  { pr: 3562, id: 'L7.3', state: 'OPEN', conf: 'inferred',
    note: 'Clip markers, one of the five things L7.3 says the timeline must drive.' },
  { pr: 3571, id: 'L7.3', state: 'OPEN', conf: 'inferred',
    note: 'Segment rundown, read off the same timeline. L7.3 also covers Prompt Drops, polls and QR state, which neither PR touched.' },
];

/** The reconciliation findings, most consequential first. */
const GAPS = [
  { sev: 'bad', h: 'L7.4 holds four PRs of merged work and carries no review state',
    d: 'PRs 3119, 3519, 3547 and 3555 all land inside "end a broadcast without an engineer: producer control plus an auto-end safety net". The producer control is in production and verified. The auto-end safety net appears in no PR in this set, so the ticket is genuinely part-done - which is exactly the state a review state exists to record, and exactly the state a bare open checkbox cannot.' },
  { sev: 'bad', h: 'L4.6 was shipped under its own number and left open for 17 days',
    d: 'PR 3131, titled "L4.6", merged 2026-10-16. The ticket is still open. This is the only row where a PR states its ticket id and the ticket is not closed, which makes it the clearest single instance of the tracking breaking rather than the work.' },
  { sev: 'bad', h: 'Two PRs, 22 files and 2,762 lines, map to no ticket at all',
    d: 'PR 3536 (the desktop viewer becoming the workspace, plus a reader for class chat) and PR 3540 (the first tests for the class check-in page, plus the pulse control). Both merged, both deployed. Neither corresponds to anything on the board. This is off-board work, and it is the part a traceability matrix is supposed to make impossible.' },
  { sev: 'watch', h: 'L5.3 and L10.1 are open although a production airing happened on 2026-10-20',
    d: 'L5.3 is the first private technical airing; L10.1 is Test 2. L7.1, due 2026-10-20, is closed. So something aired. Whether these two were done and never marked, or whether the airing was not the one they describe, is a question only Ali can settle - and it is the single highest-value correction on this list, because six launch tickets sit behind them.' },
  { sev: 'watch', h: 'The drift has an exact date: PR 3512, 2026-10-30',
    d: 'Ticket ids appear in PR titles up to and including 3131 on 2026-10-16. From 3512 onward, nine consecutive PRs cite none. 3512 is the PR that introduced docs/COLABERRY_LIVE_PROGRAM_SPEC.md - a repo document that then became the de facto source of truth in place of the board it was meant to describe.' },
  { sev: 'watch', h: 'L5.4 and L5.5 are open spine defects with no PR evidence whatsoever',
    d: 'L5.4: new occurrences are created unbound to a live input and cannot resolve playback. L5.5: nothing ever tells an occurrence its stream is alive. Both are in the provider spine, both predate the recent work, and neither appears in any merged PR. These are not tracking gaps. They are remaining work, and they are upstream of every launch ticket.' },
  { sev: 'watch', h: 'Every due date on the board has passed',
    d: 'The latest due date in the project is 2026-10-31. Today is 2026-11-02. All 39 open tickets are therefore overdue by the board\'s own dates, which makes due date useless as a priority signal until the dates are reset. L0.3, the weekly launch-risk review, is itself one of the overdue tickets.' },
];

/** What this matrix does NOT establish. Kept adjacent to the findings on purpose. */
const UNVERIFIED = [
  'Ticket descriptions were never read. A second production read was refused after the first succeeded, so no ticket\'s acceptance criteria were checked. Every join is PR scope against ticket TITLE.',
  'Of 14 joins: 2 are stated by the PR itself, 10 are inferred by this document, 2 are unmapped. Only the 2 stated joins would survive an audit without opening the tickets.',
  'No review state has been set and nothing has been closed. The project rule is that Ali closes a ticket after validating its artifact, and this document is not that validation.',
  'The 22 closed tickets were taken as closed. Their evidence was not re-verified against the repository or production, so this matrix inherits whatever L0.1 got right or wrong on 2026-10-17.',
];

/**
 * The full register, as read from the board. `g` indexes BOARD. This is the backbone of the
 * matrix: L0.4 asks that every requirement map to a ticket, and a register is what makes the
 * absence of a row visible. Ordered as Basecamp returned it within each group.
 */
const TICKETS = [
  { id: 'L0.1', g: 0, s: 'DONE', due: '2026-10-17', who: 'Ali', t: 'Reconcile Basecamp against the repository and production, and publish the gap list' },
  { id: 'L0.2', g: 0, s: 'OPEN', due: '2026-10-24', who: 'Ali', t: 'Documentation-as-code upkeep: keep the documents and diagrams true as the system changes' },
  { id: 'L0.3', g: 0, s: 'OPEN', due: '2026-10-18', who: 'Ali', t: 'Weekly launch-risk review: what is late, what is at risk, what would we drop' },
  { id: 'L0.4', g: 0, s: 'OPEN', due: '2026-10-30', who: 'Ali', t: 'Traceability matrix: every requirement maps to a ticket and to evidence' },

  { id: 'L1.1', g: 1, s: 'DONE', due: null, who: 'Ali', t: 'Zoom: verify Live Streaming to a Custom Service is enabled' },
  { id: 'L1.2', g: 1, s: 'DONE', due: null, who: 'Ali', t: 'Cloudflare: enable Stream and mint a scoped API token' },
  { id: 'L1.3', g: 1, s: 'DONE', due: '2026-10-14', who: 'Ali', t: 'Install Cloudflare Stream credentials into the production environment' },
  { id: 'L1.4', g: 1, s: 'OPEN', due: '2026-10-20', who: 'Sohail', t: 'YouTube: verify channel ownership, live eligibility and stream destination' },
  { id: 'L1.5', g: 1, s: 'OPEN', due: '2026-10-24', who: 'Ali', t: 'Consolidate the three Cloudflare accounts, or document why they stay split' },

  { id: 'L2.1', g: 2, s: 'DONE', due: null, who: 'Ali', t: 'Replay playback adapter with mid-playback credential renewal' },
  { id: 'L2.2', g: 2, s: 'DONE', due: null, who: 'Ali', t: 'Signed inline Range playback transport (/bm/)' },
  { id: 'L5.1', g: 2, s: 'DONE', due: '2026-10-14', who: 'Ali', t: 'Cloudflare Stream Live provider adapter behind the existing grant contract' },
  { id: 'L5.2', g: 2, s: 'DONE', due: '2026-10-16', who: 'Ali', t: 'Connect Zoom custom RTMP to a Cloudflare live input' },
  { id: 'L5.3', g: 2, s: 'OPEN', due: '2026-10-17', who: 'Ali', t: 'First private technical airing: Zoom to Cloudflare to the Colaberry player' },
  { id: 'L5.4', g: 2, s: 'OPEN', due: '2026-10-22', who: 'Ali', t: 'Bind a new occurrence to a live input: L7.1 creates occurrences that cannot resolve playback' },
  { id: 'L5.5', g: 2, s: 'OPEN', due: '2026-10-23', who: 'Ali', t: 'The provider health loop: nothing ever tells an occurrence the stream is alive' },

  { id: 'L3.1', g: 3, s: 'DONE', due: null, who: 'Ali', t: 'Canonical broadcast occurrence schema and identity' },
  { id: 'L3.2', g: 3, s: 'DONE', due: null, who: 'Ali', t: 'Lifecycle state machine and producer commands' },
  { id: 'L3.3', g: 3, s: 'DONE', due: null, who: 'Ali', t: 'Fail-closed entitlement and deadline-bounded playback grant' },
  { id: 'L3.4', g: 3, s: 'DONE', due: null, who: 'Ali', t: 'Validated routes with RBAC and rate limits' },
  { id: 'L3.5', g: 3, s: 'DONE', due: null, who: 'Ali', t: 'Event-to-occurrence backfill, dry-run first and batch-reversible' },
  { id: 'L7.1', g: 3, s: 'DONE', due: '2026-10-20', who: 'Ali', t: 'Create a broadcast occurrence from the Accelerator Session setup flow' },
  { id: 'L7.2', g: 3, s: 'DONE', due: '2026-10-22', who: 'Ali', t: 'Generate the live workspace URL, companion URL and QR at session readiness' },
  { id: 'L7.3', g: 3, s: 'OPEN', due: '2026-10-23', who: 'Ali', t: 'Timeline drives presenter moments, Prompt Drops, polls, QR state and clip markers' },
  { id: 'L7.4', g: 3, s: 'OPEN', due: '2026-10-23', who: 'Ali', t: 'End a broadcast without an engineer: producer control plus an auto-end safety net' },

  { id: 'L4.1', g: 4, s: 'DONE', due: null, who: 'Ali', t: 'Persistent mini-player that survives portal navigation' },
  { id: 'L4.2', g: 4, s: 'DONE', due: null, who: 'Ali', t: 'Accessibility: theater, fullscreen, captions, keyboard order, SR status, reduced motion' },
  { id: 'L4.3', g: 4, s: 'DONE', due: null, who: 'Ali', t: 'Live-now badge with multi-live rows and persisted dismissal' },
  { id: 'L4.4', g: 4, s: 'DONE', due: null, who: 'Ali', t: 'Launch cue: synthesized chime, opt-in, once per occurrence' },
  { id: 'L4.5', g: 4, s: 'DONE', due: null, who: 'Ali', t: 'In-room Watch hand-off keyed on room_id' },
  { id: 'L4.6', g: 4, s: 'OPEN', due: '2026-10-19', who: 'Ali', t: 'Measurement: heartbeat ingestion route and the unavailable-never-zero read' },
  { id: 'L4.7', g: 4, s: 'OPEN', due: '2026-10-24', who: 'Aleem', t: 'Phone companion: sticky player, one-thumb interaction, Following/Building/Stuck/Finished' },
  { id: 'L4.8', g: 4, s: 'OPEN', due: '2026-10-28', who: 'Ali', t: 'Events and Community discovery placements (deferred by decision)' },
  { id: 'L4.9', g: 4, s: 'OPEN', due: '2026-10-22', who: 'Ali', t: 'Wire the player to the heartbeat endpoint: measurement currently records nothing' },

  { id: 'L6.1', g: 5, s: 'DONE', due: '2026-10-11', who: 'Piyush', t: 'Research and approve the studio equipment list, with live pricing' },
  { id: 'L6.2', g: 5, s: 'OPEN', due: '2026-10-18', who: 'Piyush', t: 'Install and validate camera, microphone, light and wired network' },
  { id: 'L6.3', g: 5, s: 'OPEN', due: '2026-10-21', who: 'Piyush', t: 'OBS scene package and Zoom audio routing with no duplicate audio' },
  { id: 'L6.4', g: 5, s: 'DONE', due: '2026-10-16', who: 'Ali', t: "Specify and source Ali's AI workstation laptop" },

  { id: 'L9.1', g: 6, s: 'OPEN', due: '2026-10-19', who: 'Piyush', t: 'Verify the CURRENT official HeyGen workflow on the execution date' },
  { id: 'L9.2', g: 6, s: 'OPEN', due: '2026-10-22', who: 'Ali', t: 'Record approved avatar training footage, with consent captured exactly as required' },
  { id: 'L9.3', g: 6, s: 'OPEN', due: '2026-10-24', who: 'Piyush', t: 'Voice clone: select provider, verify current requirements, record, QA' },
  { id: 'L9.4', g: 6, s: 'OPEN', due: '2026-10-26', who: 'Ali', t: 'Avatar QA and the Real Ali versus AI Ali usage policy' },

  { id: 'L8.1', g: 7, s: 'OPEN', due: '2026-10-25', who: 'Sohail', t: 'Simulcast to YouTube and define the raw-replay retention policy' },
  { id: 'L8.2', g: 7, s: 'OPEN', due: '2026-10-27', who: 'Piyush', t: 'One live session to one long-form edit plus 5-7 Shorts' },
  { id: 'L8.3', g: 7, s: 'OPEN', due: '2026-10-26', who: 'Ali', t: 'Replay discovery and listing in the portal' },
  { id: 'L8.4', g: 7, s: 'OPEN', due: '2026-10-24', who: 'Ali', t: 'Bind recordings to occurrences so the replay transport can resolve anything' },

  { id: 'L11.1', g: 8, s: 'OPEN', due: '2026-10-28', who: 'Ali', t: 'System Architecture Handbook' },
  { id: 'L11.2', g: 8, s: 'OPEN', due: '2026-10-28', who: 'Ali', t: 'Architecture diagrams, ten of them, Mermaid source plus rendered artifacts' },
  { id: 'L11.3', g: 8, s: 'OPEN', due: '2026-10-29', who: 'Piyush', t: 'Ali and Piyush Studio Operator Manual' },
  { id: 'L11.4', g: 8, s: 'OPEN', due: '2026-10-29', who: 'Ali', t: 'Developer and AI Maintenance Runbook' },
  { id: 'L11.5', g: 8, s: 'OPEN', due: '2026-10-29', who: 'Ali', t: 'Testing Strategy and Evidence Matrix' },
  { id: 'L11.6', g: 8, s: 'OPEN', due: '2026-10-30', who: 'Ali', t: 'Ram Executive Brief and briefing session' },
  { id: 'L11.7', g: 8, s: 'OPEN', due: '2026-10-31', who: 'Ali', t: 'Case Study Source Pack, maintained during the build' },
  { id: 'L11.8', g: 8, s: 'OPEN', due: '2026-10-26', who: 'Ali', t: 'Remaining project documents: Requirements, Orchestration, Viewer Experience, Studio, Avatar and more' },

  { id: 'L10.1', g: 9, s: 'OPEN', due: '2026-10-20', who: 'Ali', t: 'Test 2: second private airing on the fixed build, three viewers, real bitrate' },
  { id: 'L10.2', g: 9, s: 'OPEN', due: '2026-10-24', who: 'Ali', t: 'Test 3: internal staff pilot with Piyush, Sohail and Aleem' },
  { id: 'L10.3', g: 9, s: 'OPEN', due: '2026-10-28', who: 'Piyush', t: 'Test 4: full dress rehearsal in the real studio' },
  { id: 'L10.4', g: 9, s: 'OPEN', due: '2026-10-29', who: 'Ali', t: 'Test 5: failure drills' },
  { id: 'L10.5', g: 9, s: 'OPEN', due: '2026-10-30', who: 'Ali', t: 'Test 6: go/no-go and the first public production airing' },
  { id: 'L10.6', g: 9, s: 'OPEN', due: '2026-10-31', who: 'Ali', t: 'Post-launch verification, metrics and retrospective' },
  { id: 'L10.7', g: 9, s: 'OPEN', due: '2026-10-23', who: 'Ali', t: 'Prove the paywall: entitlement has never once been exercised' },
];

module.exports = { META, BOARD, TOTALS, PRS, MAP, GAPS, UNVERIFIED, TICKETS };
