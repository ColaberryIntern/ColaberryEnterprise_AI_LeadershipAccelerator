/**
 * l116Data — the checked facts behind DOC 16, the Ram Executive Brief.
 *
 * TICKET: L11.6, "Ram Executive Brief — How Colaberry Live Works". Its remaining acceptance
 * criterion on the L0.3 board reads "Ram executive brief and the briefing session".
 *
 * THE BRIEFING SESSION IS NOT A DOCUMENT, AND IS NOT DELIVERED HERE. Bootstrap R9 asks to
 * "conduct a Ram briefing session and capture follow-up questions/actions". A session is an
 * event between two people; no file can discharge it. So this ticket splits: the brief is
 * written here, and the session stays owned by Ali. BRIEFING below says so in the document
 * itself, because a reader who finds a complete-looking brief will otherwise assume the whole
 * ticket is done.
 *
 * WHY THE CONTRACT IS THE BOOTSTRAP'S BULLET LIST AND NOT MY OWN HEADINGS. Same reason as
 * l118Data: a checker built by reading the finished document would assert that the document
 * contains what the document contains, and would pass by construction. REQUIRES below is
 * transcribed from bootstrap section "DOC 16 — Ram Executive Brief — How Colaberry Works",
 * which DEFINES the deliverable, and the check runs requirement -> file in that direction only.
 * `requiredCount` pins the length as transcribed, so quietly dropping a bullet fails the build
 * instead of silently shrinking the contract.
 *
 * THE RULE THAT MATTERS MOST IN A BRIEF FOR RAM: NO FIGURE THIS REPOSITORY CANNOT SOURCE.
 * Two of the fifteen required explanations cannot be answered from the repository at all:
 *
 *   - "what costs/vendors are involved" — the vendors are identifiable from the code and the
 *     documents, but no amount appears anywhere. The bootstrap itself defers it, twice: "use
 *     current vendor/product pages at execution time" and "confirm billing/cost visibility".
 *   - "how the system supports the 10,000 Architect goal" — the phrase occurs exactly ONCE in
 *     the bootstrap, inside DOC 16's own bullet list. Nothing defines the number, the horizon,
 *     or what counts as an Architect.
 *
 * An executive brief that invents either one is worse than a brief that omits it, because Ram
 * would repeat it. So both sections answer with what the repository does show, then state the
 * gap and who can settle it, and the self-check asserts those sections contain NO currency
 * figure and DO carry the gap marker. Searching for the absence of a thing is weaker than
 * searching for its presence, so the marker is asserted positively as well.
 *
 * THE SPINE OF THE WHOLE BRIEF IS THAT THE SYSTEM HAS NOT AIRED. That is the one fact an
 * executive most needs and is least likely to infer from a working demo. It is not typed as a
 * number here: AIRING_BLOCKED is DERIVED from l03Data's own classification at build time, so
 * the brief cannot drift from the board it describes.
 */

const L03 = require('./l03Data');

const META = {
  ticket: 'L11.6',
  doc: 'DOC 16',
  title: 'Colaberry Live — Ram Executive Brief: How Colaberry Live Works',
  owner: 'Ali Muwwakkil',
  audience: 'Ram Katamaraja',
  file: 'docs/colaberry-live/DOC_16_RAM_EXECUTIVE_BRIEF.md',
  built: '2026-11-08',
  session: 'CC-20261015-t6q2',
  bootstrap: 'docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md',
  /**
   * An AIRING is an event git cannot show. Checked 2026-11-08 against the L0.3 review and the
   * documents in the tree: no Colaberry Live airing is recorded in the repository. Absence of a
   * record is not proof no airing happened, so this is stated as what was checked and when,
   * never as what is true. Same discipline as l114Data's stateCheckedOn.
   */
  stateCheckedOn: '2026-11-08',
};

/** The question this brief exists to answer, quoted from the bootstrap's own audience table. */
const AUDIENCE_QUESTION = 'What does this system do for the business, what does it cost/require, '
  + 'and how does it support growth?';

