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
    id: 11, title: 'System Architecture Handbook', ticket: 'L11.1',
    file: 'docs/colaberry-live/DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md', state: 'WRITTEN',
    note: 'Written 2026-11-03. Its capability proof register is generated from l111Data.js and '
      + 'spliced into the document, so the handbook cannot claim a capability is proven when the '
      + 'data says otherwise: 4 of 28 claims have run in a real airing, 10 have never run.',
  },
  {
    id: 12, title: 'Architecture Diagrams', ticket: 'L11.2',
    file: 'docs/colaberry-live/DOC_12_ARCHITECTURE_DIAGRAMS.md', state: 'WRITTEN',
    note: 'Written 2026-11-03. Ten diagrams, Mermaid source generated from l112Data.js, 76 '
      + 'required elements checked against the source. 14 nodes across 7 diagrams are drawn '
      + 'dashed and red because they are not built, and the build fails if an unbuilt path is '
      + 'drawn like a working one.',
  },
  {
    id: 13, title: 'Ali + Piyush Studio Operator Manual', ticket: 'L11.3', file: null,
    state: 'BLOCKED',
    note: 'Needs the studio installed (L6.2, L6.3). A manual for equipment nobody has yet is '
      + 'untested prose. Owner is Piyush, not Claude Code.',
  },
  {
    id: 14, title: 'Developer & AI Maintenance Runbook', ticket: 'L11.4',
    file: 'docs/colaberry-live/DOC_14_DEVELOPER_MAINTENANCE_RUNBOOK.md', state: 'WRITTEN',
    note: 'Written 2026-11-07. Generated from l114Data.js + l114Sections.js. Every path it tells '
      + 'a reader to open — 35 reference paths and 18 procedure file references — is stat\'ed on '
      + 'every build, and every documented env var must be referenced in backend/src.',
  },
  {
    id: 15, title: 'Testing Strategy & Evidence Matrix', ticket: 'L11.5',
    file: 'docs/COLABERRY_LIVE_TESTING_STRATEGY.md', state: 'WRITTEN',
    note: 'Generated with a self-check.',
  },
  {
    id: 16, title: 'Ram Executive Brief', ticket: 'L11.6',
    file: 'docs/colaberry-live/DOC_16_RAM_EXECUTIVE_BRIEF.md', state: 'WRITTEN',
    note: 'Written 2026-11-08. Generated from l116Data.js. Fifteen required explanations '
      + 'transcribed from the bootstrap and pinned by count. Two of them, costs/vendors and the '
      + '10,000 Architect goal, are not defined anywhere in this repository: they carry an '
      + 'explicit gap marker, name who can settle them, and the build refuses any currency '
      + 'figure inside them. The brief also states that the briefing session the ticket asks '
      + 'for is an event rather than a document, and stays with Ali.\n\n'
      + 'CORRECTED 2026-11-09. The first version asserted the system had never aired, in its '
      + 'lead and in its risk section. Production holds two broadcast_occurrences rows (15 and '
      + '20 October) and Basecamp ticket L11.7 names a third recording from 13 October, so the '
      + 'claim was false - it came from reading the repository and then speaking about the '
      + 'world. The true claim is narrower and more useful: it has aired three times and no '
      + 'airing has ever been measured. Both unqualified phrasings are now banned by the '
      + 'self-check so the shorter, false sentence cannot come back.',
  },
  {
    id: 17, title: 'Case Study Source Pack', ticket: 'L11.7',
    file: 'docs/colaberry-live/DOC_17_CASE_STUDY_SOURCE_PACK.md', state: 'WRITTEN',
    note: 'Written 2026-11-08. Generated from l117Data.js. It was meant to be maintained DURING '
      + 'the build rather than written after it, and the cost of that shows: of the sixteen '
      + 'captures the bootstrap asks for, 10 are captured, 5 need an event that has not happened '
      + 'and 1 is blocked on the studio. A captured item must name its evidence and an '
      + 'uncaptured one must NOT name a file, asserted in both directions, and an attributed '
      + 'quotation anywhere in the document fails the build because the bootstrap permits quotes '
      + 'only when real.\n\n'
      + 'CORRECTED 2026-11-09 after reading ticket L11.7 and production. Three airings have '
      + 'happened (13, 15 and 20 October); none recorded a single viewer, so the counts above '
      + 'are unchanged but the reason is now sourced rather than assumed. A new `airedRecord` '
      + 'field carries external references - Cloudflare video ids, occurrence rows, the viewer '
      + 'census - for uncaptured items, and the check refuses a file path inside it so the '
      + 'asymmetry rule is not quietly relaxed by the field sitting next to it. The pack also '
      + 'now carries the one destructive risk on this ticket: the 13 October recording is the '
      + 'only copy of the first airing, it has no occurrence row, and its live input is marked '
      + 'for deletion when the ticket closes.',
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
