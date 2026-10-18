/**
 * SegmentPageV2.test.tsx
 *
 * The first block is what the ticket actually asks for. C5.2 and C5.7 both require the page
 * to be "actually routed, proven by the route tree not just the file", because a page under
 * pages/ can look finished and be unreachable. So these read App.tsx and assert the route
 * is declared, rather than asserting the component renders in isolation.
 *
 * The rest are written against the ways this page could mislead somebody: an unwritten
 * segment reaching a visitor, a price appearing, registry-prohibited wording, or the single
 * call to action quietly becoming two.
 *
 * Idiom follows the neighbouring V2 tests: renderToStaticMarkup plus string assertions, and
 * createRoot/act only where a click has to be dispatched. This repo does not use
 * @testing-library.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import SegmentPageV2 from '../SegmentPageV2';
import { SEGMENTS, readySegments, getSegment } from '../../../config/v2Segments';
import { trackEvent } from '../../../utils/tracker';

jest.mock('../../../utils/tracker', () => ({ trackEvent: jest.fn(), initTracker: jest.fn() }));

/*
 * Clicking the CTA is a <Link>, so React Router navigates and sets state. Without this flag
 * React logs an "update not wrapped in act" warning even though the dispatch IS wrapped,
 * because the router's update lands after it. The suite stays green either way; the point
 * is not to leave warnings in a 5,683-test run. Same line as the other interaction suites.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const APP = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');

const html = (slug: string): string => renderToStaticMarkup(
  <MemoryRouter initialEntries={[`/${slug}`]}>
    <SegmentPageV2 slug={slug} />
  </MemoryRouter>,
);

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Every href the rendered markup carries. */
const hrefs = (h: string): string[] =>
  [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe('the page is actually routed, not merely written', () => {
  it('declares a route for every ready segment, read from the real App.tsx', () => {
    expect(APP).toContain('readySegments()');
    expect(APP).toContain('element={<SegmentPageV2 slug={s.slug} />}');
  });

  it('mounts inside the PublicLayoutV2 block, so the page gets the site nav and footer', () => {
    const layoutAt = APP.indexOf('<Route path="/" element={<PublicLayoutV2 />}>');
    const segmentAt = APP.indexOf('readySegments()');
    expect(layoutAt).toBeGreaterThan(-1);
    expect(segmentAt).toBeGreaterThan(layoutAt);
  });

  it('uses static routes rather than a :slug param that would shadow other pages', () => {
    // A dynamic /:slug would have to sit above /proof, /platform and the rest, and would
    // swallow them. Static routes plus an explicit prop cannot.
    expect(APP).not.toContain('path=":slug"');
  });
});

describe('only ready segments reach a visitor', () => {
  it('routes higher education, which Ali chose first on 18 October 2026', () => {
    expect(readySegments().map((s) => s.slug)).toEqual(['higher-education']);
  });

  it('renders nothing at all for a segment that is not ready', () => {
    const notReady = SEGMENTS.filter((s) => !s.ready);
    expect(notReady.length).toBeGreaterThan(0);
    for (const s of notReady) expect(html(s.slug)).toBe('');
  });

  it('renders nothing for a slug that does not exist', () => {
    expect(html('not-a-segment')).toBe('');
  });

  it('getSegment refuses an unready slug even when it is spelled correctly', () => {
    expect(getSegment('enterprise')).toBeUndefined();
    expect(getSegment('higher-education')).toBeDefined();
  });
});

describe('the higher education page', () => {
  const seg = getSegment('higher-education')!;
  const h = html('higher-education');
  const text = textOf(h).toLowerCase();

  it('leads with the segment noun and the promise', () => {
    expect(text).toContain('ai readiness');
    expect(h).toContain('<h1');
    expect(text).toContain('build working ai systems');
  });

  it('offers exactly one path to enquiry, carrying the segment for attribution', () => {
    // C5.1: "each segment has one path to enquiry". One, not two.
    const contact = hrefs(h).filter((x) => x.startsWith('/contact'));
    expect(contact).toEqual(['/contact?segment=higher-education']);
  });

  it('prints no price anywhere', () => {
    // ServicesV2 set this precedent. Separately the C2.3 price for this segment has no row
    // in the C0.6 registry, and the registry is the gate for anything externally visible.
    expect(textOf(h)).not.toMatch(/\$\s?\d/);
  });

  it('never uses wording the claim registry prohibits', () => {
    expect(text).not.toMatch(/\bfree\b/);            // CLM-027, TWC 40 TAC 807.172(d)
    expect(text).not.toMatch(/\bautonomous\b/);       // CLM-009
    expect(text).not.toMatch(/we certify|colaberry certifies|certified by colaberry/); // CLM-026
  });

  it('does not describe cohort one as complete', () => {
    expect(text).not.toContain('demo day');
    expect(text).not.toMatch(/first cohort (has )?(completed|graduated)/);
  });

  it('sends the reader to the published records rather than describing them', () => {
    expect(hrefs(h)).toContain('/proof');
  });

  it('renders three things a buyer gets, not five', () => {
    expect(seg.gets).toHaveLength(3);
    for (const g of seg.gets) expect(textOf(h)).toContain(g.h);
  });
});

describe('the call to action is instrumented', () => {
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

  it('fires cta_click with the segment when the enquiry link is used', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/higher-education']}>
          <SegmentPageV2 slug="higher-education" />
        </MemoryRouter>,
      );
    });
    const cta = container.querySelector('a[href^="/contact"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    act(() => {
      cta!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(trackEvent).toHaveBeenCalledWith('cta_click', expect.objectContaining({
      cta_name: 'segment_enquiry',
      segment: 'higher-education',
    }));
  });
});

describe('the content every ready segment must carry', () => {
  it('is complete for each one, so the template never renders an empty band', () => {
    for (const s of readySegments()) {
      expect(s.seoTitle).toBeTruthy();
      expect(s.seoDescription).toBeTruthy();
      expect(s.lede).toBeTruthy();
      expect(s.proof).toBeTruthy();
      expect(s.ctaLabel).toBeTruthy();
      expect(s.gets).toHaveLength(3);
    }
  });
});
