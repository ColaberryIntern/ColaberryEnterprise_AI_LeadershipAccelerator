/**
 * l114Document — DOC 14's self-check, its generated Markdown, and the rendered PDF.
 *
 * THE LOAD-BEARING CHECK IS THAT EVERY PATH EXISTS. L11.4's criterion is that the runbook be
 * readable by a future session with no chat history, and such a session cannot tell a renamed
 * module from its own mistake. A runbook that says "open X" when X is gone does not merely fail
 * to help — it teaches the reader to stop trusting the document, which costs more than the
 * missing answer.
 *
 * So every path in the reference tables, every file named in every procedure step, and every
 * flag's home is stat'ed; and every environment variable has to be referenced somewhere in the
 * backend source, found with `git grep` rather than a declared allowlist.
 *
 * `git grep` failing is an ERROR rather than a pass. A check that silently degrades to "found
 * nothing wrong" when its tool is unavailable is worse than no check, because its green is
 * indistinguishable from a real one.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const D = require('./l114Data');
const { SECTIONS } = require('./l114Sections');
const { TOKENS, esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..', '..');

const TABLES = {
  PATHS: { rows: D.PATHS, head: ['Path', 'What it owns'], cols: ['path', 'owns'], code: 0 },
  MODELS: { rows: D.MODELS, head: ['Path', 'What it owns'], cols: ['path', 'owns'], code: 0 },
  ROUTES: { rows: D.ROUTES, head: ['Path', 'What it carries'], cols: ['path', 'owns'], code: 0 },
  TESTS: { rows: D.TESTS, head: ['Path', 'What it covers'], cols: ['path', 'owns'], code: 0 },
  FLAGS: { rows: D.FLAGS, head: ['Flag', 'Read in', 'What to know'],
    cols: ['name', 'where', 'note'], code: 1 },
  ENVS: { rows: D.ENVS, head: ['Variable', 'Purpose'], cols: ['name', 'purpose'], code: 0 },
  FAILURES: { rows: D.FAILURES, head: ['Symptom', 'Usual cause', 'What to do'],
    cols: ['symptom', 'cause', 'fix'], code: -1 },
};

/** Everything the check must find on disk. */
function declaredPaths() {
  const out = [];
  [D.PATHS, D.MODELS, D.ROUTES, D.TESTS].forEach((set) => {
    set.forEach((r) => out.push({ p: r.path, from: 'reference table' }));
  });
  D.FLAGS.forEach((f) => out.push({ p: f.where, from: `flag ${f.name}` }));
  D.PROCEDURES.forEach((proc) => {
    proc.steps.forEach((s, i) => {
      s.files.forEach((f) => out.push({ p: f, from: `${proc.key} step ${i + 1}` }));
    });
  });
  return out;
}

/**
 * Searches `backend/src` ONLY, deliberately not `.env.example`.
 *
 * The first version included the example file, which made the check useless for the thing it
 * exists to catch: a variable listed in `.env.example` that nothing reads would have passed,
 * while a documented variable nothing reads is as misleading as a missing one — it invites
 * somebody to set it and conclude the feature is on. All nine pass against `backend/src` alone,
 * so the stricter version costs nothing and actually discriminates.
 */
