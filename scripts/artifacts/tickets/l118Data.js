/**
 * l118Data — the eighteen required Colaberry Live project documents, and the coverage contract
 * for the nine this ticket writes.
 *
 * TICKET: L11.8, "Remaining project documents: Requirements, Orchestration, Viewer Experience,
 * Studio, Avatar and more". Its acceptance criterion is "Eight documents; unbuilt things named
 * explicitly rather than omitted".
 *
 * THE COUNT IN THAT CRITERION IS WRONG AND IS CORRECTED HERE. Bootstrap §3.1 requires DOC 00
 * through DOC 09 and §17 requires DOC 10; DOC 09 shipped under L0.4 and DOC 15 under L11.5. So
 * what is left to this ticket is DOC 00-08 — NINE documents, not eight — and DOC 10 is a tenth
 * that no ticket on the board covers at all. The board cannot show either fact about itself,
 * which is why both live in data here rather than in prose.
 *
 * WHY THE CONTRACT IS THE BOOTSTRAP'S BULLET LISTS AND NOT MY OWN HEADINGS. A checker built by
 * reading the documents would pass by construction: it would assert that the files contain what
 * the files contain. So `requires` below is transcribed from bootstrap §3.1, §10, §11, §12, §15
 * and §17 — the document that DEFINES the deliverable. The check then runs requirement -> file,
 * in that direction only.
 *
 * `requiredCount` pins `requires.length` as transcribed, so quietly dropping an entry fails the
 * check instead of silently shrinking the contract. It is the cheap half of the protection: the
 * mutation record proves the other half, that each entry is load-bearing.
 *
 * `kind: 'heading'` means the requirement has to be a section a reader can navigate to.
 * `kind: 'text'` is for the items the bootstrap lists as contents of a larger section (DOC 07's
 * fifteen outputs are a table, not fifteen headings) — those only have to be present and named.
 */

const META = {
  ticket: 'L11.8',
  title: 'Colaberry Live project documents DOC 00-08',
  owner: 'Ali Muwwakkil',
  board: 49210714,
  built: '2026-11-03',
  dir: 'docs/colaberry-live',
  bootstrap: 'docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md',
};

/** Where a document's required-contents list was transcribed from. */
const SOURCES = {
  d00: 'bootstrap §3.1, DOC 00 bullet list',
  d01: 'bootstrap §3.1, DOC 01 bullet list',
  d02: 'bootstrap §3.1, DOC 02, plus §8 "must be preserved"',
  d03: 'bootstrap §3.1, DOC 03',
  d04: 'bootstrap §3.1, DOC 04',
  d05: 'bootstrap §3.1, DOC 05, which requires all of §10',
  d06: 'bootstrap §3.1, DOC 06, which requires all of §11',
  d07: 'bootstrap §3.1, DOC 07, plus §12 and §13',
  d08: 'bootstrap §3.1, DOC 08, plus the six stages of §15',
};

const h = (match) => ({ kind: 'heading', match });
const t = (match) => ({ kind: 'text', match });

/**
 * The nine documents this ticket delivers. `gapsHeading` is the section that names what is NOT
 * built — the ticket's own acceptance criterion, and the reason it is an explicit field rather
 * than a regex over prose. A word list that scans notes for "blocked" or "missing" passes any
 * document using the right vocabulary and fails one that says the right thing in other words.
 */
