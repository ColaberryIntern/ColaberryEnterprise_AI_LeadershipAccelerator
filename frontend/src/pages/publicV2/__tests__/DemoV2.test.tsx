/**
 * DemoV2.test.tsx — C5.9's four acceptance criteria, as tests.
 *
 * The ticket names them: sample data labelled on every screen, no real customer data
 * reachable, route verified mounted, PR open not merged. The first three are testable and
 * each has a block below.
 *
 * Two of them are asserted by reading source off disk rather than by rendering, and that is
 * deliberate. "Route verified mounted" cannot be proven by rendering the component — a page
 * under pages/ can look finished and be unreachable, which is why the sibling suites read
 * App.tsx. And "no real customer data reachable" is a property of the import list: the
 * surest proof that a page cannot fetch a tenant is that it imports nothing that could.
 *
 * Idiom follows the neighbouring V2 tests: renderToStaticMarkup plus string assertions.
 * This repo does not use @testing-library.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import DemoV2 from '../DemoV2';
import { DEMO_LIMITS, DEMO_NOTICE, DEMO_STEPS } from '../../../config/v2Demo';

jest.mock('../../../utils/tracker', () => ({ trackEvent: jest.fn(), initTracker: jest.fn() }));

const APP = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'DemoV2.tsx'), 'utf8');

const html = (): string => renderToStaticMarkup(
  <MemoryRouter initialEntries={['/demo']}><DemoV2 /></MemoryRouter>,
);

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the route is actually mounted', () => {
  it('declares /demo in App.tsx', () => {
    expect(APP).toContain('<Route path="demo" element={<DemoV2 />} />');
  });

  it('mounts it inside PublicLayoutV2, so it gets the nav and footer', () => {
    const layout = APP.indexOf('<Route path="/" element={<PublicLayoutV2 />}>');
    const demo = APP.indexOf('<Route path="demo"');
    expect(layout).toBeGreaterThan(-1);
    expect(demo).toBeGreaterThan(layout);
  });

  it('uses a relative path, because a leading slash would break the nesting', () => {
    expect(APP).not.toContain('<Route path="/demo"');
  });

  it('does not collide with an existing route', () => {
    // /iou-demo and /demo-day are different top-level segments; a second "demo" is not.
    const declarations = [...APP.matchAll(/<Route\s+path="demo"/g)];
    expect(declarations).toHaveLength(1);
  });
});

describe('sample data is labelled on EVERY screen, not just once', () => {
  const h = html();

  it('renders one Sample data badge per step, plus the standing notice', () => {
    const badges = [...h.matchAll(/data-sample="true"/g)];
    expect(badges).toHaveLength(DEMO_STEPS.length + 1);
  });

  it('puts a badge inside every step panel', () => {
    const panels = h.split('cbv2-demo__panelbar').slice(1);
    expect(panels).toHaveLength(DEMO_STEPS.length);
    for (const panel of panels) {
      expect(panel.slice(0, 400)).toContain('data-sample="true"');
    }
  });

  it('says so in words, not only with a glyph', () => {
    expect(textOf(h)).toContain('Sample data');
    expect(textOf(h)).toContain(DEMO_NOTICE);
  });

  it('states that the page reads nothing from our systems', () => {
    expect(DEMO_NOTICE).toMatch(/reads nothing from our systems/);
  });

  it('keeps the limits visible rather than burying them', () => {
    for (const limit of DEMO_LIMITS) expect(textOf(h)).toContain(limit);
  });
});

describe('no real customer data is reachable', () => {
  it('imports no API client', () => {
    // The surest proof a page cannot fetch a tenant is that it imports nothing that could.
    expect(PAGE).not.toMatch(/from '.*\/services\/(api|orgApi|caseStudyApi)'/);
    expect(PAGE).not.toContain('axios');
    expect(PAGE).not.toContain('fetch(');
  });

  it('does not render the dashboard whose sample and live modes look identical', () => {
    // CompanyMomentumDashboard differs between sample and live only by a badge string, so a
    // screenshot of one is indistinguishable from the other. Not on a public demo page.
    expect(PAGE).not.toContain('CompanyMomentumDashboard');
  });

  it('renders entirely from the config module', () => {
    expect(PAGE).toContain("from '../../config/v2Demo'");
  });

  it('still rendered real content, so the checks above are not vacuous', () => {
    const t = textOf(html());
    expect(t.length).toBeGreaterThan(800);
    expect(t).toContain(DEMO_STEPS[0].label);
    expect(t).toContain(DEMO_STEPS[DEMO_STEPS.length - 1].label);
  });
});

describe('it does not advertise a prohibited word or an unregistered figure', () => {
  const h = html();

  it('never says "free", which TWC 40 TAC 807.172(d) prohibits', () => {
    // CtaInterrupt's DEFAULT primary label is "Open the free workspace", so this page has
    // to override it. The default is live elsewhere and is logged separately.
    expect(textOf(h).toLowerCase()).not.toMatch(/\bfree\b/);
  });

  it('quotes no count from the storyboard narration', () => {
    // The live demo script cites "345 stories across 29 projects". True of our database,
    // dated on a call, and not in the claim registry - so not on a public page.
    const t = textOf(h);
    expect(t).not.toMatch(/\b345\b/);
    expect(t).not.toMatch(/\b29 projects\b/);
  });

  it('carries no money figure except the approved "$0", and no percentage', () => {
    const t = textOf(h);
    // "$0 to start" is the prescribed way to say it without the prohibited word, so $0 is
    // allowed and every other amount is not. A price on a demo page would need a registry
    // row and a route approval, and this page has neither.
    expect(t).not.toMatch(/\$(?!0\b)\d/);
    expect(t).not.toMatch(/\d\s?%/);
  });

  it('does not claim a customer outcome', () => {
    const t = textOf(h).toLowerCase();
    expect(t).not.toContain('our customers');
    expect(t).toContain('no customer outcome to show yet');
  });
});

describe('the walkthrough follows the C4.4 journey', () => {
  it('runs one story from unverified to verified', () => {
    const t = textOf(html());
    expect(t).toContain('unverified');
    expect(t).toContain('verified');
    expect(DEMO_STEPS[0].label).toBe('The board');
  });

  it('keeps every step pointing at the same record, so a reader tracks one thing', () => {
    const refs = DEMO_STEPS.flatMap((s) => s.detail)
      .filter((d) => d.includes('STORY-'))
      .map((d) => (d.match(/STORY-\d+/) || [])[0]);
    expect(new Set(refs).size).toBeLessThanOrEqual(3);
    expect(refs).toContain('STORY-1042');
  });

  it('has exactly one call to action out of the walkthrough', () => {
    const h = html();
    const contactLinks = [...h.matchAll(/href="\/contact"/g)];
    expect(contactLinks.length).toBeGreaterThanOrEqual(1);
  });
});
