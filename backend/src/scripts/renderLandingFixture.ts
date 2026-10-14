/**
 * Render the target landing page fixture to HTML, and report which components it drew.
 *
 * WHY A SCRIPT. The renderer v2 work adds eight components whose whole purpose is visual. A unit
 * test can assert a class name is present; it cannot tell anyone whether the page looks like the
 * reference. This renders the fixture with the real renderer so the output can be opened, looked
 * at and screenshotted beside the reference - which is the only check that answers the actual
 * question.
 *
 * It also prints a component inventory, so a missing block is named rather than being something
 * you have to spot by eye in a screenshot.
 *
 *   npx ts-node src/scripts/renderLandingFixture.ts [outfile]
 *
 * Writes tmp/lp-target.html by default. Reads nothing but the fixture; touches no database.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { parseLandingPageContent } from '../schemas/landingPageContentSchema';
import { renderLandingPage } from '../services/marketing/landingPageRenderer';

const FIXTURE = join(__dirname, '..', 'services', 'marketing', '__tests__', 'fixtures', 'aiLearningPlatform.target.json');

function main(): void {
  const out = process.argv[2] ?? join(process.cwd(), 'tmp', 'lp-target.html');

  const parsed = parseLandingPageContent(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  if (!parsed.ok) {
    // A fixture that does not parse is the most useful failure here: it means the schema and the
    // target design have diverged, which is exactly what this file exists to keep in step.
    console.error('FIXTURE INVALID:');
    parsed.problems.forEach((p) => console.error(`  ${p}`));
    process.exit(1);
  }

  const { html } = renderLandingPage({
    content: parsed.content,
    brand: { name: process.env.LP_BRAND_NAME || 'Colaberry Training', default_theme_key: process.env.LP_THEME_KEY || 'training' },
    siteSlug: 'colaberry-training',
    pageUrl: 'https://enterprise.colaberry.ai/lp/colaberry-training/ai-learning-platform',
  });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);

  const count = (re: RegExp) => (html.match(re) ?? []).length;
  const drew = (needle: string) => (html.includes(needle) ? 'yes' : 'MISSING');

  console.log(`wrote ${out} (${html.length} bytes)`);
  console.table({
    'hero two-column': drew('class="hero-grid hero-split"'),
    'panel badge': drew('panel-badge'),
    'panel start marker': drew('pmark--start'),
    'panel count': (html.match(/panel-count">([^<]*)/) ?? [])[1] ?? 'MISSING',
    'icon tiles': count(/class="tile tile--/g),
    'contrast card': drew('class="contrast"'),
    'contrast chips': count(/class="chips"/g),
    'callout (plain)': drew('class="callout"'),
    'callout (success)': drew('callout--success'),
    'callout highlights': count(/class="c-accent/g),
    'grid variant': drew('class="gridlist"'),
    'items label': count(/class="items-label"/g),
    'dark band': drew('band--inverse'),
    'accent on dark': drew('band--inverse h1 .hl,.band--inverse h2 .hl'),
    'cool band': drew('band--cool'),
    'side card': drew('class="sidecard"'),
    'emphasis': drew('class="em"'),
    'cta notes': count(/class="cta-note"/g),
    'buttons': count(/data-track-cta/g),
    'the word "free"': /\bfree\b/i.test(html) ? 'PRESENT - should be none' : 'none',
  });
}

main();
