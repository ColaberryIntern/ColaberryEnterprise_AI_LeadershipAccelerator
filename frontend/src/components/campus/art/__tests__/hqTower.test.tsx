import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BuildingArt from '../BuildingArt';
import { HqTowerArt } from '../hqTower';

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

test('the tower uses the HQ palette, and day/night follows the tower scene rule', () => {
  const fills = (hour: number) => Array.from(svg(<HqTowerArt w={100} h={126} hour={hour} />).querySelectorAll('rect')).map((r) => r.getAttribute('fill'));
  const day = fills(12);
  expect(day).toContain('var(--cm-art-hq-band)');
  expect(day).toContain('var(--cm-art-hq-win)');
  expect(day).toContain('var(--cm-art-hq-navy)');
  expect(fills(21)).toContain('var(--cm-art-hq-band-night)');
  expect(fills(21)).not.toContain('var(--cm-art-hq-band)');
});

test('the footprint stays inside the old sprite, so labels and badges do not move', () => {
  const rects = Array.from(svg(<HqTowerArt w={100} h={126} hour={12} />).querySelectorAll('rect'));
  for (const r of rects) {
    const x = Number(r.getAttribute('x')); const y = Number(r.getAttribute('y'));
    expect(x).toBeGreaterThanOrEqual(-54);
    expect(x + Number(r.getAttribute('width'))).toBeLessThanOrEqual(54);
    expect(y).toBeGreaterThanOrEqual(-126);
    expect(y + Number(r.getAttribute('height'))).toBeLessThanOrEqual(0.01);
  }
});
