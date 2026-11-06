/**
 * Build the artifacts for L10.2 (agent teams) and L10.3 (the one console).
 *
 * THE SELF-CHECK RUNS FIRST AND NOTHING RENDERS IF IT FAILS. Both tickets are claims about the
 * same stored decomposition, so both artifacts read one data module and that module derives its
 * consistency rather than asserting it: the team task counts must sum to the AI allocation count,
 * the console must hold the human allocation count, the blocking count must be zero, and the gap
 * between tasks and allocation rows must be fully accounted for. A PDF that renders beautifully
 * over figures that disagree with each other satisfies nobody.
 *
 * Four PDFs, one page each for the visuals, enforced by the renderer rather than by intention:
 * `maxPages: 1` reads the page count back out of the PDF bytes and throws rather than writing a
 * two-page "one-pager".
 *
 *   node scripts/artifacts/buildL10Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'artifacts', 'L10');

async function main() {
  const D = require('./tickets/l10Data');

  D.selfCheck();
  console.log(`self-check passed: ${D.COUNTS.ai} AI tasks across ${D.TOTALS.teams} teams with `
    + `${D.TOTALS.subjects} distinct subjects, ${D.TOTALS.consoles} console holding `
    + `${D.TOTALS.humanTasksOnSurfaces} of ${D.COUNTS.human} human tasks, `
    + `${D.ORPHAN_HUMAN_TASKS} orphans, ${D.TOTALS.blocking} blocking findings, `
    + `${D.TOTALS.warnings} warnings named, ${D.UNALLOCATED.taskId} accounted for as `
    + `kind=${D.UNALLOCATED.kind}`);

  const jobs = [
    {
      name: 'L102_AGENT_TEAMS_1PAGE.pdf',
      html: require('./tickets/l102Visual').build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'the two teams, the approver evidence, and the two warnings',
    },
    {
      name: 'L102_AGENT_TEAMS_SPEC.pdf',
      html: require('./tickets/l102Document').build(),
      landscape: false,
      maxPages: 0,
      margin: '14mm',
      what: 'all four done-when conditions with evidence, and the rule that had to be split',
    },
    {
      name: 'L103_ONE_CONSOLE_1PAGE.pdf',
      html: require('./tickets/l103Visual').build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'eleven of eleven on one console, zero orphans, and the START node explained',
    },
    {
      name: 'L103_ONE_CONSOLE_SPEC.pdf',
      html: require('./tickets/l103Document').build(),
      landscape: false,
      maxPages: 0,
      margin: '14mm',
      what: 'the three conditions, including the one production cannot evidence',
    },
  ];

  fs.mkdirSync(OUT, { recursive: true });
  for (const j of jobs) {
    const res = await renderPdf({
      html: j.html,
      outPath: path.join(OUT, j.name),
      landscape: j.landscape,
      maxPages: j.maxPages,
      margin: j.margin,
    });
    console.log(`${j.name}: ${res.pages} page(s), ${(res.bytes / 1024).toFixed(0)} KB — ${j.what}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
