/**
 * l83Document — the self-check, the committed record and the PDFs for L8.3 criterion 3.
 *
 * THE LOAD-BEARING CHECK: EVERY TEST NAMED IN THIS RECORD MUST EXIST IN THE TEST SOURCES.
 *
 * A mutation record is a document whose entire value is that somebody can reproduce it. The way
 * it rots is a test being renamed — after which the record names evidence that is not there, and
 * reads exactly as convincingly as it did before. So every name is searched for in
 * `backend/src/**\/__tests__`, with `git grep`, and a tool failure is an error rather than a pass.
 *
 * The other checks refuse the two ways a mutation record can be vacuous: a green claim with no
 * baseline, and a "killed" with no named test behind it.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const D = require('./l83Data');
const { TOKENS, esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Searches the test sources for a test name. Uses `-F` so the name is a literal: these names
 * contain em dashes, parentheses and quotes, and treating them as a regex would make a match
 * accidental.
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
  // 1. A MUTATION RECORD WITHOUT A GREEN BASELINE PROVES NOTHING. If the suite was already red,
  //    "a test failed under mutation" is not information.
  if (!D.BASELINE.green) throw new Error('the baseline is not recorded green');
  if (!(D.BASELINE.tests > 0) || !(D.BASELINE.suites > 0)) {
    throw new Error('the baseline records no test count; an unmeasured baseline is not a baseline');
  }

  // 2. THE SHIPPED SOURCE MUST STILL BE WHAT WAS MUTATED. If the function has changed since the
  //    run, this record describes a reversal of code that no longer exists.
  const target = path.join(ROOT, D.META.target);
  if (!fs.existsSync(target)) throw new Error(`the mutated file is gone: ${D.META.target}`);
  const src = fs.readFileSync(target, 'utf8').split('\r\n').join('\n');
  if (!src.includes(D.ORIGINAL)) {
    throw new Error(`${D.META.targetFn} no longer matches the source this record mutated. `
      + 'Re-run the mutation and transcribe the new result; do not edit the numbers.');
  }

  // 3. EVERY MUTATION MUST BE DECIDED, AND A KILL MUST NAME A TEST. "It failed" with no name is
  //    the comment problem this record exists to solve.
  D.MUTATIONS.forEach((m) => {
    if (!m.body || !m.body.includes(D.META.targetFn)) {
      throw new Error(`mutation "${m.key}" does not record the source it applied`);
    }
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

  // 4. THE LOAD-BEARING CHECK: EVERY NAMED TEST MUST EXIST.
  const named = [...new Set(D.MUTATIONS.flatMap((m) => m.names).concat([D.CONTROL.name]))];
  const missing = named.filter((n) => !testExists(n));
  if (missing.length) {
    throw new Error(`${missing.length} test(s) named in this record do not exist in the test `
      + `sources:\n  ${missing.join('\n  ')}`);
  }

  // 5. THE FINDING AND THE CONTROL MUST BOTH BE PRESENT. The finding is the part of this record
  //    that is not mechanical, and the control is what makes the negatives mean anything.
  if (!D.FINDING.headline || !D.FINDING.body || D.FINDING.body.length < 200) {
    throw new Error('the finding is missing or too thin to be useful');
  }
  if (!D.CONTROL.name || !D.CONTROL.why) throw new Error('no positive control recorded');

  // 6. THE FILE ON DISK MUST BE WHAT THE DATA RENDERS.
  const abs = path.join(ROOT, D.META.file);
  if (!fs.existsSync(abs)) throw new Error(`the record is missing: ${D.META.file}`);
  if (fs.readFileSync(abs, 'utf8') !== markdown()) {
    throw new Error('the committed record differs from what the data module renders. It is '
      + 'generated — re-run the builder, and move any hand-edit into l83Data.js.');
  }

  return true;
}

const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

function markdown() {
  const muts = D.MUTATIONS.map((m) => `### ${m.name}

${m.means}

\`\`\`ts
${m.body}
\`\`\`

**${m.killed ? 'KILLED' : 'SURVIVED'}** — ${m.failed} failed, ${m.passed} passed, ${m.failed + m.passed} total.

${m.names.map((n) => `- ✕ \`${n}\``).join('\n')}`).join('\n\n');

  return `# L8.3 criterion 3 — mutation evidence for the replay entitlement filter

> Generated from \`scripts/artifacts/tickets/l83Data.js\`. **Do not hand-edit** — re-run
> \`node scripts/artifacts/buildL83Artifacts.js\`, which refuses to write if any test named below
> has stopped existing, or if the mutated function has changed since the run.

| | |
|---|---|
| **Ticket** | ${D.META.ticket}, criterion ${D.META.criterion} |
| **Criterion** | *${D.META.criterionText}* |
| **Filter** | \`${D.META.targetFn}\` in \`${D.META.target}\` |
| **Applied by** | ${D.META.appliedBy} |
| **Run on** | ${D.META.ranOn} |

## Why this record exists

**An assertion nobody has watched fail is indistinguishable from a comment.** The replay list's
headline requirement is that a private class is **omitted** rather than shown-and-refused —
shown-and-refused leaks its existence — and that requirement is carried by one four-line function.
Until it is reversed and a named test goes red, "it is tested" is a claim about intent.

## The filter, as shipped

\`\`\`ts
${D.ORIGINAL}
\`\`\`

## Baseline

**Green: ${D.BASELINE.suites} suites, ${D.BASELINE.tests} tests, ${D.BASELINE.seconds}s.** A
mutation record against a red or unmeasured baseline proves nothing, so this is checked before
anything else.

Reproduce:

\`\`\`
${D.META.reproduce}
\`\`\`

> **The flag is ${D.META.flagNote}** This matters: the first attempt used the plural form, which
> ran all 2,388 suites for 45 minutes and would have passed as a scoped green run to anyone who
> did not read the totals.

## The reversals

${D.TOTALS.mutations} applied, **${D.TOTALS.killed} killed, ${D.TOTALS.survived} survived**,
across ${D.TOTALS.distinctTests} distinct failing tests.

${muts}

## The positive control

\`${D.CONTROL.name}\`

${D.CONTROL.why}

## Finding — ${D.FINDING.headline}

${D.FINDING.body}

## What this criterion is satisfied by

The named test that fails when the filter is reversed, for the record:

| Reversal | The test that catches it |
|---|---|
${D.MUTATIONS.map((m) => `| ${cell(m.name.split('—')[0].trim())} | \`${cell(m.names[0])}\` |`).join('\n')}

All three reversals are caught. The narrowest is caught by ${D.TOTALS.narrowest} tests, both in
the discovery suite rather than the replay suite — see the finding above.
`;
}

function build() {
  const muts = D.MUTATIONS.map((m) => `
<section>
  <h3>${esc(m.name)}</h3>
  <p class="b">${esc(m.means)}</p>
  <pre>${esc(m.body)}</pre>
  <p class="v ${m.killed ? 'k' : 's'}">${m.killed ? 'KILLED' : 'SURVIVED'} — ${m.failed} failed,
  ${m.passed} passed, ${m.failed + m.passed} total</p>
  <ul>${m.names.map((n) => `<li><code>${esc(n)}</code></li>`).join('')}</ul>
</section>`).join('');

  const body = `
<h1>L8.3 criterion 3 — replay entitlement filter, mutation evidence</h1>
<p class="sub">${esc(D.META.ticket)} · ${esc(D.META.ranOn)} · <code>${esc(D.META.targetFn)}</code>
in <code>${esc(D.META.target)}</code> · generated from <code>l83Data.js</code></p>

<p class="b"><strong>An assertion nobody has watched fail is indistinguishable from a
comment.</strong> Baseline green: ${D.BASELINE.suites} suites, ${D.BASELINE.tests} tests.
${D.TOTALS.mutations} reversals applied, <strong>${D.TOTALS.killed} killed,
${D.TOTALS.survived} survived</strong>.</p>

<pre>${esc(D.ORIGINAL)}</pre>
${muts}

<section>
  <h3>Positive control</h3>
  <p class="b"><code>${esc(D.CONTROL.name)}</code> — ${esc(D.CONTROL.why)}</p>
</section>

<section class="find">
  <h3>Finding — ${esc(D.FINDING.headline)}</h3>
  <p class="b">${esc(D.FINDING.body).replace(/\n\n/g, '</p><p class="b">')}</p>
</section>
`;

  return htmlDoc({
    title: 'L8.3 — replay filter mutation evidence',
    css: `${baseCss()}
      .sub { color: ${TOKENS.MUTED}; font-size: 10px; line-height: 1.4; }
      p.b { font-size: 10px; line-height: 1.5; }
      section { page-break-inside: avoid; margin: 0 0 14px; }
      h3 { font-size: 11.5px; margin: 10px 0 4px; }
      pre { font-size: 8.5px; line-height: 1.35; background: ${TOKENS.BG_ALT};
        border: 1px solid ${TOKENS.BORDER}; border-radius: 4px; padding: 7px 9px; }
      p.v { font-size: 10px; font-weight: 700; margin: 4px 0; }
      p.v.k { color: ${TOKENS.SEV.ok}; }
      p.v.s { color: ${TOKENS.SEV.bad}; }
      ul { font-size: 9px; line-height: 1.45; padding-left: 16px; margin: 2px 0; }
      section.find { border-left: 3px solid ${TOKENS.CHERRY}; padding-left: 10px; }`,
    body,
  });
}

module.exports = { selfCheck, markdown, build };
