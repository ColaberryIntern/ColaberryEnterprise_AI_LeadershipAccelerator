/**
 * l05Document — DOC 10's generated Markdown, its rendered PDF, and the check that the file on
 * disk is what the data renders.
 *
 * THE DOCUMENT IS NEVER HAND-EDITED. Every figure in it comes from l05Data or l05Phases, and
 * `selfCheck` refuses if the committed Markdown differs from what the data renders. A migration
 * report whose numbers can be touched up by hand is worth nothing: its only claim on a reader's
 * trust is that it was measured.
 *
 * THE SIX SECTIONS ARE PINNED BY NAME, not by count. §17 names A through F, and a check that
 * merely counted six headings would pass a document that had quietly renamed one of them.
 */
const fs = require('fs');
const path = require('path');
const D = require('./l05Data');
const { TOKENS, esc, baseCss, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..', '..');

/** §17's own section names. The document must carry these, spelled this way. */
const SECTIONS = [
  'A. Current tab',
  'B. Broadcast system current state',
  'C. Work already completed',
  'D. Work still outstanding',
  'E. External blockers',
  'F. Next task',
];

const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const bc = (id) => `[${id}](https://app.basecamp.com/3945211/buckets/${D.META.board}/todos/${id})`;
const group = (r) => (r.group || r.list).replace(/^Colaberry Live[^/]*\/\s*/, '');

function markdown() {
  const A = D.currentTab();
  const T = D.TOTALS;
  const out = [];
  const p = (s) => out.push(s);

  p(`# COLABERRY LIVE — CURRENT BUILD MIGRATION REPORT`);
  p('');
  p(`**DOC 10** · ticket ${D.META.ticket} (${bc(D.META.ticketId)}) · owner ${D.META.owner} · `
    + `built ${D.META.built} · session ${D.META.session}`);
  p('');
  p(`> **This report is late, and that changes how it should be read.** Bootstrap §17 requires it `
    + `with the words "${D.RETRO.required}". ${D.RETRO.reality} ${D.RETRO.consequence}`);
  p('');

  p('## How to read this report');
  p('');
  p('Not every part of this document carries the same weight, so each part says which it is.');
  p('');
  p('| Part | Status | How it was produced |');
  p('|---|---|---|');
  p('| Section A | Measured | Read from `git` during the build that wrote this file. |');
  p(`| Section B paths | Measured | All ${T.paths} file and test paths are \`stat\`'ed on every `
    + 'build; a path that does not exist fails the build. |');
  p('| Section B prose | Surveyed | A read-only pass over the repository, 10 November 2026. |');
  p(`| Sections C and D | Measured | The ${T.todos}-row Basecamp census pulled from production on `
    + `${D.META.censusMeasured}, committed at \`${D.META.census}\` so the counts can be re-run. |`);
  p(`| The ${T.tasks}-task reconciliation | **Judged** | The one judged part. Constrained from `
    + 'both directions by the self-check, but the mapping itself is an opinion. |');
  p('| Section F | Derived | A stated rule applied to the census, not a preference. |');
  p('');
  p('The phase definitions are **not** in the bootstrap. §17 asks section B to cover "every known '
    + `Phase 1-7 area" without defining the phases; the authoritative table is \`${D.META.phasePlan}\` `
    + `§5, which names ${T.tasks} parent tasks P1-01 through P7-08.`);
  p('');
  p(`A note on the count: this report describes ${T.todos} todos, and ${D.META.ticket} — the `
    + 'ticket that produced it — is not among them. The census was measured before this ticket '
    + 'existed. It is the 88th.');
  p('');

  // ---- A
  p(`## ${SECTIONS[0]}`);
  p('');
  p('| Field | Value |');
  p('|---|---|');
  p(`| Session ID | \`${A.session}\` |`);
  p(`| Branch | \`${A.branch}\` |`);
  p(`| Worktree | \`${A.worktree}\` |`);
  p(`| HEAD | \`${A.head}\` |`);
  p(`| \`origin/main\` | \`${A.mainSha}\` |`);
  p(`| Merge base | \`${A.mergeBase}\` |`);
  p(`| Captured at | ${A.capturedAt} |`);
  p(`| Current plan | ${cell(A.plan)} |`);
  p(`| Current task | ${cell(A.task)} |`);
  p(`| Commits on this branch | ${A.commits.length ? A.commits.map((c) => `\`${c}\``).join('<br>') : 'none at build time'} |`);
  p(`| Uncommitted files | ${A.uncommitted.length ? A.uncommitted.map((f) => `\`${f}\``).join('<br>') : 'none'} |`);
  p(`| PR | ${cell(A.pr)} |`);
  p('');
  p(`*${A.frozen}*`);
  p('');

  // ---- B
  p(`## ${SECTIONS[1]}`);
  p('');
  p('§17 asks for six attributes per phase: what exists, files, tests, deployed or not, flag '
    + 'state, blockers. All six appear for all seven phases below. Flag entries name **variables '
    + 'only, never values**.');
  p('');
  p('| Phase | Tasks | Covered | Partial | No ticket |');
  p('|---|---|---|---|---|');
  D.PHASES.forEach((ph) => {
    const b = T.byPhase[ph.id];
    p(`| **${ph.id}. ${cell(ph.title)}** | ${b.tasks} | ${b.covered} | ${b.partial} | `
      + `${b.none ? `**${b.none}**` : '0'} |`);
  });
  p('');
  D.PHASES.forEach((ph) => {
    p(`### Phase ${ph.id} — ${ph.title}`);
    p('');
    p(`*Dependencies: ${ph.deps}. Exit: ${ph.exit}.*`);
    p('');
    p(`**What exists.** ${ph.exists}`);
    p('');
    p(`**Files.** ${ph.files.map((f) => `\`${f}\``).join(' · ')}`);
    p('');
    p(`**Tests.** ${ph.tests.length ? ph.tests.map((f) => `\`${f}\``).join(' · ')
      : '**None.** See blockers.'}`);
    p('');
    p(`**Deployed.** ${ph.deployed}`);
    p('');
    p(`**Flag state.** ${ph.flags.length ? ph.flags.map((f) => `\`${f}\``).join(', ')
      : 'No flag.'} — ${ph.flagNote}`);
    p('');
    p(`**Blockers.** ${ph.blockers}`);
    p('');
  });

  // ---- C
  p(`## ${SECTIONS[2]}`);
  p('');
  p(`${T.completed} of ${T.todos} todos are complete. Each is a Basecamp id, which is the `
    + 'evidence §17 asks for: the completion and its comment thread live on the ticket.');
  p('');
  p('| Todo | Group | Title | Comments |');
  p('|---|---|---|---|');
  D.CENSUS.filter((r) => r.completed).forEach((r) => {
    p(`| ${bc(r.id)} | ${cell(group(r))} | ${cell(r.title)} | ${r.comments == null ? '?' : r.comments} |`);
  });
  p('');

  // ---- D
  p(`## ${SECTIONS[3]}`);
  p('');
  p(`${T.open} todos are open. But the more useful question is not how many tickets are open — it `
    + `is whether the board and the plan are describing the same system. They are not.`);
  p('');
  p(`- Of the ${T.tasks} parent tasks in the seven-phase plan, **${T.byCoverage.COVERED} are `
    + `covered** by board tickets, **${T.byCoverage.PARTIAL} are partially covered**, and `
    + `**${T.byCoverage.NONE} have no ticket at all**.`);
  p(`- Of the ${T.todos} todos on the board, **${T.citedTodos} correspond to a planned task** and `
    + `**${T.boardOnly} have no place in the plan**.`);
  p('');
  p('That second number is not a criticism of the board. It is where the physical studio, the '
    + 'avatar and voice work, the project documents and the entire 26-ticket first-class ladder '
    + 'live — real work the seven-phase plan never contemplated. It is recorded because a '
    + 'reconciliation that could only find gaps in one direction would have missed DOC 10 itself.');
  p('');
  p(`### The ${T.tasks}-task reconciliation`);
  p('');
  p('This is the judged part of the report. `NONE` means no ticket on the board covers the task; '
    + 'anything short of `COVERED` has to name what is missing.');
  p('');
  p('| Task | Work | Coverage | Tickets | Gap |');
  p('|---|---|---|---|---|');
  D.TASKS.forEach((t) => {
    p(`| \`${t.id}\` | ${cell(t.work)} | ${t.coverage === 'NONE' ? '**NONE**' : t.coverage} | `
      + `${t.todos.map(bc).join(' ') || '—'} | ${cell(t.gap || '')} |`);
  });
  p('');
  p('### Open todos');
  p('');
  p('| Todo | Group | Title | Due | Owner |');
  p('|---|---|---|---|---|');
  D.CENSUS.filter((r) => !r.completed).forEach((r) => {
    p(`| ${bc(r.id)} | ${cell(group(r))} | ${cell(r.title)} | ${r.due_on || '—'} | `
      + `${cell(r.assignees.join(', ') || 'unassigned')} |`);
  });
  p('');

  // ---- E
  p(`## ${SECTIONS[4]}`);
  p('');
  D.EXTERNAL.forEach((e) => {
    p(`### ${e.system} — ${e.state}`);
    p('');
    p(e.detail);
    p('');
    p(`**Blocker.** ${e.blocker} (${bc(e.blockerTodo)})`);
    p('');
  });

  // ---- F
  p(`## ${SECTIONS[5]}`);
  p('');
  p(`**The rule.** ${D.NEXT.rule}`);
  p('');
  p(`**The answer it returns.** ${bc(D.NEXT.todo.id)} — ${D.NEXT.todo.title}, due `
    + `${D.NEXT.todo.due_on}.`);
  p('');
  p(`**Why that answer is a finding rather than an instruction.** ${D.NEXT.caveat}`);
  p('');
  p(`**The next build action.** ${D.NEXT.finding}`);
  p('');
  p('---');
  p('');
  p(`*Generated from \`scripts/artifacts/tickets/l05Data.js\` and \`l05Phases.js\`. Do not edit `
    + `this file by hand — the build refuses if it differs from what the data renders.*`);
  p('');
  return out.join('\n');
}

function selfCheck() {
  const fail = (m) => { throw new Error(`l05Document: ${m}`); };
  D.selfCheck();
  const md = markdown();

  // §17's six sections, pinned by name. A count of six would pass a renamed section.
  SECTIONS.forEach((s) => {
    if (!md.includes(`## ${s}`)) fail(`the document has no section "${s}"`);
  });

  // The lateness has to be in the lead, not buried. If a reader reaches section B without
  // knowing this report is retrospective, the document has misled them.
  const lead = md.slice(0, md.indexOf('## How to read'));
  if (!/§17/.test(lead) || !/retrospective/i.test(lead)) {
    fail('the lead must cite §17 and call the report retrospective');
  }

  // Every phase renders all six §17 attributes.
  D.PHASES.forEach((ph) => {
    const start = md.indexOf(`### Phase ${ph.id} — `);
    if (start < 0) fail(`phase ${ph.id} is not rendered`);
    const next = md.indexOf('### Phase ', start + 1);
    const body = md.slice(start, next < 0 ? md.indexOf('## C. Work already') : next);
    ['What exists.', 'Files.', 'Tests.', 'Deployed.', 'Flag state.', 'Blockers.'].forEach((k) => {
      if (!body.includes(`**${k}**`)) fail(`phase ${ph.id} does not render "${k}"`);
    });
  });

  // Every census row appears exactly once, in C if complete and in D if not. This is the guard
  // that makes "C and D account for the whole board" a property of the DOCUMENT and not just of
  // the data: a rendering bug that dropped rows would otherwise pass silently.
  const cSection = md.slice(md.indexOf('## C. Work already'), md.indexOf('## D. Work still'));
  const dSection = md.slice(md.indexOf('### Open todos'), md.indexOf('## E. External'));
  D.CENSUS.forEach((r) => {
    const where = r.completed ? cSection : dSection;
    const other = r.completed ? dSection : cSection;
    if (!where.includes(`/todos/${r.id})`)) {
      fail(`todo ${r.id} is ${r.completed ? 'complete' : 'open'} but missing from section `
        + `${r.completed ? 'C' : 'D'}`);
    }
    if (other.includes(`/todos/${r.id})`)) {
      fail(`todo ${r.id} appears in both section C and the open-todo table`);
    }
  });

  // The bidirectional count has to be stated in prose, with both numbers. This is the report's
  // actual contribution and the easiest thing for a later edit to drop as "detail".
  if (!md.includes(`${D.TOTALS.byCoverage.NONE} have no ticket at all`)) {
    fail('section D must state how many planned tasks have no ticket');
  }
  if (!md.includes(`${D.TOTALS.boardOnly} have no place in the plan`)) {
    fail('section D must state how many board todos have no planned task');
  }

  // Every task with no coverage must be visibly marked, not quietly rendered as ordinary.
  D.TASKS.filter((t) => t.coverage === 'NONE').forEach((t) => {
    if (!md.includes(`\`${t.id}\``)) fail(`task ${t.id} has no ticket and is not in the table`);
  });

  // Nothing banned, including anything shaped like a credential value.
  D.checkText(md);

  // And the committed file is what the data renders.
  const abs = path.join(ROOT, D.META.file);
  if (fs.existsSync(abs)) {
    if (fs.readFileSync(abs, 'utf8') !== md) {
      fail(`${D.META.file} differs from what the data renders; rebuild rather than hand-editing`);
    }
  }
  return true;
}

/** The one-page visual lives in l05Visual; this is the full record PDF. */
function build() {
  const T = D.TOTALS;
  const A = D.currentTab();
  const phaseRows = D.PHASES.map((ph) => {
    const b = T.byPhase[ph.id];
    const sev = b.none === 0 ? TOKENS.SEV.ok : (b.none <= 2 ? TOKENS.SEV.watch : TOKENS.SEV.bad);
    return `<tr>
      <td><strong>${ph.id}. ${esc(ph.title)}</strong></td>
      <td>${b.covered}</td><td>${b.partial}</td>
      <td><span class="chip" style="background:${sev}">${b.none}</span></td>
      <td>${esc(ph.deployed)}</td></tr>`;
  }).join('');

  const noneRows = D.TASKS.filter((t) => t.coverage === 'NONE').map((t) => `<tr>
      <td><code>${t.id}</code></td><td>${esc(t.work)}</td><td>${esc(t.gap)}</td></tr>`).join('');

  const extRows = D.EXTERNAL.map((e) => `<tr>
      <td><strong>${esc(e.system)}</strong></td><td>${esc(e.state)}</td>
      <td>${esc(e.blocker)}</td></tr>`).join('');

  const body = `
  <h1>DOC 10 — Current Build Migration Report</h1>
  <div class="meta">${D.META.ticket} · board ${D.META.board} · built ${D.META.built} ·
    session ${D.META.session} · census measured ${D.META.censusMeasured}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">The board and the plan are describing two different systems.
      ${T.byCoverage.NONE} of the ${T.tasks} planned tasks have no ticket at all, and
      ${T.boardOnly} of the ${T.todos} tickets have no place in the plan.</div>
  </div>

  <div class="note warn"><strong>This report is late.</strong> §17 requires it with the words
    &ldquo;${esc(D.RETRO.required)}&rdquo;. ${esc(D.RETRO.reality)} ${esc(D.RETRO.consequence)}</div>

  <div class="cards">
    <div class="card"><div class="n">${T.todos}</div><div class="k">todos measured</div></div>
    <div class="card"><div class="n">${T.completed}</div><div class="k">complete</div></div>
    <div class="card"><div class="n">${T.byCoverage.NONE}</div><div class="k">planned tasks with no ticket</div></div>
    <div class="card"><div class="n">${T.boardOnly}</div><div class="k">tickets outside the plan</div></div>
  </div>

  <h2>Plan coverage, all ${T.tasks} tasks</h2>
  ${stackBar({
    parts: [
      { label: `Covered (${T.byCoverage.COVERED})`, value: T.byCoverage.COVERED, color: TOKENS.SEV.ok },
      { label: `Partial (${T.byCoverage.PARTIAL})`, value: T.byCoverage.PARTIAL, color: TOKENS.SEV.watch },
      { label: `No ticket (${T.byCoverage.NONE})`, value: T.byCoverage.NONE, color: TOKENS.SEV.bad },
    ],
  })}

  <h2>B. Broadcast system current state</h2>
  <table><thead><tr><th>Phase</th><th>Covered</th><th>Partial</th><th>No ticket</th>
    <th>Deployed</th></tr></thead><tbody>${phaseRows}</tbody></table>

  <h2>The ${T.byCoverage.NONE} planned tasks with no ticket</h2>
  <table><thead><tr><th>Task</th><th>Work</th><th>Why it matters</th></tr></thead>
    <tbody>${noneRows}</tbody></table>

  <h2>E. External blockers</h2>
  <table><thead><tr><th>System</th><th>State</th><th>Blocker</th></tr></thead>
    <tbody>${extRows}</tbody></table>

  <h2>F. Next task</h2>
  <div class="note"><strong>Rule.</strong> ${esc(D.NEXT.rule)}<br><br>
    <strong>Answer.</strong> ${esc(D.NEXT.todo.title)} (due ${D.NEXT.todo.due_on}).<br><br>
    ${esc(D.NEXT.caveat)}</div>
  <div class="note warn"><strong>Next build action.</strong> ${esc(D.NEXT.finding)}</div>

  <h2>A. Current tab</h2>
  <table><tbody>
    <tr><td>Session</td><td><code>${esc(A.session)}</code></td></tr>
    <tr><td>Branch</td><td><code>${esc(A.branch)}</code></td></tr>
    <tr><td>HEAD / origin/main</td><td><code>${esc(A.head)}</code> / <code>${esc(A.mainSha)}</code></td></tr>
    <tr><td>Captured at</td><td>${esc(A.capturedAt)}</td></tr>
    <tr><td>PR</td><td>${esc(A.pr)}</td></tr>
  </tbody></table>
  <div class="meta">${esc(A.frozen)}</div>

  <div class="meta" style="margin-top:14px">Sections C and D in full, with every Basecamp id, are
    in <code>${esc(D.META.file)}</code>. Generated from
    <code>l05Data.js</code> and <code>l05Phases.js</code>.</div>
  `;
  return htmlDoc({ title: 'DOC 10 — Current Build Migration Report', css: baseCss(), body });
}

module.exports = { SECTIONS, selfCheck, markdown, build };
