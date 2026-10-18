/**
 * HowItWorksV2 and AcceleratorV2 - C5.3 and C5.4.
 *
 * Written against the ways these two pages could mislead a buyer, which is what both
 * tickets name as the risk: "Publishing a claim not in the registry, or describing roadmap
 * as live."
 *
 * Two of these guards exist because of specific findings rather than general caution:
 *
 *   - The ONLY verified duration in the C0.6 registry is `program.duration`, "12 weeks".
 *     C5.4 is titled "90-Day Accelerator" and the C2.2 blueprint is a ninety-day one, but
 *     ninety has no registry row and CLM-029 says a figure without one does not go out.
 *   - The C2.2 audit says Demo Day "has schema but has never been run end to end. Do not
 *     describe it to a customer as proven." A flagship-offer page is exactly where that
 *     would have slipped in.
 *
 * Idiom matches the neighbouring V2 suites: renderToStaticMarkup plus string assertions,
 * with createRoot and act only where a click must be dispatched.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import HowItWorksV2 from '../HowItWorksV2';
import AcceleratorV2 from '../AcceleratorV2';
import { JOURNEY, BLUEPRINT_GAPS, OFFER, OFFER_NEEDS } from '../../../config/v2Journey';
import { trackEvent } from '../../../utils/tracker';

jest.mock('../../../utils/tracker', () => ({ trackEvent: jest.fn(), initTracker: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const APP = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');

const render = (el: React.ReactElement, at: string): string =>
  renderToStaticMarkup(<MemoryRouter initialEntries={[at]}>{el}</MemoryRouter>);

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const hrefs = (h: string): string[] => [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

const how = render(<HowItWorksV2 />, '/how-it-works');
const acc = render(<AcceleratorV2 />, '/accelerator');

describe('both pages are actually routed', () => {
  it('declares both routes, read from the real App.tsx', () => {
    expect(APP).toContain('<Route path="how-it-works" element={<HowItWorksV2 />} />');
    expect(APP).toContain('<Route path="accelerator" element={<AcceleratorV2 />} />');
  });

  it('mounts them inside the PublicLayoutV2 block, so they get the site nav and footer', () => {
    const layoutAt = APP.indexOf('<Route path="/" element={<PublicLayoutV2 />}>');
    expect(layoutAt).toBeGreaterThan(-1);
    expect(APP.indexOf('path="how-it-works"')).toBeGreaterThan(layoutAt);
    expect(APP.indexOf('path="accelerator"')).toBeGreaterThan(layoutAt);
  });
});

describe('the accelerator page states no duration the registry has not verified', () => {
  it('never says "90 days"', () => {
    // The registry's only verified duration is "12 weeks". Ninety has no row, and CLM-029
    // says a figure without a source row does not go out. If ninety is what we want to
    // sell, it needs a registry row, which is a decision and not a copy edit.
    expect(textOf(acc).toLowerCase()).not.toMatch(/90[\s-]?day/);
    expect(textOf(acc)).not.toMatch(/\bninety\b/i);
  });

  it('carries no price at all', () => {
    expect(textOf(acc)).not.toMatch(/\$\s?\d/);
  });
});

describe('neither page describes roadmap as live', () => {
  it('never mentions Demo Day', () => {
    // C2.2: "has schema but has never been run end to end. Do not describe it to a
    // customer as proven." Task set at zero of forty-six.
    expect(textOf(how).toLowerCase()).not.toContain('demo day');
    expect(textOf(acc).toLowerCase()).not.toContain('demo day');
  });

  it('marks the two stages the capability audit found no platform capability for', () => {
    for (const key of BLUEPRINT_GAPS) {
      const stage = JOURNEY.find((s) => s.key === key)!;
      expect(stage).toBeDefined();
      expect(stage.delivery).toBe('people');
    }
  });

  it('says on the page which stages the platform does and which people do', () => {
    const t = textOf(how).toLowerCase();
    expect(t).toContain('the platform does this');
    expect(t).toContain('our team does this');
  });

  it('describes a people-delivered stage without claiming software does it', () => {
    for (const s of JOURNEY.filter((x) => x.delivery === 'people')) {
      const blob = `${s.summary} ${s.output}`.toLowerCase();
      expect(blob).not.toMatch(/\bautomatic|\bautomated|the platform (generates|selects|produces)/);
    }
  });
});

describe('neither page uses wording the claim registry prohibits', () => {
  for (const [name, h] of [['how it works', how], ['accelerator', acc]] as const) {
    it(`${name} avoids the prohibited words`, () => {
      const t = textOf(h).toLowerCase();
      expect(t).not.toMatch(/\bfree\b/);                                  // CLM-027
      expect(t).not.toMatch(/\bautonomous\b/);                            // CLM-009
      expect(t).not.toMatch(/we certify|colaberry certifies|certified by colaberry/); // CLM-026
      expect(t).not.toMatch(/\bguarantee\b/);
    });
  }
});

describe('each page has exactly one path to enquiry, and instruments it', () => {
  for (const [name, h] of [['how it works', how], ['accelerator', acc]] as const) {
    it(`${name} offers one enquiry link`, () => {
      const contact = hrefs(h).filter((x) => x.startsWith('/contact'));
      expect(contact).toHaveLength(1);
    });
  }

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (trackEvent as jest.Mock).mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('fires cta_click from the accelerator page', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/accelerator']}><AcceleratorV2 /></MemoryRouter>,
      );
    });
    const cta = container.querySelector('a[href^="/contact"]') as HTMLAnchorElement;
    act(() => {
      cta.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(trackEvent).toHaveBeenCalledWith('cta_click', expect.objectContaining({
      cta_name: 'accelerator_enquiry',
    }));
  });
});

describe('the content the pages depend on is complete', () => {
  it('has five stages, each with a summary, an output and a delivery mode', () => {
    expect(JOURNEY).toHaveLength(5);
    expect(JOURNEY.map((s) => s.name)).toEqual(['Learn', 'Build', 'Prove', 'Deploy', 'Manage']);
    for (const s of JOURNEY) {
      expect(s.summary).toBeTruthy();
      expect(s.output).toBeTruthy();
      expect(['platform', 'people']).toContain(s.delivery);
    }
  });

  it('has three offer points and the customer obligations', () => {
    expect(OFFER).toHaveLength(3);
    expect(OFFER_NEEDS.length).toBeGreaterThanOrEqual(4);
    // The non-waivable C7.1 gate must survive onto the page a buyer reads.
    expect(OFFER_NEEDS.join(' ').toLowerCase()).toContain('publish a named reference');
  });

  it('sends the reader from the accelerator to the mechanism, and from there to the proof', () => {
    expect(hrefs(acc)).toContain('/how-it-works');
    expect(hrefs(how)).toContain('/proof');
  });
});