/** The acceptance criterion half that no document can discharge. */
const BRIEFING = {
  owed: 'Conduct the briefing session with Ram and capture his follow-up questions and actions.',
  why: 'Bootstrap R9 lists the session as a separate deliverable from the brief. It is an event '
    + 'between two people, so writing the brief does not complete the ticket.',
  owner: 'Ali Muwwakkil',
};

/**
 * Transcribed from bootstrap DOC 16. Fifteen bullets, in the bootstrap's own order.
 * `match` is the heading a reader navigates to; `bullet` is the source text, kept verbatim so a
 * future reader can diff the contract against the bootstrap without opening both.
 */
const REQUIRES = [
  { key: 'why', bullet: 'why Colaberry Live exists',
    match: 'Why Colaberry Live exists' },
  { key: 'engine', bullet: 'how a single live class becomes a reusable media and lead-generation engine',
    match: 'How a single live class becomes a reusable media and lead-generation engine' },
  { key: 'session', bullet: 'how Ali creates a session',
    match: 'How Ali creates a session' },
  { key: 'timeline', bullet: 'how the Timeline creates the experience',
    match: 'How the Timeline creates the experience' },
  { key: 'vendors', bullet: 'how Zoom, Cloudflare, Colaberry, and YouTube work together',
    match: 'How Zoom, Cloudflare, Colaberry and YouTube work together' },
  { key: 'ownership', bullet: 'why Colaberry owns the interactive experience',
    match: 'Why Colaberry owns the interactive experience' },
  { key: 'piyush', bullet: 'what Piyush does',
    match: 'What Piyush does' },
  { key: 'marketing', bullet: 'what marketing does',
    match: 'What marketing does' },
  { key: 'recurring', bullet: 'how the system reduces recurring production work',
    match: 'How the system reduces recurring production work' },
  { key: 'architects', bullet: 'how the system supports the 10,000 Architect goal',
    match: 'How the system supports the 10,000 Architect goal' },
  { key: 'costs', bullet: 'what costs/vendors are involved',
    match: 'What costs and vendors are involved' },
  { key: 'risks', bullet: 'what risks exist',
    match: 'What risks exist' },
  { key: 'automated', bullet: 'what is automated',
    match: 'What is automated' },
  { key: 'human', bullet: 'what still requires a human',
    match: 'What still requires a human' },
  { key: 'metrics', bullet: 'what metrics show success',
    match: 'What metrics show success' },
];

/** Pinned as transcribed. Dropping a bullet must fail the build, not shrink the contract. */
const requiredCount = 15;

/**
 * The two explanations the repository cannot answer. Each must carry the marker and must contain
 * no currency figure. `settledBy` names who closes the gap — the same asymmetry DOC 11 uses:
 * an unproven claim names what would settle it, never a file that looks like proof.
 */
const GAP_MARKER = 'Not defined in this repository';
const GAPS = [
  { key: 'costs',
    settledBy: 'Ram or Ali reading the current vendor invoices. The bootstrap defers this twice '
      + 'in its own text — "use current vendor/product pages at execution time" and "confirm '
      + 'billing/cost visibility" — so the amounts were never meant to live in the repository.' },
  { key: 'architects',
    settledBy: 'Ram defining the number, the horizon and what counts as one Architect. The '
      + 'phrase appears exactly once in the bootstrap, inside this document\'s own requirement '
      + 'list, and nowhere else in the repository.' },
];

/** The funnel the bootstrap defines, quoted rather than paraphrased. */
const FUNNEL = 'Watch -> Participate -> Prompt -> Build -> Save -> $0 Colaberry Account -> '
  + 'Community -> Completed Artifact -> Architect Progress';

/** Vendors that are identifiable from the tree. No amounts, deliberately. */
const VENDORS = [
  { name: 'Zoom', role: 'The room the class is actually taught in',
    where: 'docs/colaberry-live/DOC_05_STUDIO_EQUIPMENT_OBS_ZOOM.md' },
  { name: 'Cloudflare', role: 'Delivers the stream and signs each viewer\'s playback',
    where: 'backend/src/services/broadcast/providers/cloudflareStreamProvider.ts' },
  { name: 'Colaberry', role: 'The interactive surface, the access decision and the record',
    where: 'backend/src/services/broadcast/broadcastEntitlement.ts' },
  { name: 'YouTube', role: 'Distribution and discovery after the class',
    where: 'docs/colaberry-live/DOC_07_YOUTUBE_MEDIA_PRODUCTION_ENGINE.md' },
  { name: 'HeyGen', role: 'The AI avatar and voice, where a segment uses one',
    where: 'docs/colaberry-live/DOC_06_AI_AVATAR_AND_VOICE.md' },
];

