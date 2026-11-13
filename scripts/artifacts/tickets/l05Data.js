/**
 * l05Data — DOC 10, the Colaberry Live Current Build Migration Report.
 *
 * TICKET: L0.5. It sits in board group 00, "Control, Source of Truth and Governance", next to the
 * traceability matrix it has to agree with, rather than in group 08 with the enablement material.
 * DOC 10 is an instrument for checking the board, not something a human reads to operate a studio.
 *
 * WHY THIS TICKET EXISTS AT ALL. Bootstrap §3.1 requires DOC 00-09 and §17 separately requires
 * DOC 10. Every other required document had a ticket. DOC 10 had none, and was found on
 * 2026-11-03 by counting the documents named in §3.1 and §17 against every todo then on the
 * board. A board cannot show a gap in itself; only a count of the requirement list against it
 * could have surfaced this one.
 *
 * THE REPORT IS LATE AND SAYS SO. §17 opens "Before starting new implementation create a report".
 * It was not created, and implementation ran for about seven weeks without it. This is therefore a
 * retrospective ledger, not the pre-flight gate the bootstrap intended, and `RETRO` below forces
 * the document to lead with that. A report that presented itself as having been the gate would be
 * the one failure that actually matters here: the whole value of this document is that it is
 * trustworthy about the build's real state.
 *
 * WHAT IS MEASURED VERSUS JUDGED, stated so a reader can weigh each part:
 *
 *   - Section A is READ FROM GIT at build time. Nothing in it is typed.
 *   - Section B's file and test paths are STAT'ED on every build, so a path that does not exist
 *     fails the build instead of shipping as a dead reference in a governance document.
 *   - Sections C and D are the MEASURED census of 87 Basecamp todos, pulled from production on
 *     2026-11-10 and committed as l05BoardCensus.json so the report is reproducible.
 *   - The 56-task reconciliation in l05Phases is a JUDGMENT, constrained from both directions by
 *     the self-check. It is the only judged part and the document labels it as such.
 *   - Section F is DERIVED: the earliest-due open todo in the census, not a preference.
 *
 * SECRETS. Section B reports flag and credential variable NAMES and never values. A guard below
 * refuses anything that looks like a materialized secret, because this document is attached to a
 * Basecamp ticket and read by people who are not thinking about key hygiene.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PHASES, TASKS } = require('./l05Phases');

const ROOT = path.join(__dirname, '..', '..', '..');

const META = {
  ticket: 'L0.5',
  ticketId: 10497219341,
  doc: 10,
  title: 'Colaberry Live - Current Build Migration Report',
  owner: 'Ali Muwwakkil',
  board: 49210714,
  group: 10392808020,
  built: '2026-11-10',
  session: 'CC-20261015-t6q2',
  file: 'docs/colaberry-live/DOC_10_CURRENT_BUILD_MIGRATION_REPORT.md',
  bootstrap: 'docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md',
  phasePlan: 'docs/requirements/CLAUDE_CODE_COLABERRY_LIVE_7_PHASE_BUILD.md',
  census: 'scripts/artifacts/tickets/l05BoardCensus.json',
  censusMeasured: '2026-11-10',
};

/** The lateness statement. Required in the document's lead; the self-check enforces it. */
const RETRO = {
  required: 'Before starting new implementation create a report',
  reality: 'It was not created. Implementation ran from mid-September to 10 November 2026 without '
    + 'it, and 22 of the 87 todos on this board were completed before this report existed.',
  consequence: 'This is a retrospective ledger, not the pre-flight gate §17 intended. Nothing in '
    + 'it was used to decide what to build. Its value is as a true statement of where the build '
    + 'actually stands on 10 November 2026, and it should not be cited as evidence that the §17 '
    + 'gate was honored.',
};

/** The measured census. Committed so a reader can re-run the counts instead of trusting them. */
const CENSUS = require('./l05BoardCensus.json');