function envReferenced(name) {
  try {
    const out = execFileSync('git', ['grep', '-l', '--', name, 'backend/src'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim().length > 0;
  } catch (e) {
    // git grep exits 1 for "no match", which is a real answer. Anything else is the tool
    // failing, and a tool failure must not read as a pass.
    if (e.status === 1) return false;
    throw new Error(`git grep is unavailable, so the environment-variable check cannot run and `
      + `must not report success: ${e.message}`);
  }
}

function selfCheck() {
  // 1. THE NINETEEN SECTIONS THE BOOTSTRAP REQUIRES.
  if (SECTIONS.length !== 19) {
    throw new Error(`${SECTIONS.length} sections, the bootstrap requires 19`);
  }
  SECTIONS.forEach((s) => {
    if (!s.heading || !s.heading.trim()) throw new Error('a section has no heading');
    if (!s.body && !s.table) {
      throw new Error(`section "${s.heading}" has neither prose nor a table`);
    }
    if (s.table && !s.table.startsWith('PROC:') && !TABLES[s.table]) {
      throw new Error(`section "${s.heading}" names unknown table ${s.table}`);
    }
    if (s.table && s.table.startsWith('PROC:')) {
      const key = s.table.slice(5);
      if (!D.PROCEDURES.some((p) => p.key === key)) {
        throw new Error(`section "${s.heading}" names unknown procedure ${key}`);
      }
    }
  });

  // 2. THE LOAD-BEARING CHECK: EVERY PATH THIS RUNBOOK NAMES MUST EXIST.
  const missing = declaredPaths().filter((d) => !fs.existsSync(path.join(ROOT, d.p)));
  if (missing.length) {
    throw new Error(`${missing.length} path(s) this runbook tells a reader to open do not exist:\n  `
      + missing.map((m) => `${m.p}  (${m.from})`).join('\n  '));
  }

  // 3. EVERY ENVIRONMENT VARIABLE MUST BE REFERENCED IN THE SOURCE. A documented variable that
  //    nothing reads is as misleading as a missing one: it invites somebody to set it and
  //    conclude the feature is on.
  const unref = D.ENVS.filter((e) => !envReferenced(e.name));
  if (unref.length) {
    throw new Error(`${unref.length} documented env var(s) are referenced nowhere in the source: `
      + unref.map((e) => e.name).join(', '));
  }

  // 4. THE PROCEDURES MUST BE REAL RECIPES. The three "how to" sections are the part of this
  //    document a future session actually acts on, so a stub is worse here than anywhere else.
  D.PROCEDURES.forEach((p) => {
    if (!p.why || p.why.trim().length < 60) {
      throw new Error(`procedure "${p.key}" does not say why the contract exists`);
    }
    if (p.steps.length < 3) {
      throw new Error(`procedure "${p.key}" has ${p.steps.length} steps; a recipe needs at least 3`);
    }
    p.steps.forEach((s, i) => {
      if (!s.do || s.do.trim().length < 30) {
        throw new Error(`procedure "${p.key}" step ${i + 1} has no instruction`);
      }
      if (!s.files.length) {
        throw new Error(`procedure "${p.key}" step ${i + 1} names no file; a step a reader `
          + 'cannot locate is not actionable');
      }
    });
  });

  // 5. THE FALSE LEADS. Not required by the bootstrap, and the part that most directly serves
  //    "readable by a future session with no chat history" — each is an hour that session would
  //    otherwise lose. Required to be present and complete.
  if (!D.TRAPS.length) throw new Error('the false-leads section is empty');
  D.TRAPS.forEach((t) => {
    if (!t.thing || !t.looks || !t.is) {
      throw new Error(`a false-lead entry is incomplete: ${JSON.stringify(t)}`);
    }
  });

  // 6. THE FILE ON DISK MUST BE WHAT THE DATA RENDERS.
  const abs = path.join(ROOT, D.META.file);
  if (!fs.existsSync(abs)) throw new Error(`DOC 14 missing: ${D.META.file}`);
  const onDisk = fs.readFileSync(abs, 'utf8');
  if (onDisk !== markdown()) {
    throw new Error('DOC 14 on disk differs from what the data module renders. It is generated — '
      + 're-run the builder, and move any hand-edit into l114Data.js or l114Sections.js.');
  }

  // 7. NAVIGABILITY.
  if (!onDisk.includes('DOC 00')) throw new Error('DOC 14 never points back at DOC 00');

  return true;
}

const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

function renderTable(name) {
  const t = TABLES[name];
  const head = `| ${t.head.join(' | ')} |\n|${t.head.map(() => '---').join('|')}|`;
  const rows = t.rows.map((r) => `| ${t.cols.map((c, i) => {
    const v = cell(r[c]);
    return i === t.code ? `\`${v}\`` : v;
  }).join(' | ')} |`).join('\n');
  return `${head}\n${rows}`;
}

function renderProcedure(key) {
  const p = D.PROCEDURES.find((x) => x.key === key);
  const steps = p.steps.map((s, i) => `${i + 1}. ${s.do}\n`
    + `   ${s.files.map((f) => `\`${f}\``).join(' · ')}`).join('\n');
  return `**Why this contract exists.** ${p.why}\n\n${steps}`;
}

function markdown() {
  const body = SECTIONS.map((s) => {
    const parts = [`## ${s.heading}`];
    if (s.body) parts.push(s.body);
    if (s.table && s.table.startsWith('PROC:')) parts.push(renderProcedure(s.table.slice(5)));
    else if (s.table) parts.push(renderTable(s.table));
    return parts.join('\n\n');
  }).join('\n\n---\n\n');

  const traps = D.TRAPS.map((t) => `| ${cell(t.thing)} | ${cell(t.looks)} | ${cell(t.is)} |`)
    .join('\n');

  return `# DOC 14 — Colaberry Live: Developer & AI Maintenance Runbook

> Generated from \`scripts/artifacts/tickets/l114Data.js\` and \`l114Sections.js\`.
> **Do not hand-edit** — change the data and re-run
> \`node scripts/artifacts/buildL114Artifacts.js\`, which refuses to write if any path this
> runbook names has stopped existing.

| | |
|---|---|
| **Required by** | \`docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md\` §3.1 |
| **Basecamp ticket** | ${D.META.ticket} |
| **Owner** | ${D.META.owner} |
| **Written** | ${D.META.built} |
| **Start here** | [DOC 00](DOC_00_READ_FIRST_AI_OPERATING_BRIEF.md) · the architecture is [DOC 11](DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md) · the contract is [DOC 02](DOC_02_BROADCAST_ARCHITECTURE_AND_SECURITY_CONTRACT.md) · the diagrams are [DOC 12](DOC_12_ARCHITECTURE_DIAGRAMS.md) |

**This document is for a future Claude Code session or engineer with no chat history.** It assumes
you have read DOC 00 and nothing else.

**${D.TOTALS.paths} paths, ${D.TOTALS.flags} flags, ${D.TOTALS.envs} environment variables and
${D.TOTALS.procedureFiles} procedure-step file references are checked to exist on every build.** A
runbook that tells you to open a file that is gone teaches you to stop trusting it, which costs
more than the answer you came for.

## What is dated, and what is not

The paths, flags, variables and procedures above are checked mechanically, so they are true at
build time. **The state claims are not checkable the same way, and an airing is an event git
cannot show.** Checked ${D.META.stateCheckedOn}: nothing had touched
\`backend/src/services/broadcast/\` or \`backend/src/services/classKit/\` since 2026-11-03, and no
Colaberry Live airing is recorded in the repository. Absence of a commit is not proof an airing did
not happen — so treat state claims here as *what was checked on that date*, and re-derive from
[DOC 11](DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md)'s proof register if it matters.

## False leads

**Read this before you start.** Each row is an hour a session with no chat history would otherwise
lose, and none of them is discoverable from the code alone.

| It looks like | You might assume | It actually is |
|---|---|---|
${traps}

---

${body}
`;
}