/** Every path cited anywhere in the brief. The self-check stats all of them. */
const CITED = [
  'docs/colaberry-live/DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md',
  'docs/colaberry-live/DOC_12_ARCHITECTURE_DIAGRAMS.md',
  'docs/colaberry-live/DOC_02_BROADCAST_ARCHITECTURE_AND_SECURITY_CONTRACT.md',
  'docs/colaberry-live/DOC_05_STUDIO_EQUIPMENT_OBS_ZOOM.md',
  'docs/colaberry-live/DOC_06_AI_AVATAR_AND_VOICE.md',
  'docs/colaberry-live/DOC_07_YOUTUBE_MEDIA_PRODUCTION_ENGINE.md',
  'docs/COLABERRY_LIVE_TESTING_STRATEGY.md',
  'docs/broadcast/L4_6_TELEMETRY_MUTATION_AND_PLAN_RECORD.md',
  'backend/src/services/broadcast/broadcastStateMachine.ts',
  'backend/src/services/broadcast/broadcastEntitlement.ts',
  'backend/src/services/broadcast/broadcastPlaybackGrant.ts',
  'backend/src/services/broadcast/broadcastTelemetryService.ts',
  'backend/src/services/broadcast/providers/cloudflareStreamProvider.ts',
  'scripts/explainBroadcastTelemetry.js',
];

/**
 * DERIVED, never typed. The brief's central claim is a count of work that cannot finish until a
 * real class airs; taking it from l03Data means the brief cannot disagree with the board.
 */
const DERIVED = (() => {
  const t = L03.TICKETS || [];
  const byClass = {};
  t.forEach((x) => { byClass[x.cls] = (byClass[x.cls] || 0) + 1; });
  return {
    openTickets: t.length,
    airingBlocked: byClass.airing || 0,
    ownerBlocked: byClass.owner || 0,
    builtNotMarked: byClass.shipped || 0,
    reviewDate: L03.META.date,
  };
})();