/**
 * Section A is a FROZEN measured snapshot, not live state, and that is a correctness decision
 * rather than a convenience.
 *
 * The first version measured git on every build. It could not pass its own check: the write of
 * the document changes `git status`, so the measurement taken before the write and the one taken
 * after it disagreed, and the build failed comparing the file to itself. Memoizing within a build
 * fixes that symptom and leaves the real problem — a document that rewrites itself on every
 * build, so the committed section A reports whoever rebuilt last rather than the migration.
 *
 * §17 asks for the session id, branch, plan, task, commits, PR and uncommitted files OF THE TAB
 * PERFORMING THE MIGRATION. That is inherently a one-time record. A rebuild next month is not a
 * new migration and must not claim a new section A. So the snapshot is captured once by
 * `captureCurrentTab`, committed as JSON next to the board census, and rendered from there — the
 * same treatment as every other measurement in this report.
 */
const TAB_FILE = path.join(__dirname, 'l05CurrentTab.json');

/** Narrative fields: what this tab was doing. Measured fields come from git, below. */
const TAB_NARRATIVE = {
  plan: 'Close the one coverage gap the L11.8 pass found: write DOC 10 to bootstrap §17, '
    + 'generated from a data module with a mutation-tested self-check, and give it the ticket '
    + 'it never had.',
  task: `${META.ticket} - DOC 10, this document`,
  pr: 'Held deliberately. PR #3828 (L11.2 and L11.4) is open with all eleven checks green and '
    + 'edits the same documents ledger this work edits. Opening a second PR against that file '
    + 'while the first awaits review is how an approval gets lost to a conflict, so this branch '
    + 'is pushed and its PR opens once #3828 merges.',
};