function build() {
  const sections = SECTIONS.map((s) => {
    let extra = '';
    if (s.table && s.table.startsWith('PROC:')) {
      const p = D.PROCEDURES.find((x) => x.key === s.table.slice(5));
      extra = `<p class="why"><strong>Why this contract exists.</strong> ${esc(p.why)}</p><ol>`
        + p.steps.map((st) => `<li>${esc(st.do)}<br><code>${st.files.map(esc).join('</code> · <code>')}</code></li>`).join('')
        + '</ol>';
    } else if (s.table) {
      const t = TABLES[s.table];
      extra = `<table><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`
        + `<tbody>${t.rows.map((r) => `<tr>${t.cols.map((c, i) => (i === t.code
          ? `<td class="p"><code>${esc(r[c])}</code></td>` : `<td class="n">${esc(r[c])}</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
    }
    const prose = s.body ? `<p class="b">${esc(s.body).replace(/\n\n/g, '</p><p class="b">')}</p>` : '';
    return `<section><h2>${esc(s.heading)}</h2>${prose}${extra}</section>`;
  }).join('\n');

  const traps = D.TRAPS.map((t) => `<tr><td class="p"><code>${esc(t.thing)}</code></td>`
    + `<td class="n">${esc(t.looks)}</td><td class="n">${esc(t.is)}</td></tr>`).join('');

  const body = `
<h1>DOC 14 — developer &amp; AI maintenance runbook</h1>
<p class="sub">${esc(D.META.ticket)} · ${esc(D.META.built)} · ${D.TOTALS.paths} paths,
${D.TOTALS.envs} env vars and ${D.TOTALS.procedureFiles} procedure file references checked to
exist on every build · generated from <code>l114Data.js</code></p>
<h2>False leads — read first</h2>
<table><thead><tr><th>It looks like</th><th>You might assume</th><th>It actually is</th></tr></thead>
<tbody>${traps}</tbody></table>
${sections}
`;

  return htmlDoc({
    title: 'DOC 14 — maintenance runbook',
    css: `${baseCss()}
      .sub { color: ${TOKENS.MUTED}; font-size: 10px; line-height: 1.4; }
      section { page-break-inside: avoid; margin: 0 0 16px; }
      section h2 { font-size: 12.5px; margin: 12px 0 5px; }
      p.b { font-size: 10px; line-height: 1.5; margin: 4px 0; }
      p.why { font-size: 10px; line-height: 1.5; border-left: 3px solid ${TOKENS.CHERRY};
        padding-left: 9px; margin: 4px 0 8px; }
      ol { font-size: 10px; line-height: 1.55; padding-left: 18px; }
      ol code { font-size: 8.5px; }
      td.p code { font-size: 8.5px; }
      td.n { font-size: 9.5px; line-height: 1.35; }`,
    body,
  });
}

module.exports = { selfCheck, markdown, build };
