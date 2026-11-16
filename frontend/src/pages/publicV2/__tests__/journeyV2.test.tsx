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
  it('declares /how-it-works, read from the real App.tsx', () => {
    expect(APP).toContain('<Route path="how-it-works" element={<HowItWorksV2 />} />');
  });

  /*
      /accelerator USED to render AcceleratorV2 here. The v5 site restructure
      folds it into Train, because /accelerator and the Workforce Architect
      Accelerator service page were two addresses describing the same 12-week
      course -- which splits inbound links and hands search engines a duplicate.

      The route is redirected rather than deleted, so this still asserts the
      address works; what it now asserts is where it goes. The AcceleratorV2
      COMPONENT still exists and the content tests below still cover it, but it
      is no longer reachable from a URL -- so if that component is ever deleted,
      delete the content tests in this file with it rather than leaving them
      green against nothing.
  */
  it('redirects /accelerator into Train rather than dropping the URL', () => {
    expect(APP).toContain('<Route path="accelerator" element={<Navigate to="/services/train" replace />} />');
  });

  it('mounts them inside the PublicLayoutV2 block, so they get the site nav and footer', () => {
    const layoutAt = APP.indexOf('<Route path="/" element={<PublicLayoutV2 />}>');
    expect(layoutAt).toBeGreaterThan(-1);
    expect(APP.indexOf('path="how-it-works"')).toBeGreaterThan(layoutAt);
    expect(APP.indexOf('path="accelerator"')).toBeGreaterThan(layoutAt);
  });
});

describe('the accelerator page states no duration the registry has not verified', () => {
  it('states the duration the registry DID verify, so the absence test cannot pass on an empty page', () => {
    // <Claim> renders NOTHING when a key is unpublishable, so "never says 90 days" would
    // also hold for a page that lost its duration entirely. This is the positive half:
    // the registry's own wording for program.duration has to be on the page.
    expect(textOf(acc)).toContain('12 weeks');
  });

  it('renders the positioning claim on both pages, through the registry', () => {
    for (const h of [how, acc]) {
      expect(textOf(h)).toContain('Build the system. Build the people. Prove the capability.');
    }
  });

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
  /*
      THE RULE IS ONE DESTINATION, NOT ONE LINK.

      C5.1's "each page has one path to enquiry" was written when /contact and
      /lab were two competing front doors, and a page offering both made the
      visitor choose between them without knowing the difference. The v5 site
      model folds both into /demo-pilot and points every primary button there,
      so a page may now carry several buttons -- they all go to the same place,
      which is what the rule was protecting.

      So this asserts the thing that can still regress: at least one enquiry
      link, and no enquiry link pointing anywhere other than the one
      destination.
  */
  const ENQUIRY = ['/contact', '/lab', '/demo-pilot'];
  for (const [name, h] of [['how it works', how], ['accelerator', acc]] as const) {
    it(`${name} offers an enquiry path, and only one destination`, () => {
      const enquiry = hrefs(h).filter((x) => ENQUIRY.some((e) => x.startsWith(e)));
      expect(enquiry.length).toBeGreaterThan(0);
      const destinations = new Set(enquiry.map((x) => x.split('?')[0]));
      expect(Array.from(destinations)).toEqual(['/demo-pilot']);
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
    const cta = container.querySelector('a[href^="/demo-pilot"]') as HTMLAnchorElement;
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

/**
 * THE FIDELITY GUARD for /how-it-works.
 *
 * Ali gave this repo `colaberry-enterprise-site.html` as the design model and
 * then said the site did not look like it. Measured at 1440px, this page ran
 * eight bands against the model's six: it carried the home rollout grid, which
 * the model does not have here, and gave the five-stage mechanism a band of its
 * own, which the model has nowhere.
 *
 * The count is exact in both directions. The disclosure assertions below are
 * the reason the five stages were folded into the band above rather than
 * deleted with it: they are the C2.2 audit's finding on the page, and a band
 * count is not a reason to retire one.
 */
describe('/how-it-works renders the model’s six bands, and keeps the disclosure', () => {
  it('renders exactly six bands', () => {
    expect((how.match(/<section/g) || []).length).toBe(6);
  });

  it('no longer carries the home rollout grid', () => {
    // Its own heading, and the sample badge that only it puts on this page.
    expect(how).not.toContain('cbv2-deptmap');
    expect(textOf(how)).not.toContain('Department by department.');
  });

  it('still says which stages the platform does and which people do', () => {
    const t = textOf(how);
    expect(t).toContain('the platform does this');
    expect(t).toContain('our team does this');
  });

  it('still states that two of the five are delivered by people', () => {
    expect(textOf(how)).toContain('Two of the five are delivered by people');
  });

  it('keeps the five stages under the band above, not in one of their own', () => {
    /* If they were a band again, the sub-heading would be an h2 in its own
       section. The fold is what the sub-heading proves. */
    expect(how).toContain('cbv2-jy__sub');
    expect(how).toContain('cbv2-jy__stages');
  });
});