/** The brief's prose. One entry per REQUIRES key; the check refuses any mismatch either way. */
const SECTIONS = {
  why: 'Today a live class is an event. It happens, it ends, and what it leaves behind is a '
    + 'recording nobody uses and a memory of who attended. Colaberry Live exists to change what '
    + 'a class *is*: the class becomes the input to a pipeline that keeps producing after the '
    + 'class is over. The same ninety minutes yields a live broadcast, a replay that can be '
    + 'watched on demand, short clips for distribution, and a tracked path from a stranger '
    + 'watching to a named person with a Colaberry account. The teaching effort is unchanged. '
    + 'What changes is how many times that effort is used.',

  engine: 'One class feeds four surfaces. It is broadcast live to people entitled to watch it. '
    + 'It is recorded, and the recording is bound to the occurrence automatically rather than '
    + 'by someone remembering to do it. The replay is published for people who missed it. Clips '
    + 'are cut for YouTube and short-form distribution, which is where people who have never '
    + 'heard of Colaberry encounter it. Every one of those surfaces carries the same next step, '
    + 'and the bootstrap defines that path explicitly: '
    + `\`${FUNNEL}\`. `
    + 'The lead-generation claim is that sentence. A viewer who builds something and saves it '
    + 'has an account, and an account is a person marketing can talk to.',

  session: 'Ali creates a session in the admin portal. That session becomes a broadcast '
    + 'occurrence, which is the thing the system actually operates on: it holds the schedule, '
    + 'the provider binding that says where the video comes from, and the access rule that says '
    + 'who may watch. The states an occurrence can move through are defined in one place '
    + '(`backend/src/services/broadcast/broadcastStateMachine.ts`) rather than scattered, which '
    + 'is why "go live" either works or refuses for a stated reason instead of half-starting.',

  timeline: 'The Timeline is the scripted run of the class — the segments, the prompts put in '
    + 'front of viewers, and the cues that change what is on screen. It is the difference '
    + 'between streaming a meeting and producing a show. Because the Timeline drives the '
    + 'viewer\'s surface rather than the instructor narrating it, the experience is repeatable: '
    + 'the second class does not depend on remembering how the first one went, and a segment '
    + 'that worked can be reused.',

  vendors: 'Each vendor does one job, and the boundaries are deliberate. **Zoom** is the room '
    + 'the class is taught in. **Cloudflare** delivers the video and signs each viewer\'s '
    + 'playback, so a link cannot be forwarded and reused indefinitely. **Colaberry** owns the '
    + 'page the viewer is actually on: the access decision, the interaction, and the record of '
    + 'what each person did. **YouTube** is where the class goes afterwards to be found by '
    + 'people who were not invited. **HeyGen** supplies the AI avatar and voice where a segment '
    + 'uses one. Zoom and Cloudflare are replaceable; the Colaberry layer is not, for the '
    + 'reason in the next section.',

  ownership: 'The interactive layer is where the three things that matter commercially live: '
    + 'who is allowed to watch, what the learner built, and which viewer became a lead. If that '
    + 'sat on a vendor\'s platform, Colaberry could not gate a class to a specific cohort, could '
    + 'not keep the artifact a learner produced, and could not attribute a sign-up back to the '
    + 'class that caused it. The access decision is written to fail closed — if entitlement '
    + 'cannot be established, the answer is no rather than yes '
    + '(`backend/src/services/broadcast/broadcastEntitlement.ts`). That is a business position '
    + 'as much as a technical one: it is the part that cannot be outsourced without giving away '
    + 'the relationship.',

  piyush: 'Piyush owns the studio and the show. That means the physical setup — cameras, audio '
    + 'routing, lighting, a wired network — the OBS scene collection that switches between '
    + 'inputs, and running the broadcast while Ali teaches. It is a production role, not a '
    + 'development one. It is also currently the longest pole: the studio is not installed yet, '
    + 'and the operator manual cannot honestly be written until it is, because a manual for '
    + 'equipment nobody has is untested prose.',

  marketing: 'Marketing owns everything downstream of the recording. The clips, where they are '
    + 'posted, the campaigns that bring an audience to the next class, and the conversion path '
    + 'from a viewer to a $0 account. Marketing is the reason the media pipeline exists at all — '
    + 'without distribution, a replay is an archive rather than an asset.',

  recurring: 'The saving is in the work that currently happens once per class and depends on '
    + 'someone remembering it: binding the recording to the right session, publishing the '
    + 'replay, cutting the clips, and knowing who watched. Those are automated, so the marginal '
    + 'cost of the tenth class is much closer to the teaching time than the first class was. '
    + 'This is the clearest business case in the system, and it is also the one most exposed to '
    + 'the risk below: automation that has never run in front of a real audience is a '
    + 'projection, not yet a saving.',

  architects: `**${GAP_MARKER}.** The phrase "10,000 Architect goal" appears exactly once in `
    + 'the bootstrap, inside this document\'s own list of things to explain, and nowhere else in '
    + 'the repository. There is no definition of the number, the time horizon, or what counts '
    + 'as one Architect, so any arithmetic here would be invented and Ram would be repeating a '
    + 'figure with nothing behind it.\n\n'
    + 'What the repository *does* define is the mechanism a goal like that would run on. Every '
    + 'surface a class produces ends at the same funnel — '
    + `\`${FUNNEL}\` — and "Architect Progress" is its last step. So the system\'s contribution `
    + 'is that it turns one teaching event into a repeatable intake, and that the intake is '
    + 'instrumented end to end. Turning that into a number needs the goal defined first.',

  costs: `The vendors are knowable; the amounts are **${GAP_MARKER}**, and deliberately so. `
    + 'The bootstrap defers them twice in its own text — "use current vendor/product pages at '
    + 'execution time", and a release step to "confirm billing/cost visibility" — because a '
    + 'price written into a document is wrong within a quarter. Rather than estimate, here is '
    + 'the complete list of what is paid for and what each one buys, so the invoices can be '
    + 'read against it:\n\nVENDOR_TABLE\n\n'
    + 'Two cost notes that are structural rather than numeric. The delivery cost scales with '
    + 'minutes watched, not with the number of classes, so a popular replay costs more than an '
    + 'unwatched live class. And the studio is a one-off capital cost sitting with Piyush, not '
    + 'a recurring line.',

  risks: `The largest risk is the simplest: **it has never aired.** As of the L0.3 review on `
    + `${DERIVED.reviewDate}, ${DERIVED.airingBlocked} of the ${DERIVED.openTickets} open `
    + 'tickets cannot be finished by writing code, because their acceptance criteria require a '
    + 'real class to have happened — three viewers on separate networks, a recorded latency, a '
    + 'replay verified after the fact. Everything in this brief that describes the system '
    + 'working describes it working in tests.\n\n'
    + 'That distinction has already cost something real, which is the honest reason to take it '
    + 'seriously: four complete, well-tested units shipped that nothing called, and one of them '
    + 'meant a live class recorded zero viewers for five days while the server logs showed '
    + 'people watching. The register in '
    + '`docs/colaberry-live/DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md` now grades every capability '
    + 'by whether it has run in production, in a test, or never.\n\n'
    + `The second risk is people: ${DERIVED.ownerBlocked} tickets are blocked on a named person `
    + 'having access or hardware, most of them the studio. The third is concentration — there is '
    + 'one provider adapter, so a Cloudflare outage is a canceled class rather than a degraded '
    + 'one.',

  automated: 'The occurrence lifecycle and what each transition is allowed to do. The access '
    + 'decision for every viewer, failing closed. Playback-grant expiry, computed in one place '
    + 'so a link cannot outlive its session. Binding the recording to the occurrence. '
    + 'Publishing the replay. Collecting who is watching, counting distinct people rather than '
    + 'open tabs. Each of those has tests; the testing strategy and the evidence behind each '
    + 'claim are cataloged in `docs/COLABERRY_LIVE_TESTING_STRATEGY.md`.',

  human: 'Teaching the class. Running the studio and the show. The go/no-go call before a '
    + 'public airing. Deciding whether a replay is published or withheld. And the judgment '
    + 'calls the system deliberately refuses to make on its own — Claude Code does not close a '
    + 'ticket, merge its own work, or send on anyone\'s behalf. The briefing session that '
    + 'accompanies this document is itself one of these: a document cannot discharge it.',

  metrics: 'What is instrumented, and what each number means, matters more here than a target. '
    + 'The live audience is counted as **distinct enrolled people currently watching**, not open '
    + 'tabs and not cumulative joins, with a freshness window so someone who closed their laptop '
    + 'stops counting, and staff and test accounts excluded '
    + '(`backend/src/services/broadcast/broadcastTelemetryService.ts`). When collection fails, '
    + 'the surface returns no number at all rather than a zero, because a confident zero is '
    + 'indistinguishable from an empty room and is the more expensive mistake.\n\n'
    + 'Beyond the live count: replay views, clip performance on YouTube, and $0 account '
    + 'creations attributed to a class — the funnel\'s own steps.\n\n'
    + `**What no metric shows yet.** As checked on ${META.stateCheckedOn}, there is no record in `
    + 'this repository of a Colaberry Live class having aired, so every number above currently '
    + 'has nothing in it. Whether telemetry has collected a single row since the viewer was '
    + 'wired to report on 2026-10-20 is still unverified; it takes one command '
    + '(`scripts/explainBroadcastTelemetry.js`) against production to answer, and that is owed.',
};

const TOTALS = (() => ({
  required: REQUIRES.length,
  sections: Object.keys(SECTIONS).length,
  gaps: GAPS.length,
  vendors: VENDORS.length,
  cited: CITED.length,
}))();

module.exports = {
  META, AUDIENCE_QUESTION, BRIEFING, REQUIRES, requiredCount, GAP_MARKER, GAPS,
  FUNNEL, VENDORS, CITED, DERIVED, SECTIONS, TOTALS,
};