/** Run once, with CAPTURE_TAB=1, to record the migrating tab. Writes l05CurrentTab.json. */
function captureCurrentTab() {
  const git = (...args) => {
    try {
      return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch (e) {
      throw new Error(`l05Data: git ${args[0]} failed (${e.message.split('\n')[0]}). Section A is `
        + 'a measurement; a capture that cannot read git must fail rather than record a guess.');
    }
  };
  const base = git('merge-base', 'HEAD', 'origin/main');
  const log = git('log', '--format=%h %s', `${base}..HEAD`);
  const dirty = git('status', '--porcelain');
  const snap = {
    session: META.session,
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    head: git('rev-parse', '--short', 'HEAD'),
    mainSha: git('rev-parse', '--short', 'origin/main'),
    mergeBase: base.slice(0, 9),
    worktree: ROOT.replace(/\\/g, '/'),
    capturedAt: new Date().toISOString(),
    commits: log ? log.split('\n').filter(Boolean) : [],
    uncommitted: dirty ? dirty.split('\n').filter(Boolean).map((l) => l.trim()) : [],
    ...TAB_NARRATIVE,
  };
  fs.writeFileSync(TAB_FILE, `${JSON.stringify(snap, null, 1)}\n`, 'utf8');
  return snap;
}

/** The frozen snapshot, as rendered. */
function currentTab() {
  if (!fs.existsSync(TAB_FILE)) {
    throw new Error('l05Data: l05CurrentTab.json is missing. Section A is a one-time measurement '
      + 'of the migrating tab; run the build once with CAPTURE_TAB=1 to record it.');
  }
  const snap = JSON.parse(fs.readFileSync(TAB_FILE, 'utf8'));
  return {
    ...snap,
    ...TAB_NARRATIVE, // prose stays in source, where it can be reviewed in a diff
    frozen: `Captured ${snap.capturedAt}. Section A is a snapshot of the tab that performed the `
      + 'migration, not live repository state: a rebuild is not a new migration and does not '
      + 'claim a new section A. The uncommitted list is what was in flight at capture, which '
      + 'necessarily includes the files that became this document.',
  };
}

/** Section E. External dependencies, each with the board ticket that owns it. */
const EXTERNAL = [
  {
    system: 'Cloudflare Stream',
    state: 'WORKING',
    detail: 'Stream enabled, a scoped token minted, and the credentials installed in the '
      + 'production environment. The provider adapter is live and fail-closed without them.',
    todos: [10392808360, 10392808184],
    blocker: 'Three separate Cloudflare accounts have still not been consolidated or a reason '
      + 'documented for keeping them split. An operator does not currently know which account a '
      + 'given live input belongs to.',
    blockerTodo: 10392808269,
  },
  {
    system: 'Zoom',
    state: 'WORKING',
    detail: 'Live Streaming to a Custom Service is verified on the account, and custom RTMP has '
      + 'reached a Cloudflare live input in a real airing.',
    todos: [10392808352, 10392808194],
    blocker: 'The only transcript route in the repository requires a Zoom CLOUD recording. A '
      + 'local-only recording produces no transcript, so the videographer handoff depends on a '
      + 'Zoom setting rather than on anything this codebase controls.',
    blockerTodo: 10496601045,
  },
  {
    system: 'YouTube',
    state: 'UNVERIFIED',
    detail: 'Nothing has been confirmed. Channel ownership, live eligibility and the stream '
      + 'destination are all still unchecked.',
    todos: [],
    blocker: 'Simulcast and the raw-replay retention policy both sit behind this, and the '
      + 'verification ticket has no comments and is past due.',
    blockerTodo: 10392808241,
  },
  {
    system: 'Purchase - studio equipment',
    state: 'APPROVED, NOT INSTALLED',
    detail: 'The equipment list was researched and approved with live pricing, and the '
      + 'workstation laptop was specified and sourced.',
    todos: [10392808152, 10395987998],
    blocker: 'Nothing is installed. Camera, microphone, light and wired network, and the OBS and '
      + 'Zoom audio routing, are both still open and both owned by Piyush. DOC 13, the studio '
      + 'operator manual, is blocked on them rather than unwritten - a manual for equipment '
      + 'nobody has is untested prose.',
    blockerTodo: 10392808223,
  },
  {
    system: 'Voice and avatar',
    state: 'NOT STARTED ON THE BOARD',
    detail: 'All four tickets are open with no comments: verify the current official avatar '
      + 'workflow, record approved training footage with consent captured, choose and QA a voice '
      + 'clone, and write the real-versus-AI usage policy.',
    todos: [],
    blocker: 'The usage policy is the one that matters beyond the build. Until it exists there is '
      + 'no written rule about when an audience is watching a synthesized presenter, and that is '
      + 'a disclosure question rather than an engineering one.',
    blockerTodo: 10392808285,
  },
];

/** Everything countable, derived. Nothing below is typed. */
const TOTALS = (() => {
  const cited = new Set();
  TASKS.forEach((t) => t.todos.forEach((id) => cited.add(id)));
  const byCoverage = { COVERED: 0, PARTIAL: 0, NONE: 0 };
  TASKS.forEach((t) => { byCoverage[t.coverage] += 1; });
  const open = CENSUS.filter((r) => !r.completed);
  const completed = CENSUS.filter((r) => r.completed);
  // Board work with no counterpart in the 56-task plan, by subtraction rather than by listing.
  const boardOnly = CENSUS.filter((r) => !cited.has(r.id));
  const byPhase = {};
  PHASES.forEach((p) => {
    const ts = TASKS.filter((t) => t.id.startsWith(`P${p.id}-`));
    byPhase[p.id] = {
      tasks: ts.length,
      covered: ts.filter((t) => t.coverage === 'COVERED').length,
      partial: ts.filter((t) => t.coverage === 'PARTIAL').length,
      none: ts.filter((t) => t.coverage === 'NONE').length,
    };
  });
  return {
    todos: CENSUS.length,
    completed: completed.length,
    open: open.length,
    containers: new Set(CENSUS.map((r) => r.containerId)).size,
    phases: PHASES.length,
    tasks: TASKS.length,
    byCoverage,
    byPhase,
    citedTodos: cited.size,
    boardOnly: boardOnly.length,
    boardOnlyRows: boardOnly,
    paths: PHASES.reduce((n, p) => n + p.files.length + p.tests.length, 0),
    noTests: PHASES.filter((p) => p.tests.length === 0).map((p) => p.id),
    external: EXTERNAL.length,
  };
})();

/**
 * Section F, derived rather than chosen: the earliest-due open todo in the census. Ties break on
 * the lower id, which is creation order, so the rule is total and the answer is reproducible.
 */
const NEXT = (() => {
  const open = CENSUS.filter((r) => !r.completed && r.due_on);
  const sorted = [...open].sort((a, b) => (a.due_on === b.due_on ? a.id - b.id
    : (a.due_on < b.due_on ? -1 : 1)));
  const earliest = sorted[0];
  const sameDay = open.filter((r) => r.due_on === earliest.due_on);
  return {
    todo: earliest,
    sameDay,
    rule: 'The earliest due date among the open todos, ties broken by creation order. Stated as a '
      + 'rule so the answer is reproducible rather than a preference.',
    /**
     * The derived answer is not fudged to look better. Applying the rule honestly returns a
     * ticket whose work has demonstrably already happened, and THAT is the finding: section F's
     * mechanical output is a measurement of how stale the board is, not a work instruction.
     */
    caveat: 'Applying that rule returns the most overdue ticket, and the answer is instructive '
      + 'rather than actionable: L5.3 asks for a first private technical airing from Zoom '
      + 'through Cloudflare to the Colaberry player, and production holds broadcast occurrences '
      + 'for 15 and 20 October plus a recording from 13 October. The work happened; the ticket '
      + 'was never closed. So the honest output of section F is two things, not one. The next '
      + 'BOARD action is to close or re-scope the overdue tickets whose work is already done, '
      + 'because a board this stale cannot be used to choose anything. The next BUILD action is '
      + 'the finding below.',
    // The report's own loudest finding, kept separate from the derived answer so neither
    // contaminates the other.
    finding: 'P7-06, gated activation. The release switch BROADCAST_ENABLED is declared in '
      + 'backend/.env.example and nowhere else: not in any compose file, not in the deploy '
      + 'script, not in CI. Every broadcast route therefore answers 404 in production. It has no '
      + 'board ticket. It is one line of configuration standing between a deployed codebase and '
      + 'a feature that exists for a viewer, and it is the cheapest high-value item in this '
      + 'report.',
  };
})();

/** Things this report is NOT allowed to contain, each with the reason it is banned. */
const BANNED = [
  { re: /\bthe feature is live\b/i, why: 'the release switch is unset, so it is not' },
  { re: /\ball (?:documents|eighteen documents) (?:are )?complete\b/i, why: 'DOC 13 is blocked' },
  {
    re: /(?:TOKEN|SECRET|KEY_PEM|CLIENT_SECRET)\s*[=:]\s*["']?[A-Za-z0-9_\-/+]{12,}/,
    why: 'a credential VALUE, and this document is attached to a Basecamp ticket',
  },
  {
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    why: 'a private key block',
  },
];

function selfCheck() {
  const fail = (m) => { throw new Error(`l05Data: ${m}`); };
  const ids = new Set(CENSUS.map((r) => r.id));

  // 1. The reconciliation covers the plan exactly once, with no task missing and none invented.
  const seen = new Set();
  const expected = [];
  for (let p = 1; p <= 7; p += 1) {
    for (let n = 1; n <= 8; n += 1) expected.push(`P${p}-${String(n).padStart(2, '0')}`);
  }
  if (TASKS.length !== 56) fail(`the plan has 56 parent tasks; TASKS holds ${TASKS.length}`);
  TASKS.forEach((t) => {
    if (seen.has(t.id)) fail(`task ${t.id} appears twice`);
    seen.add(t.id);
  });
  expected.forEach((id) => {
    if (!seen.has(id)) fail(`task ${id} is in the 7-phase plan but missing from TASKS`);
  });

  // 2. Coverage is declared, and anything short of COVERED must say what is missing. "Partial"
  //    without a named gap carries no information at all.
  TASKS.forEach((t) => {
    if (!['COVERED', 'PARTIAL', 'NONE'].includes(t.coverage)) {
      fail(`task ${t.id} has coverage "${t.coverage}"`);
    }
    if (t.coverage !== 'COVERED' && !t.gap) {
      fail(`task ${t.id} is ${t.coverage} but names no gap; a partial with no stated gap says nothing`);
    }
    if (t.coverage === 'NONE' && t.todos.length) {
      fail(`task ${t.id} claims NONE but cites ${t.todos.length} todo(s)`);
    }
    if (t.coverage !== 'NONE' && !t.todos.length) {
      fail(`task ${t.id} claims ${t.coverage} but cites no todo`);
    }
  });

  // 3. Every Basecamp id cited anywhere resolves in the measured census. A typo in a governance
  //    document becomes a dead link that a reader blames on Basecamp.
  const checkIds = (list, where) => list.forEach((id) => {
    if (!ids.has(id)) fail(`${where} cites todo ${id}, which is not in the ${CENSUS.length}-row census`);
  });
  TASKS.forEach((t) => checkIds(t.todos, `task ${t.id}`));
  EXTERNAL.forEach((e) => {
    checkIds(e.todos, `external "${e.system}"`);
    checkIds([e.blockerTodo], `external "${e.system}" blocker`);
    if (!e.blocker) fail(`external "${e.system}" names no blocker`);
  });

  // 4. Sections C and D partition the board. Completed plus open must be every row, or the
  //    report is describing a different board than the one it measured.
  if (TOTALS.completed + TOTALS.open !== TOTALS.todos) {
    fail(`C (${TOTALS.completed}) + D (${TOTALS.open}) != ${TOTALS.todos} census rows`);
  }
  if (TOTALS.byCoverage.COVERED + TOTALS.byCoverage.PARTIAL + TOTALS.byCoverage.NONE !== 56) {
    fail('coverage counts do not sum to 56');
  }

  // 5. Section B is complete for every phase: all six §17 attributes present or explicitly empty,
  //    and every path it names exists on disk. This is the guard that stops the document telling
  //    a reader to open a file that was renamed.
  if (PHASES.length !== 7) fail(`§17 asks for Phase 1-7; PHASES holds ${PHASES.length}`);
  PHASES.forEach((p) => {
    ['title', 'exists', 'deployed', 'blockers', 'flagNote'].forEach((k) => {
      if (!p[k] || !String(p[k]).trim()) fail(`phase ${p.id} has no ${k}`);
    });
    if (!Array.isArray(p.files) || !p.files.length) fail(`phase ${p.id} names no files`);
    [...p.files, ...p.tests].forEach((rel) => {
      if (!fs.existsSync(path.join(ROOT, rel))) {
        fail(`phase ${p.id} names ${rel}, which is not on disk`);
      }
    });
  });

  // 6. A phase with no tests must say so in its blockers rather than leave the reader to notice
  //    the empty list. Phase 5 is unbuilt and Phase 7 is a process phase; both are legitimate,
  //    and both have to be stated.
  TOTALS.noTests.forEach((id) => {
    const p = PHASES.find((x) => x.id === id);
    if (!/not built|n\/a|no load test|unbuilt|nothing to gate/i.test(`${p.blockers} ${p.exists} ${p.deployed}`)) {
      fail(`phase ${id} has no tests and does not say why`);
    }
  });

  // 7. The deployed-versus-enabled distinction survives. This is the report's loudest finding and
  //    the easiest one for a later edit to soften into "deployed", which would make the document
  //    actively misleading.
  const p7 = PHASES.find((p) => p.id === 7);
  if (!/dark/i.test(p7.deployed) || !/404/.test(p7.deployed)) {
    fail('phase 7 must state that the feature is dark and that the routes answer 404');
  }
  if (!/deployed and enabled are two different states/i.test(p7.deployed)) {
    fail('phase 7 must refuse to collapse deployed and enabled');
  }
  if (!/no compose file|no docker-compose/i.test(p7.flagNote) || !/no CI/i.test(p7.flagNote)) {
    fail('phase 7 must say where the release switch is NOT declared');
  }

  // 8. The lateness is stated. Without this the document reads as the §17 gate it was not.
  if (!/retrospective/i.test(RETRO.consequence)) fail('RETRO must call the report retrospective');
  if (!/should not be cited as evidence/i.test(RETRO.consequence)) {
    fail('RETRO must refuse to be cited as evidence that the §17 gate was honored');
  }

  // 9. Section F is the derived answer, not a chosen one.
  const open = CENSUS.filter((r) => !r.completed && r.due_on);
  const minDue = open.reduce((m, r) => (r.due_on < m ? r.due_on : m), open[0].due_on);
  if (NEXT.todo.due_on !== minDue) {
    fail(`NEXT names a todo due ${NEXT.todo.due_on} but the earliest open due date is ${minDue}`);
  }
  if (NEXT.sameDay.length !== open.filter((r) => r.due_on === minDue).length) {
    fail('NEXT.sameDay does not hold every todo sharing the earliest due date');
  }
  // The derived answer points at work that is already done. If that caveat is ever dropped, the
  // document starts instructing a reader to redo an airing that happened three times.
  if (!/already happened|already done/i.test(NEXT.caveat)) {
    fail('NEXT.caveat must say that the derived answer points at work already done');
  }
  if (!/next BUILD action/i.test(NEXT.caveat)) {
    fail('NEXT.caveat must separate the board action from the build action');
  }

  // 10. This ticket is NOT in the census, because the census was measured before it existed. The
  //     document has to say so, or its own 87 looks like it forgot to count itself.
  if (ids.has(META.ticketId)) {
    fail(`census contains ${META.ticketId}; it was measured before L0.5 was created, so either the `
      + 'census was re-measured or the id is wrong - either way the document\'s account is stale');
  }

  // 11. Board work with no place in the plan is found by subtraction. If this ever reads zero,
  //     the reconciliation has stopped looking in the direction that found DOC 10.
  if (TOTALS.boardOnly <= 0) {
    fail('no board todo is uncited, which means the reconciliation is no longer checking the '
      + 'board-to-plan direction - the direction that found DOC 10 in the first place');
  }
  if (TOTALS.citedTodos + TOTALS.boardOnly !== TOTALS.todos) {
    fail(`cited (${TOTALS.citedTodos}) + board-only (${TOTALS.boardOnly}) != ${TOTALS.todos}`);
  }

  // 12. Section A is a real captured measurement carrying every field §17 names, and it says it
  //     is frozen. Without the last part a reader takes a stale branch name for live state.
  const tab = currentTab();
  ['session', 'branch', 'head', 'plan', 'task', 'pr', 'capturedAt'].forEach((k) => {
    if (!tab[k] || !String(tab[k]).trim()) fail(`section A has no ${k}; §17 names it`);
  });
  if (!Array.isArray(tab.commits) || !Array.isArray(tab.uncommitted)) {
    fail('section A must carry commits and uncommitted as measured lists');
  }
  if (Number.isNaN(Date.parse(tab.capturedAt))) {
    fail(`section A capturedAt "${tab.capturedAt}" is not a date`);
  }
  if (tab.session !== META.session) {
    fail(`section A was captured by session ${tab.session}, not ${META.session}`);
  }
  if (!/not live repository state/i.test(tab.frozen)) {
    fail('section A must disclose that it is a frozen snapshot, not live state');
  }

  return TOTALS;
}

/** Applied to the rendered document, where a banned phrase would actually mislead someone. */
function checkText(md) {
  BANNED.forEach((b) => {
    const m = md.match(b.re);
    if (m) throw new Error(`l05Data: the document contains "${String(m[0]).slice(0, 48)}" - ${b.why}`);
  });
}

module.exports = {
  META, RETRO, CENSUS, PHASES, TASKS, EXTERNAL, TOTALS, NEXT, BANNED,
  captureCurrentTab, currentTab, selfCheck, checkText,
};
