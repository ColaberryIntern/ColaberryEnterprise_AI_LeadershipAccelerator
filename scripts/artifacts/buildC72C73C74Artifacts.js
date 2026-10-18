/**
 * Build the three pilot tickets due 14 October, one PDF pair each.
 *
 *   node scripts/artifacts/buildC72C73C74Artifacts.js
 *
 * Two of the assertions here run against the RENDERED text rather than the data, because
 * that is where they actually bite: a registry-prohibited word matters when it reaches the
 * page, and a disclaimer is prominent or not depending on where it lands in the output.
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const C72 = require('./tickets/c72Data');
const C73 = require('./tickets/c73Data');
const C74 = require('./tickets/c74Data');
const R72 = require('./tickets/c72Render');
const R73 = require('./tickets/c73Render');
const R74 = require('./tickets/c74Render');

/** Strip markup so an assertion reads what a human reads, not the HTML around it. */
const textOf = (html) => String(html)
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const TICKETS = [
  {
    code: 'C7.2',
    out: 'C7.2',
    render: R72,
    files: ['C72_1_ONE_PAGE.pdf', 'C72_2_PILOT_PROPOSAL_TEMPLATE.pdf'],
    check() {
      const x = C72.assertExclusionsExplicit();
      const o = C72.assertObligationsExplicit();
      const m = C72.assertMetricsMeasurable();
      const v = C72.assertVariablesMarked();
      const r = C72.assertRegistryClean(
        textOf(R72.buildVisual()) + ' ' + textOf(R72.buildDocument()),
      );
      return `${x.total} exclusions (${x.fromAudit} from the capability audit), `
        + `${o} obligations, ${m} metrics, ${v} marked fields, ${r} registry words checked`;
    },
  },
  {
    code: 'C7.3',
    out: 'C7.3',
    render: R73,
    files: ['C73_1_ONE_PAGE.pdf', 'C73_2_PILOT_SOW_STRUCTURE.pdf'],
    check() {
      const c = C73.assertEveryClauseFlagged();
      C73.assertIpAndDataPresent();
      const reserved = C73.assertReservedClausesStayEmpty();
      C73.assertTexasExposureStated();
      const at = C73.assertDisclaimerProminent(textOf(R73.buildDocument()));
      return `${c.total} clauses, ${c.unreviewed} needing counsel or a decision, `
        + `${reserved} reserved and left blank, disclaimer at character ${at}`;
    },
  },
  {
    code: 'C7.4',
    out: 'C7.4',
    render: R74,
    files: ['C74_1_ONE_PAGE.pdf', 'C74_2_DISCOVERY_QUESTIONNAIRE.pdf'],
    check() {
      const d = C74.assertDeadlinesMarked();
      const b = C74.assertBaselineExplicit();
      const s = C74.assertSecurityBeforeAccess();
      C74.assertFillsTheBlueprintGap();
      C74.assertHeadlineMatchesData();
      return `${d.total} items, ${d.day0} required before day one, ${b} baseline items at `
        + `day one, last constraint at ${s.lastConstraint} before first access at ${s.firstAccess}`;
    },
  },
];

async function main() {
  for (const t of TICKETS) {
    const summary = t.check();
    console.log('\n' + t.code + '   ' + summary);
    const dir = path.join(__dirname, '..', '..', 'docs', 'artifacts', t.out);
    const jobs = [
      { file: t.files[0], html: t.render.buildVisual(), landscape: true, maxPages: 1, margin: '10mm' },
      { file: t.files[1], html: t.render.buildDocument(), landscape: false, maxPages: 0, margin: '15mm' },
    ];
    for (const j of jobs) {
      const r = await renderPdf({ html: j.html, outPath: path.join(dir, j.file),
        landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
      console.log('   ' + j.file.padEnd(36) + r.pages + ' page(s)'
        + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
        + (r.bytes / 1024).toFixed(0) + ' KB');
    }
  }
  console.log('\nall three built');
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
