/**
 * l117Data — the evidence behind DOC 17, the Colaberry Live Case Study Source Pack.
 *
 * TICKET: L11.7, "Colaberry Live Case Study Source Pack". Remaining criterion: "Case study
 * source pack". The board's own note on this ticket is the important part: it "was meant to be
 * maintained DURING the build rather than written after it - so every week it stays open it gets
 * harder, not easier."
 *
 * WHAT THIS DOCUMENT HONESTLY IS. Of the sixteen things the bootstrap says to capture, six are
 * not capturable yet: screenshots of a running show, the studio before and after, the first live
 * test, the first public airing, metrics, and quotes. The studio is not installed, and although
 * the system HAS aired three times - 13, 15 and 20 October 2026 - not one of those airings
 * recorded a single viewer, so none satisfies a capture that asks for a measured event.
 *
 * Corrected 2026-11-09. The first version of this file said no class had aired, which confused
 * "absent from this repository" with "absent from the world": the airings were recorded on
 * Basecamp ticket L11.7 and in the production database, and a repository build can read neither.
 * So this is not a case study and does not pretend to be one - it is the
 * source pack, and a source pack whose gaps are visible is worth more than one that reads as
 * complete, because the gaps are the shooting list for the day the class finally airs.
 *
 * THE RULE THIS FILE IS BUILT AROUND, AND THE ONE THE CHECK ENFORCES HARDEST:
 *
 *   A CAPTURED item must name its evidence and must NOT name what would settle it.
 *   An UNCAPTURED item must name what would settle it and must NOT name a file.
 *
 * That asymmetry is asserted in BOTH directions. It is the lesson DOC 11's proof register was
 * built on: a filename sitting beside an unproven claim is how an unproven claim gets read as a
 * proven one. A reader skimming for paths cannot tell "here is the evidence" from "here is where
 * the evidence will go" unless the document refuses to print a path it does not have.
 *
 * QUOTES ARE EMPTY BY INSTRUCTION, NOT BY OVERSIGHT. The bootstrap says "quotes/feedback only
 * when real". Nobody has watched a Colaberry Live class, so there is nothing real to quote. The
 * check asserts the document contains no attributed quotation anywhere, which is a stronger
 * guarantee than an empty section - it also catches a quotation invented into some other
 * section later.
 *
 * `requiredCount` pins the sixteen as transcribed from bootstrap DOC 17, so dropping one fails
 * the build rather than shrinking the contract. Every evidence path is stat'ed on every build.
 */

const META = {
  ticket: 'L11.7',
  doc: 'DOC 17',
  title: 'Colaberry Live — Case Study Source Pack',
  owner: 'Ali Muwwakkil',
  file: 'docs/colaberry-live/DOC_17_CASE_STUDY_SOURCE_PACK.md',
  built: '2026-11-08',
  session: 'CC-20261015-t6q2',
  bootstrap: 'docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md',
  feeds: 'The final Case Study OS publication task after launch (bootstrap R10).',
  /** An airing is an event git cannot show. See l116Data's note on this field. */
  stateCheckedOn: '2026-11-09',
};

const STATES = {
  CAPTURED: 'Evidence is in the repository now',
  NOT_YET: 'Needs an event that has not happened',
  BLOCKED: 'Needs something no document can supply',
};

/** Replaced at render time with a count taken from disk, so the figure cannot drift. */
const TEST_COUNT_TOKEN = '{{BROADCAST_TEST_SUITES}}';

/**
 * The sixteen captures, transcribed from bootstrap DOC 17 in its own order.
 *
 * `bullet` is the source text kept verbatim. `state` is one of STATES. `evidence` is a list of
 * repo-relative paths, present ONLY for CAPTURED items and stat'ed by the check. `settledBy` is
 * present ONLY for the others. `note` is the prose that goes under the heading.
 *
 * `airedRecord` is a fourth field, added 2026-11-09, permitted ONLY on uncaptured items. It
 * holds EXTERNAL references - a Cloudflare video id, a database row, a census result - that say
 * what is known about an event without claiming the capture is satisfied. It exists because the
 * first version of this pack said no live test had happened when three airings had: the record
 * lived on the Basecamp ticket and in the production database, and a repository build cannot
 * read either.
 *
 * The check REFUSES a file path inside `airedRecord`. That is the whole point of keeping it
 * separate from `evidence`: the asymmetry rule above exists so a reader can never mistake a
 * path for proof, and a field that relaxed it would quietly undo the rule it sits beside. An
 * external identifier a reader must go and look up is honest context; a repo path beside an
 * unproven claim is not.
 */
