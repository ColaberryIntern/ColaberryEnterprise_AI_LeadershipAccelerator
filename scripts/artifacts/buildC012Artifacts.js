/**
 * Build C0.12's two deliverables: the one-page decision sheet and the governance document.
 *
 *   node scripts/artifacts/buildC012Artifacts.js
 *
 * THE GUARDS ARE THE POINT, and two of them do real work.
 *
 * `assertDeclaredValuesMatchSource` reads the TypeScript the seed writes from and demands
 * every number in the document appear in it. A document that confidently describes a
 * threshold nobody applied is the ordinary way this kind of artifact goes wrong.
 *
 * `assertNoCriterionIsMetWithoutMeasurement` refuses to mark criteria 1 and 3 as MET until
 * the post-seed gate reading is recorded. Those are claims about production, and asserting
 * them from intent is the failure this whole ticket is about.
 */
const path = require('path');
const D = require('./tickets/c012Data');
const G = require('./tickets/c012Guards');
const R = require('./tickets/c012Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C0.12');

async function main() {
  const configs = G.assertAllGuards();

  const jobs = [
    { file: 'C012_1_GOVERNANCE_DECISION.pdf', html: R.buildVisual(), landscape: true,
      maxPages: 1, margin: '10mm' },
    { file: 'C012_2_CONFIG_AND_CODE_REACH.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(36) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const ceo = D.CONFIGS.find((c) => c.key === 'ceo_direct');
  const moved = ceo.fields.filter((f) => String(f.value) !== String(f.platformDefault)).length;
  const met = D.CRITERIA.filter((c) => c.verdict === 'MET').length;
  const governs = D.COLUMN_REACH.filter((r) => !/STILL NOTHING/.test(r.after)).length;

  console.log('');
  console.log('  configs declared : ' + configs + '  -> ' + D.CONFIGS.map((c) => c.key).join(', '));
  console.log('  applied to prod  : ' + D.CONFIGS.filter((c) => c.applied).length
    + '  held back ' + D.CONFIGS.filter((c) => !c.applied).length
    + '  (active campaign, Ali\'s call)');
  console.log('  CEO fields moved : ' + moved + ' of ' + ceo.fields.length
    + ' off the platform default');
  console.log('  columns governing: ' + governs + ' of ' + D.COLUMN_REACH.length
    + '  -> ' + D.COLUMN_REACH.filter((r) => /STILL NOTHING/.test(r.after))
      .map((r) => r.column).join(', ') + ' still govern nothing');
  console.log('  configs before   : ' + D.TABLE.configs.value + ' rows against '
    + D.TABLE.campaigns.value + ' campaigns');
  console.log('  gate blockers    : ' + D.GATE_BEFORE.filter((g) => !g.passed).length
    + ' before -> ' + (D.VERIFIED
      ? D.VERIFIED.gateAfter.filter((g) => !g.passed).length + ' after (measured)'
      : 'after NOT YET MEASURED'));
  console.log('  criteria met     : ' + met + ' of ' + D.CRITERIA.length);
  console.log('  open flags       : ' + D.FLAGS.filter((f) => f.severity !== 'closed-here').length
    + '  closed here ' + D.FLAGS.filter((f) => f.severity === 'closed-here').length);
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
