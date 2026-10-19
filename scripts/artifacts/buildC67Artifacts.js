/**
 * Build C6.7's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC67Artifacts.js
 *
 * REQUIRES tmp/c67_messages.json, which names real people and carries their email
 * addresses. This repository is public, .gitignore covers that file by pattern, and the
 * data module refuses to load it if it ever becomes tracked.
 *
 * The assertion that matters is assertNoneInterchangeable. The ticket's named failure mode
 * is "templated personalisation: if the opening could be sent to anyone, it is not tier 1",
 * and that is a judgement a writer makes badly at draft nineteen.
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c67Data');
const R = require('./tickets/c67Render');
const G = require('./tickets/c67Guards');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C6.7');

async function main() {
  const guarded = D.assertSourceNotCommitted();
  const worst = G.assertNoneInterchangeable(D.SENDABLE);
  const sourced = G.assertEveryOpeningIsSourced(D.MESSAGES);
  const claims = G.assertClaimsMatchRegistry(D.MESSAGES, D.PUBLISHABLE);
  const wording = G.assertNoProhibitedWording(D.MESSAGES);
  const held = G.assertUnsourcedAreFlaggedNotFilled(D.MESSAGES);
  G.assertNothingConfiguredToSend(
    fs.readFileSync(path.join(__dirname, 'tickets', 'c67Data.js'), 'utf8'),
  );

  const jobs = [
    { file: 'C67_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C67_2_OUTREACH_DRAFTS.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '14mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('\n  drafts source, not tracked : ' + guarded);
  console.log('  openings, none interchangeable: closest pair shares '
    + Math.round(worst.v * 100) + '% of vocabulary (' + worst.a + ' / ' + worst.b + ')');
  console.log('  openings resting on a sourced, dated fact : ' + sourced);
  console.log('  drafts checked against the registry      : ' + claims);
  console.log('  drafts checked for prohibited wording    : ' + wording);
  console.log('  targets held with a reason, no opening   : ' + held);
  console.log('  sending configuration                    : none, asserted');
  console.log('\n  REVIEW STATE: ' + D.REVIEW_STATE);
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