/**
 * The 13 October footage, after it was recovered on 2026-11-09.
 *
 * These values live in data, not in prose, so the document and the self-check cannot drift
 * apart: the document renders them and check 5b asserts them from this same object. A hash
 * typed out twice is a hash that will eventually disagree with itself.
 *
 * `measuredSeconds` was read from the file's own `mvhd` (movie header) box, which is the
 * field ffprobe reports. It is NOT size divided by bitrate. A duration computed from a
 * file's size is a guess wearing a number's clothes, and the measured value is the only one
 * that can show a copy was truncated.
 */
const FOOTAGE = {
  recoveredOn: '2026-11-09',
  filename: 'colaberry-live-2026-10-13-first-airing.mp4',
  sha256: '9f9df276403a98aa02e2243fa1be296d4a5b5150ee8708cc6da2051412052ed1',
  sizeBytes: 23417432,
  measuredSeconds: 1080.005,
  measuredHms: '18m 00s',
  heldAt: ['the Basecamp vault on ticket L11.7', 'OneDrive, outside this repository'],
};

const CAPTURES = [
  {
    key: 'problem', bullet: 'original problem', match: 'Original problem', state: 'CAPTURED',
    evidence: [
      'docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md',
      'docs/colaberry-live/DOC_01_REQUIREMENTS_AND_PRODUCT_VISION.md',
    ],
    note: 'A live class was a one-off event: taught once, recorded to a file nobody opened, '
      + 'leaving no reusable asset and no tracked path from a viewer to a Colaberry account. '
      + 'The requirement was to make the class the *input* to a pipeline rather than the output '
      + 'of one, so a fixed teaching effort could be used several times.',
  },
  {
    key: 'before', bullet: 'before state', match: 'Before state', state: 'CAPTURED',
    evidence: [
      'docs/colaberry-live/DOC_00_READ_FIRST_AI_OPERATING_BRIEF.md',
      'docs/colaberry-live/DOC_01_REQUIREMENTS_AND_PRODUCT_VISION.md',
    ],
    note: 'Classes ran in Zoom. There was no broadcast occurrence, no entitlement model for '
      + 'who could watch, no replay pipeline, no clip production, and no measurement of an '
      + 'audience. Distribution after a class was manual and therefore usually skipped.',
  },
  {
    key: 'decisions', bullet: 'architecture decisions', match: 'Architecture decisions',
    state: 'CAPTURED',
    evidence: [
      'docs/colaberry-live/DOC_02_BROADCAST_ARCHITECTURE_AND_SECURITY_CONTRACT.md',
      'docs/colaberry-live/DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md',
      'backend/src/services/broadcast/broadcastStateMachine.ts',
      'backend/src/services/broadcast/broadcastEntitlement.ts',
      'backend/src/services/broadcast/broadcastPlaybackGrant.ts',
    ],
    note: 'Four decisions shaped everything after them. The occurrence lifecycle lives in one '
      + 'transition table rather than being spread across callers. The access decision fails '
      + 'closed: if entitlement cannot be established the answer is no. Playback-grant expiry '
      + 'is computed in exactly one place, so a signed link cannot outlive its session by '
      + 'accident. And Colaberry keeps the interactive layer rather than renting it, because '
      + 'that is where cohort gating, the learner\'s artifact and lead attribution live.',
  },
  {
    key: 'screenshots', bullet: 'screenshots', match: 'Screenshots', state: 'NOT_YET',
    settledBy: 'Production screenshots of a session actually running. A capture pass for the '
      + 'session modal exists on an open pull request (3208) and is not on main; the viewer, '
      + 'studio and replay surfaces have never been photographed against a live occurrence.',
    note: 'Nothing here yet, and the reason is worth stating: screenshots of a seeded test '
      + 'occurrence would be the easiest thing in this pack to fake into looking like evidence. '
      + 'A case study needs pictures of a real show.',
  },
  {
    key: 'milestones', bullet: 'milestones', match: 'Milestones', state: 'CAPTURED',
    evidence: [
      'docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md',
      'docs/broadcast/ROLLOUT_RUNBOOK.md',
    ],
    note: 'The traceability matrix is the authoritative milestone record, mapping delivered '
      + 'work to the tickets that asked for it. Named landmarks: the broadcast spine and state '
      + 'machine; binding a new occurrence to a live input; the recording-and-replay health '
      + 'loop; viewer telemetry wired to the player on 2026-10-20; and the documentation chain '
      + 'DOC 00 through DOC 17.',
  },
  {
    key: 'failed', bullet: 'failed approaches', match: 'Failed approaches', state: 'CAPTURED',
    evidence: [
      'docs/broadcast/L4_6_TELEMETRY_MUTATION_AND_PLAN_RECORD.md',
      'docs/broadcast/L8_3_REPLAY_FILTER_MUTATION_RECORD.md',
    ],
    note: 'Three worth keeping, because each one changed how the work was verified afterwards. '
      + 'A progress audit scanned merge commits only (`git log --merges`) and undercounted '
      + 'finished work, because two of the three P0 deliveries had landed as direct commits. A '
      + 'query plan was captured against empty tables, which proves a statement parses and '
      + 'nothing about how it performs - the row counts were never recorded beside it, so the '
      + 'plan could not be interpreted and the criterion sat open for three weeks looking '
      + 'blocked. And a test named for the freshness window passed with the freshness window '
      + 'deleted, because it asserted the value being computed rather than the rule using it.',
  },
  {
    key: 'defects', bullet: 'important defects found', match: 'Important defects found',
    state: 'CAPTURED',
    evidence: ['docs/colaberry-live/DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md'],
    note: 'The defining defect of this build, and the most valuable thing in the pack: **four '
      + 'complete, well-tested units shipped that nothing called.** The heartbeat route had no '
      + 'caller, so a real twenty-minute class with two viewers recorded zero rows while the '
      + 'web server logged sixteen playback grants - live and wrong for five days. An occurrence '
      + 'could be created with no provider binding: real, private, correct, and unplayable. A '
      + 'provider-event function was exported and tested and called by nothing, so going live '
      + 'always refused. And the player never called the heartbeat, which made every audience '
      + 'number a confident zero.\n\nThe suite was green throughout, with over a thousand tests '
      + 'and nearly all of them unit tests. A unit test mocks its caller, so a missing caller is '
      + 'invisible to it. That is why the handbook now grades every capability by whether it has '
      + 'run in production, is pinned by a test, is merely wired, or is unproven.',
  },
  {
    key: 'security', bullet: 'security protections', match: 'Security protections',
    state: 'CAPTURED',
    evidence: [
      'docs/colaberry-live/DOC_02_BROADCAST_ARCHITECTURE_AND_SECURITY_CONTRACT.md',
      'backend/src/services/broadcast/broadcastEntitlement.ts',
      'backend/src/services/broadcast/broadcastPlaybackGrant.ts',
      'backend/src/services/broadcast/providers/cloudflareStreamProvider.ts',
    ],
    note: 'Entitlement fails closed, and the test suite asserts the refusal path rather than '
      + 'only the happy path. Playback is signed per viewer with a single expiry computation, so '
      + 'a forwarded link stops working. A private occurrence is not merely hidden from lists - '
      + 'it is refused on direct access. Continuous integration runs a secret scan and a '
      + 'route-authorization lint on every change, so a new route cannot ship without an auth '
      + 'decision.',
  },
  {
    key: 'tests', bullet: 'test evidence', match: 'Test evidence', state: 'CAPTURED',
    evidence: [
      'docs/COLABERRY_LIVE_TESTING_STRATEGY.md',
      'docs/broadcast/L4_6_TELEMETRY_MUTATION_AND_PLAN_RECORD.md',
      'docs/broadcast/L8_3_REPLAY_FILTER_MUTATION_RECORD.md',
    ],
    note: `${TEST_COUNT_TOKEN} broadcast test suites sit in the tree, cataloged with the `
      + 'evidence behind each claim in the testing strategy. Two mutation records go further '
      + 'than counting tests: each reverses a specific rule in shipped code and records which '
      + 'named tests fail. The telemetry record is the more useful of the two, because its '
      + 'finding was uncomfortable - three of the audience read\'s rules each rested on a single '
      + 'assertion, while the one contract that survived every reversal did so because it '
      + 'asserted a field was **absent** rather than checking the shape of the response.',
  },
  {
    key: 'studio', bullet: 'studio before/after', match: 'Studio before and after',
    state: 'BLOCKED',
    settledBy: 'The studio being installed and signed off (tickets L6.2 and L6.3, owned by '
      + 'Piyush), then photographed before and after. A reviewed audio/video sample with no '
      + 'clipping, even lighting and a wired network is the acceptance bar.',
    note: 'Blocked rather than merely pending: there is no studio to photograph. This also '
      + 'blocks the operator manual, which cannot be written honestly for equipment nobody has.',
  },
  {
    key: 'firstTest', bullet: 'first live test', match: 'First live test', state: 'NOT_YET',
    settledBy: 'Not the airing - that has happened three times. What is missing is the '
      + 'measurement: three viewers on separate networks, with the real bitrate and latency '
      + 'recorded and the preview flag returned to false afterwards. None of the three airings '
      + 'recorded a single viewer, so none of them meets this bar.',
    airedRecord: [
      '13 Oct 2026, 18 min, Cloudflare video b4c0c11c60952605105180b02c0d3db4 on live input '
        + '08def3066403e44d507fc16709cc9a4e. Named on ticket L11.7 by Ali on 23 Oct. NO '
        + 'occurrence row exists for it in the production database. The recording itself has '
        + 'since been copied off Cloudflare and preserved; the note below says where.',
      '15 Oct 2026, occurrence e5c4a59f-48de-4dba-815e-f14e165e0eef, titled "First Private '
        + 'Technical Airing", access_mode free, editorial_state ended with a NULL ended_at.',
      '20 Oct 2026, occurrence 21d0ce4f-cb55-4a7b-b9b6-0b42280fa5a8, titled "Test 2", '
        + 'access_mode private, ran 13:49 to 14:09 UTC.',
    ],
    note: 'Restated on 2026-11-09 after reading production and ticket L11.7. The earlier version '
      + 'of this entry said no live test had happened, which was wrong: three airings have. What '
      + 'has never happened is a MEASURED one, and that distinction is the whole value of this '
      + 'entry - a reader who believes nothing aired will plan a first airing, when what is '
      + 'actually needed is instrumentation on an airing the team already knows how to run.\n\n'
      + `RESOLVED on ${FOOTAGE.recoveredOn}, and written down here because the risk it closed `
      + 'was real: the 13 October recording was the only copy of the first airing, it has no '
      + 'occurrence row, and ticket L11.7 records a decision to delete its live input once this '
      + 'ticket is done. Deleting a live input takes its recordings with it, and that input '
      + 'holds exactly one recording. It could not have been retrieved afterwards either - the '
      + 'video required signed URLs and no downloadable MP4 had ever been generated, so there '
      + `was no link anyone could have clicked. The footage was pulled to ${FOOTAGE.filename}, `
      + `measured at ${FOOTAGE.measuredHms} from the file's own movie header rather than `
      + `computed, and verified by SHA256 ${FOOTAGE.sha256}, identical at every hop from `
      + `Cloudflare to the final copy. It is held in two places independent of Cloudflare: `
      + `${FOOTAGE.heldAt.join(' and ')}. Deleting the live input is now safe.\n\n`
      + 'This capture stays NOT YET regardless, and that is the point worth keeping: preserving '
      + 'footage is not measuring an airing. The bar above is the measurement.',
  },
  {
    key: 'firstPublic', bullet: 'first public live', match: 'First public live',
    state: 'NOT_YET',
    settledBy: 'A recorded go/no-go decision, a real public class aired, and the replay and '
      + 'analytics verified afterwards rather than assumed. Checked against production on '
      + '2026-11-09: neither existing occurrence qualifies. One ran access_mode private and the '
      + 'other access_mode free, and both recorded zero viewers, so neither can be read as a '
      + 'public class. An access mode is a setting, not an audience.',
    airedRecord: [
      'The 15 Oct occurrence is titled "First Private Technical Airing" in the database, while '
        + 'ticket L11.7 calls the 13 Oct recording the first private technical airing and the '
        + '15 Oct one "the first production airing". The two records disagree about which event '
        + 'was which, and that should be settled before either is cited in a case study.',
    ],
    note: 'This is the event the case study is ultimately about, and the one that converts most '
      + 'of this pack from a description of a system into a record of a system that ran. It '
      + 'depends on the first live test and on the studio, so it is third in a chain of three. '
      + 'The acceptance bar is deliberately higher than "it worked": a non-staff cohort member '
      + 'watches successfully, someone in the wrong cohort is refused and cannot even see that '
      + 'the class exists, and the replay and the audience numbers are checked afterwards '
      + 'rather than assumed. Capture it while it happens — this is the one item in the pack '
      + 'that cannot be reconstructed later from the repository.',
  },
  {
    key: 'metrics', bullet: 'metrics', match: 'Metrics', state: 'NOT_YET',
    settledBy: 'A class aired to an audience. The production query this entry used to ask for '
      + 'was run on 2026-11-09 and is no longer outstanding.',
    airedRecord: [
      'Census of 2026-11-09, read-only: broadcast_viewer_sessions 0 rows, '
        + 'broadcast_viewer_people 0 rows, broadcast_occurrence_metrics 0 rows. Distinct '
        + 'non-staff, non-test viewers ever recorded: 0.',
      'The instrument itself is sound: index idx_bvs_active exists and the planner chooses it '
        + 'over a sequential scan. What is missing is an audience, not a measurement path.',
    ],
    note: 'Deliberately empty, and now empty for a sourced reason rather than an assumed one. '
      + 'Every counter the system exposes has nothing in it, and a zero printed from an '
      + 'unmeasured airing is the exact mistake the telemetry work was built to avoid - the '
      + 'audience endpoint returns no number at all when collection fails, rather than a '
      + 'confident zero.\n\n'
      + 'One caveat that matters more than the zero does. The viewer was only wired to report '
      + 'on 2026-10-20, so empty tables are not evidence that the 13 and 15 October airings had '
      + 'no viewers. They are evidence that nothing has been measured since instrumentation '
      + 'existed. Those two airings are unmeasurable after the fact, which is a cost already '
      + 'incurred rather than a task outstanding.',
  },
  {
    key: 'quotes', bullet: 'quotes/feedback only when real', match: 'Quotes and feedback',
    state: 'NOT_YET',
    settledBy: 'A real viewer, instructor or stakeholder saying something after a real class, '
      + 'recorded verbatim with attribution and permission.',
    note: 'Empty by instruction. The bootstrap says "only when real", and no viewer has ever '
      + 'been recorded watching a Colaberry Live airing, so there is nobody to quote. The build '
      + 'refuses if an attributed quotation appears anywhere in this document.',
  },
  {
    key: 'diagrams', bullet: 'final system diagrams', match: 'Final system diagrams',
    state: 'CAPTURED',
    evidence: ['docs/colaberry-live/DOC_12_ARCHITECTURE_DIAGRAMS.md'],
    note: 'Ten diagrams with generated Mermaid source: system context, data flow, the '
      + 'session-to-live sequence, the occurrence lifecycle, entitlement, viewer experience, '
      + 'timeline orchestration, studio signal and audio, the replay pipeline, and failure and '
      + 'recovery. Fourteen nodes across seven of them are drawn dashed and red because they are '
      + 'not built, and that document\'s build fails if an unbuilt path is drawn like a working '
      + 'one. For a case study this matters: the diagrams are already honest about what is '
      + 'aspirational, so they can be published without re-auditing.',
  },
  {
    key: 'lessons', bullet: 'lessons learned', match: 'Lessons learned', state: 'CAPTURED',
    evidence: [
      'docs/colaberry-live/DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md',
      'docs/broadcast/L4_6_TELEMETRY_MUTATION_AND_PLAN_RECORD.md',
    ],
    note: 'Four, each paid for. **A green suite is not a working system** - grade a capability '
      + 'by whether it ran in production, in a test, is merely wired, or is unproven, and never '
      + 'let an unproven claim name a file. **Count how many tests notice a reversal, not '
      + 'whether any did** - "seven killed, none survived" hid the fact that three rules rested '
      + 'on one assertion each. **Test the contract, not its shape** - the assertion that '
      + 'survived every attempt to fool it demanded a field be absent. And **a check whose tool '
      + 'is unavailable must error, never pass**, because a broken check and a clean result look '
      + 'identical from the outside.',
  },
];

/** Pinned as transcribed from bootstrap DOC 17. */
const requiredCount = 16;

const TOTALS = (() => {
  const by = {};
  Object.keys(STATES).forEach((k) => { by[k] = 0; });
  CAPTURES.forEach((c) => { by[c.state] += 1; });
  return {
    required: CAPTURES.length,
    captured: by.CAPTURED,
    notYet: by.NOT_YET,
    blocked: by.BLOCKED,
    evidencePaths: CAPTURES.reduce((n, c) => n + (c.evidence ? c.evidence.length : 0), 0),
  };
})();

module.exports = {
  META, STATES, CAPTURES, requiredCount, TOTALS, TEST_COUNT_TOKEN, FOOTAGE,
};
