import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BuildingArt from '../BuildingArt';
import { HqTowerArt } from '../hqTower';
import fs from 'fs';
import path from 'path';
import { TOWER_BAND } from '../../hq/HqOutside';

// C83: the map's career building is the Colaberry Tower the HQ scene draws, not the glass office Project Studio keeps.
const svg = (el: React.ReactElement): HTMLElement => {
  const div = document.createElement('div');
  div.innerHTML = renderToStaticMarkup(<svg>{el}</svg>);
  return div;
};

test('the career building draws the Colaberry Tower; Project Studio keeps the glass office', () => {
  const career = svg(<BuildingArt id="career" kind="office" w={100} h={126} label="Staff Office" />);
  expect(career.querySelector('[data-testid="cm-hq-map-tower"]')).not.toBeNull();
  expect(career.textContent).toContain('COLABERRY');
  expect(career.querySelector('[data-testid="cm-label-career"]')?.textContent).toBe('Staff Office');
  const studio = svg(<BuildingArt id="studio" kind="office" w={100} h={126} />);
  expect(studio.querySelector('[data-testid="cm-hq-map-tower"]')).toBeNull();
});

test('C89: the tower is navy blue at every hour, with gold windows and the navy base (never the cream day band)', () => {
  const fills = Array.from(svg(<HqTowerArt w={100} h={126} />).querySelectorAll('rect')).map((r) => r.getAttribute('fill'));
  expect(fills).toContain('var(--cm-art-hq-band-night)');
  expect(fills).toContain('var(--cm-art-hq-win)');
  expect(fills).toContain('var(--cm-art-hq-navy)');
  expect(fills).not.toContain('var(--cm-art-hq-band)');
});

test('the footprint stays inside the old sprite, so labels and badges do not move', () => {
  const rects = Array.from(svg(<HqTowerArt w={100} h={126} />).querySelectorAll('rect'));
  for (const r of rects) {
    const x = Number(r.getAttribute('x')); const y = Number(r.getAttribute('y'));
    expect(x).toBeGreaterThanOrEqual(-54);
    expect(x + Number(r.getAttribute('width'))).toBeLessThanOrEqual(54);
    expect(y).toBeGreaterThanOrEqual(-126);
    expect(y + Number(r.getAttribute('height'))).toBeLessThanOrEqual(0.01);
  }
});

test('C89: the tower scene uses the same navy band at every hour (no day/night choice of band left in HqOutside)', () => {
  expect(TOWER_BAND).toBe('hq-band-night');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'hq', 'HqOutside.tsx'), 'utf8');
  expect(src).not.toContain("night ? 'hq-band-night' : 'hq-band'");
  expect(src.split('art(TOWER_BAND)').length - 1).toBeGreaterThanOrEqual(2);
});
