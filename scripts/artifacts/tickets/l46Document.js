/**
 * l46Document — the self-check, the committed record and the PDF for L4.6 criteria 4 and 5.
 *
 * THE LOAD-BEARING CHECKS, in the order they matter:
 *
 *   1. EVERY TEST NAMED HERE MUST EXIST IN THE TEST SOURCES. A mutation record is a document
 *      whose whole value is that somebody can reproduce it, and the way it rots is a test being
 *      renamed — after which it names evidence that is not there and reads exactly as
 *      convincingly as it did before.
 *   2. BOTH MUTATED REGIONS MUST STILL MATCH THE SHIPPED SOURCE. If the query has changed since
 *      the run, this record describes reversals of code that no longer exists.
 *   3. EVERY PLAN MUST CARRY ITS ROW COUNTS. A query plan without the table statistics beside
 *      it cannot be interpreted — which is the single reason criterion 5 was still open after a
 *      plan had already been captured in October.
 *
 * The rest refuse the ways a mutation record can be vacuous: a claim with no baseline, a
 * "killed" with no named test, a kill count that does not match the names, a finding thinned to
 * a placeholder.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const D = require('./l46Data');
const P = require('./l46PlanData');
const F = require('./l46Findings');
const { TOKENS, esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Searches the test sources for a test name. `-F` so the name is a literal: these names contain
 * parentheses, quotes and hyphens, and treating them as a regex would make a match accidental.
 */
