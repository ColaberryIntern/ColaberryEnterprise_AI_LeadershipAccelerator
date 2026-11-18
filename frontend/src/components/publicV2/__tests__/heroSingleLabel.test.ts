import fs from 'fs';
import path from 'path';

/**
 * W19 (Ali, 2026-11-17): "All of the small titles on each page have duplicate titles."
 *
 * The pages printed "HOME / SERVICES" and then "SERVICES" again as a small label above the
 * title. A page with a breadcrumb now shows ONE small line above its title: the breadcrumb.
 * Read from the source, between the breadcrumb and the first <h1>, so a label added back
 * anywhere in that stretch fails here.
 */
const SRC = path.join(__dirname, '..', '..', '..');
const PAGES = [
  'pages/publicV2/ServicesV2.tsx',
  'pages/publicV2/HowItWorksV2.tsx',
  'pages/publicV2/platformV2Bands.tsx',
  'components/publicV2/HeroPricingV8.tsx',
  'pages/publicV2/DemoPilotV2.tsx',
  'pages/publicV2/BookV2.tsx',
];

describe('W19: one small line above each page title', () => {
  for (const file of PAGES) {
    it(`${file}: the breadcrumb is the only label before the title`, () => {
      const s = fs.readFileSync(path.join(SRC, file), 'utf8');
      const crumb = s.indexOf('cbv2-crumb5');
      expect(crumb).toBeGreaterThan(-1);
      const h1 = s.indexOf('<h1', crumb);
      expect(h1).toBeGreaterThan(crumb);
      const between = s.slice(s.indexOf('</p>', crumb) + 4, h1);
      expect(between).not.toMatch(/cbv2-k5|cbv2-eyebrow/);
    });
  }
});