const WRITTEN = [
  {
    id: 0,
    slug: 'DOC_00_READ_FIRST_AI_OPERATING_BRIEF',
    title: 'READ FIRST — Colaberry Live AI Operating Brief',
    source: SOURCES.d00,
    requiredCount: 14,
    gapsHeading: 'Current known blockers',
    requires: [
      h('Mission'),
      h('Launch deadline'),
      h('Repository'),
      h('Basecamp members'),
      h('Current architecture'),
      h('Source-of-truth hierarchy'),
      h('How Claude Code should start a session'),
      h('How to choose the next ticket'),
      h('How to update and close tickets'),
      h('How to write evidence'),
      h('External prerequisites'),
      h('Production safety rules'),
      h('Current known blockers'),
      h('Index of every project document'),
    ],
  },
  {
    id: 1,
    slug: 'DOC_01_REQUIREMENTS_AND_PRODUCT_VISION',
    title: 'Colaberry Live — Requirements & Product Vision',
    source: SOURCES.d01,
    requiredCount: 16,
    gapsHeading: 'What is not built, in one list',
    requires: [
      h('Session setup, similar to Accelerator Sessions'),
      h('Timeline-generated live experience'),
      h('Automatic broadcast occurrence creation'),
      h('Live viewer experience'),
      h('Desktop and mobile behavior'),
      h('QR and phone companion'),
      h('Prompt Drops'),
      h('Claude and Claude Code workflow'),
      h('Community and Builder Room'),
      h('Account conversion'),
      h('YouTube'),
      h('Replay'),
      h('Media repurposing'),
      h('Studio operation'),
      h('Test sessions'),
      h('Launch goal'),
    ],
  },
  {
    id: 2,
    slug: 'DOC_02_BROADCAST_ARCHITECTURE_AND_SECURITY_CONTRACT',
    title: 'Broadcast Architecture & Security Contract',
    source: SOURCES.d02,
    requiredCount: 19,
    gapsHeading: 'What is not built',
    requires: [
      h('Approved architecture'),
      h('Canonical lifecycle'),
      h('Access modes'),
      h('Playback contract'),
      h('Live delivery provider'),
      h('What must be preserved'),
      h('External prerequisites'),
      // The lifecycle and the access set are contracts, so the literal values are checked too:
      // a document that keeps the heading and loses a state would otherwise pass.
      // The last state below is the shipped lifecycle value in broadcastStateMachine.ts and in
      // the database. "Correcting" its spelling would make this check demand a document that is
      // wrong about the code it describes. Two things learned putting the marker in:
      // `spelling-exempt` has to sit on the offending line ITSELF, not on a comment above it —
      // and a comment that NAMES the identifier becomes a second hit, which is why this one
      // describes it instead of quoting it.
      t('scheduled'), t('backstage'), t('reconnecting'), t('replay_ready'), t('cancelled'), // spelling-exempt
      t('free'), t('paid'), t('preview'), t('private'),
      t('HMAC-SHA256'), t('120'), t('fail-closed'),
    ],
  },
  {
    id: 3,
    slug: 'DOC_03_SESSION_TIMELINE_BROADCAST_ORCHESTRATION',
    title: 'Session + Timeline + Broadcast Orchestration',
    source: SOURCES.d03,
    requiredCount: 16,
    gapsHeading: 'What is not built',
    requires: [
      h('The three-way model'),
      h('A Session can have more than one Broadcast Occurrence'),
      h('The thirteen things the timeline must drive'),
      // The thirteen drivers themselves.
      t('slides'), t('scene cues'), t('presenter notes'), t('Prompt Drops'), t('QR moments'),
      t('phone companion state'), t('polls'), t('Builder pulse'),
      t('Claude / Claude Code instructions'), t('broadcast graphics'),
      t('clip candidates'), t('CTA'), t('replay metadata'),
    ],
  },
  {
    id: 4,
    slug: 'DOC_04_VIEWER_EXPERIENCE_AND_PHONE_COMPANION',
    title: 'Viewer Experience + Phone Companion',
    source: SOURCES.d04,
    requiredCount: 7,
    gapsHeading: 'What is not built',
    requires: [
      h('Desktop'),
      h('Phone'),
      h('Second-screen behavior'),
      // DOC 04's phone list, verbatim where the bootstrap is verbatim.
      t('Following / Building / Stuck / Finished'),
      t('Open in Claude'),
      t('Save Claude Code version for later'),
      t('one-thumb'),
    ],
  },
  {
    id: 5,
    slug: 'DOC_05_STUDIO_EQUIPMENT_OBS_ZOOM',
    title: 'Studio, Equipment, OBS, Zoom & Piyush Requirements',
    source: SOURCES.d05,
    requiredCount: 11,
    gapsHeading: 'Current state and what is not done',
    requires: [
      h("Piyush's order of operations"),
      h('Equipment to research, approve, buy, receive and validate'),
      h('Purchase research tasks'),
      h('OBS and Zoom setup requirements'),
      // The approved equipment, by model, and the warning the bootstrap says must be in the
      // operator checklist.
      t('MX Brio'), t('K688'), t('BM88'), t('Key Light'), t('Cat6'),
      t('Zoom mute does not mute OBS'),
      t('MKV'),
    ],
  },
  {
    id: 6,
    slug: 'DOC_06_AI_AVATAR_AND_VOICE',
    title: 'AI Avatar + Voice AI Recording & Training',
    source: SOURCES.d06,
    requiredCount: 9,
    gapsHeading: 'Current state and what is not done',
    requires: [
      h('Avatar recording behavior'),
      h('Eye contact'),
      h('Standard recording baseline'),
      h('HeyGen flow-specific research'),
      h('Consent'),
      h('Voice AI and voice clone training'),
      h('Avatar QA'),
      // §11.5 and §11.4 are the two that carry real consequence if dropped.
      t('consent'), t('current official'),
    ],
  },
  {
    id: 7,
    slug: 'DOC_07_YOUTUBE_MEDIA_PRODUCTION_ENGINE',
    title: 'YouTube, Media Production & Weekly Content Engine',
    source: SOURCES.d07,
    requiredCount: 15,
    gapsHeading: 'Current state and what is not done',
    requires: [
      h('YouTube Live distribution'),
      h('Raw live replay policy'),
      h('Replay page and discovery'),
      h('Colaberry CTA and the audience-to-builder funnel'),
      h('Post-show handoff to Piyush, the videographer and marketing'),
      // The outputs the bootstrap lists as DOC 07 contents, which are a table rather than
      // nine more headings.
      t('edited long-form'), t('Shorts'), t('Transcript'), t('Chapter markers'),
      t('hooks'), t('Thumbnail'), t('Prompt Drop assets'),
      // §12's four-way retention policy: dropping one disposition is the failure mode.
      t('Keep public'), t('Unlisted'), t('Private'),
    ],
  },
  {
    id: 8,
    slug: 'DOC_08_TEST_PLAN_FAILURE_DRILLS_LAUNCH_RUNBOOK',
    title: 'Test Plan, Failure Drills & Launch Runbook',
    source: SOURCES.d08,
    requiredCount: 22,
    gapsHeading: 'Current state, in one table',
    requires: [
      h('Test 1 — provider smoke test'),
      h('Test 2 — private five-person airing'),
      h('Test 3 — internal staff pilot'),
      h('Test 4 — full dress rehearsal'),
      h('Test 5 — failure drills'),
      h('Test 6 — production launch'),
      h('Launch checklist'),
      h('Incident fallback'),
      h('Post-launch validation'),
      h('Required evidence, per stage'),
      // Test 5's thirteen failure modes are the stage most likely to be quietly shortened.
      t('RTMP interruption'), t('Expired playback grant'), t('Cloudflare failure'),
      t('Zoom disruption'), t('Viewer refresh'), t('Route navigation'), t('Phone reconnect'),
      t('Replay-processing failure'), t('Entitlement failure'), t('Invalid / private access'),
      t('Unpublishing a replay'), t('Provider API timeout'),
    ],
  },
];

