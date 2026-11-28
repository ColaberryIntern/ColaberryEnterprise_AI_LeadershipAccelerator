/**
 * Preview each of the eight ungrouped-closeout one-pagers at its REAL page box and audit
 * containment, before anything is attached to a ticket.
 *
 * A page-count gate says a page fit. It does not say a pill overflowed its own box, and in this
 * repo that exact failure has passed a page-width check three times. This runs first, and the
 * PNGs are then looked at rather than only measured.
 *
 *   node scripts/artifacts/previewAf14Closeout.js
 */
const path = require('path');
const { previewPage } = require('./previewArtifactPage');
const R = require('./tickets/af14CloseoutRender');
const { TICKETS } = require('./tickets/af14CloseoutData');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF14-CLOSEOUT-2026-11-28', 'previews');

async function main() {
  let bad = 0;
  for (const key of Object.keys(TICKETS)) {
    const t = TICKETS[key];
    const r = await previewPage({
      html: R.buildVisual(key),
      outPath: path.join(OUT, `${t.slug}_1PAGE.png`),
      landscape: true,
      marginMm: 9,
    });
    const fill = r.fillPct !== undefined ? `${r.fillPct}% full` : '';
    console.log(`${t.code.padEnd(10)} fits=${r.fits}  ${fill}  overflow=${(r.overflows || []).length}`);
    for (const o of r.overflows || []) console.log(`   OVERFLOW ${JSON.stringify(o)}`);
    if (!r.fits || (r.overflows || []).length) bad += 1;
  }
  console.log(bad === 0 ? `\nOK - all pages fit and nothing overflows\n${OUT}` : `\n${bad} page(s) need work`);
  if (bad) process.exitCode = 1;
}

main().catch((e) => { console.error('PREVIEW FAILED: ' + e.message); process.exit(1); });
