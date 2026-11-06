/**
 * Preview the two L10 one-pagers at their REAL page box, and audit containment, before trusting
 * them. Scratch tooling for this build: the page-count gate says only THAT a page overflowed, and
 * nothing automated says a page looks wrong.
 *
 *   node scripts/artifacts/previewL10.js
 */
const path = require('path');
const { previewPage } = require('./previewArtifactPage');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'L10', 'previews');

// Same margin the builder uses for the one-pagers, or the preview is not the real surface.
const MARGIN_MM = 10;

async function main() {
  const jobs = [
    ['L102_AGENT_TEAMS_1PAGE.png', require('./tickets/l102Visual').build()],
    ['L103_ONE_CONSOLE_1PAGE.png', require('./tickets/l103Visual').build()],
  ];

  for (const [name, html] of jobs) {
    const r = await previewPage({
      html,
      outPath: path.join(OUT, name),
      landscape: true,
      marginMm: MARGIN_MM,
    });
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(r, null, 2).slice(0, 2000));
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