function testExists(name) {
  try {
    const out = execFileSync('git', ['grep', '-lF', '--', name, 'backend/src', 'frontend/src'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim().length > 0;
  } catch (e) {
    if (e.status === 1) return false;
    throw new Error('git grep is unavailable, so the test-name check cannot run and must not '
      + `report success: ${e.message}`);
  }
}

function selfCheck() {
  // 1. A MUTATION RECORD WITHOUT A GREEN BASELINE PROVES NOTHING.
  if (!D.BASELINE.green) throw new Error('the baseline is not recorded green');
  if (!(D.BASELINE.tests > 0) || !(D.BASELINE.suites > 0)) {
    throw new Error('the baseline records no test count; an unmeasured baseline is not a baseline');
  }
  // The whole point of this baseline is that nothing was skipped. A record taken over a scope
  // with a silently skipped suite is the failure this ticket's own findings describe.
  if (D.BASELINE.pending !== 0) {
    throw new Error(`the baseline reports ${D.BASELINE.pending} skipped test(s). The Postgres `
      + 'tier must have run, or the lock has no behavioral evidence behind it.');
  }

  // 2. THE SHIPPED SOURCE MUST STILL BE WHAT WAS MUTATED.
  D.ORIGINALS.forEach((o) => {
    const abs = path.join(ROOT, o.file);
    if (!fs.existsSync(abs)) throw new Error(`the mutated file is gone: ${o.file}`);
    const src = fs.readFileSync(abs, 'utf8').split('\r\n').join('\n');
    if (!src.includes(o.text)) {
      throw new Error(`the "${o.key}" region no longer matches ${o.file}. Re-run the mutations `
        + 'and transcribe the new result; do not edit the numbers.');
    }
  });

  // 3. EVERY MUTATION MUST BE DECIDED, NAME ITS REGION, AND A KILL MUST NAME ITS TESTS.
  const regions = new Set(D.ORIGINALS.map((o) => o.key));
  D.MUTATIONS.forEach((m) => {
    if (!regions.has(m.region)) {
      throw new Error(`mutation "${m.key}" names region "${m.region}", which is not one of the `
        + `regions this record pins: ${[...regions].join(', ')}`);
    }
    if (!m.diff || !m.diff.trim()) throw new Error(`mutation "${m.key}" records no diff`);
    if (!m.means || m.means.trim().length < 30) {
      throw new Error(`mutation "${m.key}" does not say what it would mean in production`);
    }
    if (m.killed) {
      if (!m.names.length) {
        throw new Error(`mutation "${m.key}" is recorded killed but names no failing test`);
      }
      if (m.failed !== m.names.length) {
        throw new Error(`mutation "${m.key}" reports ${m.failed} failures but names `
          + `${m.names.length}; the record must be complete, not a sample`);
      }
    } else if (m.names.length) {
      throw new Error(`mutation "${m.key}" is recorded as surviving but names failing tests`);
    }
  });

  // Both reversals the ticket actually asked for must be present and marked as such, or this
  // record is seven interesting mutations that do not discharge the criterion.
  if (D.TOTALS.required !== 2) {
    throw new Error(`${D.TOTALS.required} mutation(s) are marked as required by the criterion; `
      + 'the ticket names two — the credit anchor and the unavailable-never-zero read');
  }

  // 4. EVERY NAMED TEST MUST EXIST. Includes both controls.
  const named = [...new Set(D.MUTATIONS.flatMap((m) => m.names)
    .concat([D.CONTROL.name, D.CONTROL.second]))];
  const missing = named.filter((n) => !testExists(n));
  if (missing.length) {
    throw new Error(`${missing.length} test(s) named in this record do not exist in the test `
      + `sources:\n  ${missing.join('\n  ')}`);
  }

  // 5. THE CONTROLS AND THE FINDINGS MUST BE REAL. The controls are what make the negatives
  //    mean anything; the findings are the part of this record that is not mechanical.
  if (!D.CONTROL.name || !D.CONTROL.why) throw new Error('no positive control recorded');
  if (!D.CONTROL.second || !D.CONTROL.secondWhy) throw new Error('the second control is incomplete');
  if (F.FINDINGS.length < 3) throw new Error('fewer than three findings; the run measured more');
  F.FINDINGS.forEach((f) => {
    if (!f.heading || !f.body || f.body.length < 200) {
      throw new Error(`finding "${f.key}" is missing or too thin to be useful`);
    }
  });

  // 6. CRITERION 5: EVERY PLAN MUST CARRY ITS ROW COUNTS AND ITS READING, and the sizes must
  //    actually differ — three plans over the same table would not be a measurement.
  if (P.STAGES.length < 3) throw new Error('fewer than three table sizes; the plan is a point');
  P.STAGES.forEach((s) => {
    if (typeof s.sessions !== 'number' || typeof s.people !== 'number') {
      throw new Error(`plan stage "${s.label}" does not record its row counts, so its plan `
        + 'cannot be interpreted — which is exactly why criterion 5 was still open');
    }
    if (!s.reading || s.reading.length < 80) {
      throw new Error(`plan stage "${s.label}" records a plan with no reading of it`);
    }
  });
  if (new Set(P.STAGES.map((s) => s.sessions)).size !== P.STAGES.length) {
    throw new Error('two plan stages report the same table size');
  }
  // The index must be shown being chosen somewhere, and shown NOT being chosen somewhere, or
  // the record cannot tell "the index works" from "the planner had no alternative".
  if (!P.STAGES.some((s) => s.usesIndex)) throw new Error(`${P.META.index} is never chosen`);
  if (!P.STAGES.some((s) => !s.usesIndex)) {
    throw new Error('every stage chooses the index, so the record shows no contrast and cannot '
      + 'establish that the choice depends on the data');
  }
  if (!P.PLAN.includes(P.META.index)) throw new Error('the recorded plan does not name the index');
  if (P.OBSERVATIONS.length < 1) throw new Error('no observations recorded about the plan');
  if (!P.PRODUCTION.notRepeated || !P.PRODUCTION.owed) {
    throw new Error('the production run is cited without saying why it was not repeated, or '
      + 'what is still owed');
  }

  // 7. THE FILE ON DISK MUST BE WHAT THE DATA RENDERS.
  const abs = path.join(ROOT, D.META.file);
  if (!fs.existsSync(abs)) throw new Error(`the record is missing: ${D.META.file}`);
  if (fs.readFileSync(abs, 'utf8') !== markdown()) {
    throw new Error('the committed record differs from what the data modules render. It is '
      + 'generated — re-run the builder, and move any hand-edit into the data module.');
  }

  return true;
}

const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

function markdown() {
  const muts = D.MUTATIONS.map((m) => `### ${m.name}${m.required ? ' *(named by the criterion)*' : ''}

${m.means}

\`\`\`diff
${m.diff}
\`\`\`

**${m.killed ? 'KILLED' : 'SURVIVED'}** — ${m.failed} of ${D.BASELINE.tests} tests failed.

${m.names.map((n) => `- ✕ \`${n}\``).join('\n')}
${m.note ? `\n${m.note}\n` : ''}`).join('\n');

  const findings = F.FINDINGS.map((f) => `### ${f.heading}\n\n${f.body}`).join('\n\n');

  const stages = P.STAGES.map((s) => `| ${cell(s.label)} | ${s.sessions.toLocaleString('en-US')} `
    + `| ${s.people.toLocaleString('en-US')} | ${s.usesIndex ? '**yes**' : 'no'} `
    + `| ${s.seqScan ? 'yes' : 'no'} |`).join('\n');

  const readings = P.STAGES.map((s) => `**${s.label}** — ${s.reading}`).join('\n\n');
  const obs = P.OBSERVATIONS.map((o) => `### ${o.heading}\n\n${o.body}`).join('\n\n');

  return `# L4.6 criteria 4 and 5 — the measurement path, mutated and planned

> Generated from \`scripts/artifacts/tickets/l46Data.js\`, \`l46PlanData.js\` and
> \`l46Findings.js\`. **Do not hand-edit** — re-run
> \`node scripts/artifacts/buildL46Artifacts.js\`, which refuses to write if any test named
> below has stopped existing, if either mutated region has changed since the run, or if a query
> plan is recorded without the row counts that make it readable.

| | |
|---|---|
| **Ticket** | ${D.META.ticket}, criteria 4 and 5 |
| **Criterion 4** | *${D.META.criterionText}* |
| **Criterion 5** | *${P.META.criterionText}* |
| **Under mutation** | \`${D.META.service}\`, \`${D.META.controller}\` |
| **Route** | \`${D.META.route}\` |
| **Run on** | ${D.META.ranOn} |

## The short version

**${D.TOTALS.mutations} reversals, ${D.TOTALS.killed} killed, ${D.TOTALS.survived} survived** —
including both the reversals the ticket names. That is the least interesting true sentence about
this run.

What the run measured is how many tests notice each reversal, and the answer ranges from six
down to **one**. Three of the audience read's rules — count the person not the tab, only count
the fresh, exclude staff — are each protected by a single regex over the SQL text, in a single
file. A fourth, the one that keeps "nobody watched" apart from "we cannot tell", is also
protected by a single test, but that test requires the count field to be **absent**, and so it
kills even a reversal built to look correct. The difference between those two cases is the
useful content of this record.

**Criterion 5's plan is also here**, measured at three table sizes rather than one, because a
plan without the row counts beside it cannot be read — which is why the October production run
left this criterion open.

## Criterion 4 — the mutations

Baseline **green: ${D.BASELINE.suites} suites, ${D.BASELINE.tests} tests,
${D.BASELINE.pending} skipped, ${D.BASELINE.seconds}s.**

${D.BASELINE.dbTier}

Reproduce:

\`\`\`bash
${D.META.reproduce}
\`\`\`

> ${D.META.flagNote}

${muts}
## The controls

\`${D.CONTROL.name}\` — ${D.CONTROL.why}

\`${D.CONTROL.second}\` — ${D.CONTROL.secondWhy}

## What the run established

${findings}

## Criterion 5 — the query plan

The index: \`${P.META.index}\` on \`${P.META.indexDef}\`.

Measured ${P.META.measuredOn} on ${P.META.engine}. The DDL is
\`BROADCAST_TELEMETRY_STATEMENTS\`, imported; the query is extracted from the shipped service at
run time rather than copied, because a hand-copied query is a plan for a statement nobody runs.

| Table size | sessions | people | \`${P.META.index}\` chosen | seq scan |
|---|---|---|---|---|
${stages}

${readings}

The plan at the largest size. Parameter values are shown as \`$1\`-\`$3\`; the run printed them
folded in, because Postgres chose a **custom** plan — which matters for the comparison with
production below, not just for readability.

\`\`\`
${P.PLAN}
\`\`\`

${obs}

### The production run of ${P.PRODUCTION.ranOn}

It reported: ${P.PRODUCTION.reported}.

${P.PRODUCTION.problem}

**Why it was not repeated here.** ${P.PRODUCTION.notRepeated}

**Still owed.** ${P.PRODUCTION.owed}

## What this does not establish

The plans above come from a throwaway Postgres seeded to a realistic shape, not from
production. They establish that the query uses \`${P.META.index}\` once the table is big enough
for an index to be worth using, and that the choice tracks the data rather than being an
artifact of an empty table. They do not establish what production's planner does on
production's statistics — only the run named above can, and it is one command.

Nor is any of this evidence that telemetry is **collecting**. That is L4.9's territory, and the
row counts from the owed production run are what would answer it.
`;
}

function build() {
  const muts = D.MUTATIONS.map((m) => `
<section>
  <h3>${esc(m.name)}${m.required ? ' <span class="req">named by the criterion</span>' : ''}</h3>
  <p class="b">${esc(m.means)}</p>
  <pre>${esc(m.diff)}</pre>
  <p class="v ${m.killed ? 'k' : 's'}">${m.killed ? 'KILLED' : 'SURVIVED'} — ${m.failed} of
  ${D.BASELINE.tests} tests failed</p>
  <ul>${m.names.map((n) => `<li><code>${esc(n)}</code></li>`).join('')}</ul>
  ${m.note ? `<p class="n">${esc(m.note)}</p>` : ''}
</section>`).join('');

  const findings = F.FINDINGS.map((f) => `
<section class="find">
  <h3>${esc(f.heading)}</h3>
  <p class="b">${esc(f.body).replace(/\n\n/g, '</p><p class="b">')}</p>
</section>`).join('');

  const rows = P.STAGES.map((s) => `<tr><td>${esc(s.label)}</td>
    <td class="r">${s.sessions.toLocaleString('en-US')}</td>
    <td class="r">${s.people.toLocaleString('en-US')}</td>
    <td class="${s.usesIndex ? 'ok' : 'no'}">${s.usesIndex ? 'yes' : 'no'}</td>
    <td>${s.seqScan ? 'yes' : 'no'}</td></tr>`).join('');

  const obs = P.OBSERVATIONS.map((o) => `
<section>
  <h3>${esc(o.heading)}</h3>
  <p class="b">${esc(o.body).replace(/\n\n/g, '</p><p class="b">')}</p>
</section>`).join('');

  const body = `
<h1>L4.6 — the measurement path, mutated and planned</h1>
<p class="sub">${esc(D.META.ticket)} criteria 4 and 5 · ${esc(D.META.ranOn)} ·
<code>${esc(D.META.service)}</code> · generated from <code>l46Data.js</code></p>

<p class="b"><strong>Seven reversals, ${D.TOTALS.killed} killed, ${D.TOTALS.survived}
survived</strong> — the least interesting true sentence about this run. What it measured is how
many tests notice each one: from six down to <strong>one</strong>. Baseline green:
${D.BASELINE.suites} suites, ${D.BASELINE.tests} tests, ${D.BASELINE.pending} skipped.</p>

<h2>Criterion 4 — the mutations</h2>
${muts}

<section>
  <h3>The controls</h3>
  <p class="b"><code>${esc(D.CONTROL.name)}</code> — ${esc(D.CONTROL.why)}</p>
  <p class="b"><code>${esc(D.CONTROL.second)}</code> — ${esc(D.CONTROL.secondWhy)}</p>
</section>

<h2>What the run established</h2>
${findings}

<h2>Criterion 5 — the query plan</h2>
<p class="b">The index: <code>${esc(P.META.index)}</code> on
<code>${esc(P.META.indexDef)}</code>. Measured ${esc(P.META.measuredOn)} on
${esc(P.META.engine)}. The query is extracted from the shipped service at run time, not copied.</p>

<table>
  <thead><tr><th>Table size</th><th class="r">sessions</th><th class="r">people</th>
    <th>index chosen</th><th>seq scan</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

<pre>${esc(P.PLAN)}</pre>
${obs}

<section class="find">
  <h3>The production run of ${esc(P.PRODUCTION.ranOn)}</h3>
  <p class="b">It reported: ${esc(P.PRODUCTION.reported)}.</p>
  <p class="b">${esc(P.PRODUCTION.problem)}</p>
  <p class="b"><strong>Not repeated here.</strong> ${esc(P.PRODUCTION.notRepeated)}</p>
  <p class="b"><strong>Still owed.</strong> ${esc(P.PRODUCTION.owed)}</p>
</section>
`;

  return htmlDoc({
    title: 'L4.6 — telemetry mutation and plan record',
    css: `${baseCss()}
      .sub { color: ${TOKENS.MUTED}; font-size: 10px; line-height: 1.4; }
      h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid ${TOKENS.BORDER};
        padding-bottom: 3px; }
      p.b { font-size: 10px; line-height: 1.5; }
      p.n { font-size: 9px; line-height: 1.45; color: ${TOKENS.MUTED}; margin: 3px 0 0; }
      section { page-break-inside: avoid; margin: 0 0 14px; }
      h3 { font-size: 11.5px; margin: 10px 0 4px; }
      span.req { font-size: 8px; font-weight: 600; color: ${TOKENS.CHERRY};
        border: 1px solid ${TOKENS.CHERRY}; border-radius: 3px; padding: 1px 4px;
        vertical-align: middle; }
      pre { font-size: 8.5px; line-height: 1.35; background: ${TOKENS.BG_ALT};
        border: 1px solid ${TOKENS.BORDER}; border-radius: 4px; padding: 7px 9px;
        white-space: pre-wrap; }
      p.v { font-size: 10px; font-weight: 700; margin: 4px 0; }
      p.v.k { color: ${TOKENS.SEV.ok}; }
      p.v.s { color: ${TOKENS.SEV.bad}; }
      ul { font-size: 9px; line-height: 1.45; padding-left: 16px; margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 9px; margin: 6px 0 12px; }
      th, td { border: 1px solid ${TOKENS.BORDER}; padding: 4px 6px; text-align: left; }
      th { background: ${TOKENS.BG_ALT}; font-weight: 600; }
      td.r, th.r { text-align: right; }
      td.ok { color: ${TOKENS.SEV.ok}; font-weight: 700; }
      td.no { color: ${TOKENS.MUTED}; }
      section.find { border-left: 3px solid ${TOKENS.CHERRY}; padding-left: 10px; }`,
    body,
  });
}

module.exports = { selfCheck, markdown, build };