/**
 * All eighteen required documents. `file` is a repo-relative path for the ones that exist;
 * `ticket: null` is a coverage gap, and DOC 10 is the one this pass found.
 */
const LEDGER = [
  ...WRITTEN.map((d) => ({
    id: d.id, title: d.title, ticket: 'L11.8',
    file: `${META.dir}/${d.slug}.md`, state: 'WRITTEN', note: 'This pass, 2026-11-03.',
  })),
  {
    id: 9, title: 'Traceability Matrix', ticket: 'L0.4',
    file: 'docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md', state: 'WRITTEN',
    note: 'Generated from l04DodData.js with a self-check — do not hand-edit.',
  },
  {
    id: 10, title: 'Current State Migration Ledger', ticket: null, file: null,
    state: 'NOT_WRITTEN',
    gapSource: 'bootstrap §17, which names the report COLABERRY LIVE — CURRENT BUILD MIGRATION '
      + 'REPORT, lists its six sections A-F, and names docs/colaberry-live/ as its repo home',
    note: 'Required by bootstrap §17 as COLABERRY LIVE — CURRENT BUILD MIGRATION REPORT, with six '
      + 'named sections A-F. NO TICKET ON THE BOARD COVERS IT. Found 2026-11-03 while scoping '
      + 'L11.8, by counting §3.1 and §17 against all 61 todos.',
  },
  {
    id: 11, title: 'System Architecture Handbook', ticket: 'L11.1', file: null,
    state: 'NOT_WRITTEN',
    note: 'Head of what is left of the chain now that L11.8 has landed. Writable from the repo.',
  },
  {
    id: 12, title: 'Architecture Diagrams', ticket: 'L11.2', file: null, state: 'NOT_WRITTEN',
    note: 'Ten diagrams, Mermaid source plus rendered. The artifact pipeline renders Mermaid '
      + 'already, so the tooling exists and the diagrams do not.',
  },
  {
    id: 13, title: 'Ali + Piyush Studio Operator Manual', ticket: 'L11.3', file: null,
    state: 'BLOCKED',
    note: 'Needs the studio installed (L6.2, L6.3). A manual for equipment nobody has yet is '
      + 'untested prose. Owner is Piyush, not Claude Code.',
  },
  {
    id: 14, title: 'Developer & AI Maintenance Runbook', ticket: 'L11.4', file: null,
    state: 'NOT_WRITTEN', note: 'Needs DOC 11.',
  },
  {
    id: 15, title: 'Testing Strategy & Evidence Matrix', ticket: 'L11.5',
    file: 'docs/COLABERRY_LIVE_TESTING_STRATEGY.md', state: 'WRITTEN',
    note: 'Generated with a self-check.',
  },
  {
    id: 16, title: 'Ram Executive Brief', ticket: 'L11.6', file: null, state: 'NOT_WRITTEN',
    note: 'Needs DOC 12 for its diagrams. Definition-of-done item 44. Not launch-blocking.',
  },
  {
    id: 17, title: 'Case Study Source Pack', ticket: 'L11.7', file: null, state: 'NOT_WRITTEN',
    note: 'Was meant to be maintained DURING the build rather than written after it, so every '
      + 'week it stays open it gets harder rather than easier.',
  },
];

const STATES = {
  WRITTEN: 'In the repository',
  NOT_WRITTEN: 'Not written',
  BLOCKED: 'Blocked on something no document can supply',
};

/** Everything countable is derived. Nothing below is typed by hand. */
const TOTALS = (() => {
  const by = {};
  Object.keys(STATES).forEach((k) => { by[k] = 0; });
  LEDGER.forEach((d) => { by[d.state] += 1; });
  const headings = WRITTEN.reduce(
    (n, d) => n + d.requires.filter((r) => r.kind === 'heading').length, 0,
  );
  return {
    required: LEDGER.length,
    by,
    written: by.WRITTEN,
    thisPass: WRITTEN.length,
    noTicket: LEDGER.filter((d) => !d.ticket).length,
    requirements: WRITTEN.reduce((n, d) => n + d.requires.length, 0),
    declaredRequirements: WRITTEN.reduce((n, d) => n + d.requiredCount, 0),
    headings,
  };
})();

module.exports = { META, SOURCES, WRITTEN, LEDGER, STATES, TOTALS };
