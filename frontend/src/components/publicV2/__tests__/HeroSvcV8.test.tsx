/**
 * HeroSvcV8.test.tsx -- the /platform and /pricing heroes.
 *
 * On 2026-11-16 the home-hero rebuild deleted the stylesheet rules these two
 * heroes still used. Every band-count and heading check stayed green while
 * production drew their diagram as solid black boxes over unstyled text. So
 * the first guard here is the one that would have caught it: every hero class
 * a page renders must be styled by heroV8.css. The others pin what the hero is
 * made of, and that the diagram (in neither design file) stays gone.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import HeroPlatformV8 from '../HeroPlatformV8';
import HeroPricingV8 from '../HeroPricingV8';

const CSS = fs.readFileSync(path.join(__dirname, '..', 'heroV8.css'), 'utf8');

const render = (Hero: React.ComponentType): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <Hero />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Every distinct class token in the markup that belongs to the hero shell. */
const heroClasses = (h: string): string[] => {
  const out = new Set<string>();
  for (const m of h.matchAll(/class="([^"]*)"/g)) {
    m[1].split(/\s+/).filter((c) => c.startsWith('cbv2-h8')).forEach((c) => out.add(c));
  }
  return [...out];
};

/** A class is styled if the stylesheet names it, or names its BEM base. */
const styled = (cls: string): boolean => {
  const named = (c: string): boolean => new RegExp(`\\.${c.replace(/-/g, '\\-')}(?![\\w-])`).test(CSS);
  if (named(cls)) return true;
  const base = cls.split('--')[0];
  return base !== cls && named(base);
};

const count = (h: string, cls: string): number =>
  (h.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'g')) || []).length;

describe.each([
  ['/platform', HeroPlatformV8],
])('the %s hero', (_route, Hero) => {
  const h = render(Hero);

  it('renders no hero class the stylesheet does not style', () => {
    const unstyled = heroClasses(h).filter((c) => !styled(c));
    expect(unstyled).toEqual([]);
  });

  it('ships no diagram, which is in neither supplied design file', () => {
    expect(h).not.toContain('<svg');
    expect(h).not.toContain('cbv2-h8__viz');
  });

  it('is built from its parts: eyebrow, one h1, deck, three chips, body, two buttons, proof row', () => {
    expect(count(h, 'cbv2-h8__eyebrow')).toBe(1);
    expect((h.match(/<h1\b/g) || []).length).toBe(1);
    expect(count(h, 'cbv2-h8__deck')).toBe(1);
    expect(count(h, 'cbv2-h8__chip')).toBe(3);
    expect(count(h, 'cbv2-h8__body')).toBe(1);
    expect(count(h, 'cbv2-h8__btn')).toBe(2);
    expect(count(h, 'cbv2-h8__proof')).toBe(1);
    expect(textOf(h)).toMatch(/book a demo pilot/i);
  });
});

/*
 * /pricing moved to the model's light page hero on 2026-11-16 (page group 3), styled
 * by `.cbv2-prhero5` / `.cbv2-prc5` in fidelityV5.css. Ali's pricing decision (W4) is
 * open, so the hero keeps every part and every word it had; these pin that.
 */
describe('the /pricing hero', () => {
  const h = render(HeroPricingV8);
  const FIDELITY = fs.readFileSync(path.join(__dirname, '..', 'fidelityV5.css'), 'utf8');

  it('is the model page hero, with no v8 hero class left', () => {
    expect(count(h, 'cbv2-prhero5')).toBe(1);
    expect(heroClasses(h)).toEqual([]);
  });

  it('keeps its parts: one h1, deck, three chips, body, two buttons, proof row', () => {
    expect((h.match(/<h1\b/g) || []).length).toBe(1);
    expect(count(h, 'cbv2-prc5__deck')).toBe(1);
    expect(count(h, 'cbv2-prc5__chip')).toBe(3);
    expect(count(h, 'cbv2-prc5__body')).toBe(1);
    expect((h.match(/class="cbv2-btn /g) || []).length).toBe(2);
    expect(count(h, 'cbv2-prc5__proof')).toBe(1);
    expect(textOf(h)).toMatch(/book a demo pilot/i);
    expect(textOf(h)).toContain('Three services. Simple terms for each.');
    expect(textOf(h)).toContain('Agreed in writing before work starts.');
  });

  it('ships no diagram, which is in neither supplied design file', () => {
    /* The only svg is the button's arrow icon. */
    expect(h).not.toContain('cbv2-h8__viz');
    expect((h.match(/<svg\b/g) || []).length).toBe((h.match(/<svg class="cbv2-ic"/g) || []).length);
  });

  it('renders no cbv2-prc5 class the shared layer does not style', () => {
    const used = new Set<string>();
    for (const m of h.matchAll(/class="([^"]*)"/g)) {
      m[1].split(/\s+/).filter((c) => c.startsWith('cbv2-prc5')).forEach((c) => used.add(c));
    }
    expect(used.size).toBeGreaterThan(0);
    const unstyled = [...used].filter(
      (c) => !new RegExp(`\\.${c.replace(/-/g, '\\-')}(?![\\w-])`).test(FIDELITY),
    );
    expect(unstyled).toEqual([]);
  });
});

describe('the --svc rules cannot reach the home hero', () => {
  it('scopes every rule it adds under .cbv2-h8--svc', () => {
    const marker = CSS.indexOf('the --svc heroes (platform, pricing)');
    expect(marker).toBeGreaterThan(-1);
    const start = CSS.lastIndexOf('/*', marker);
    const block = CSS.slice(start).replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...block.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    expect(selectors.length).toBeGreaterThan(0);
    selectors.forEach((sel) =>
      sel.split(',').forEach((one) => expect(one.trim()).toMatch(/^\.cbv2-h8--svc\b/)),
    );
  });
});
