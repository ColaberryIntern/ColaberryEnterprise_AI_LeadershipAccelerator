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

  it('no ready slug collides with a route App.tsx already declares literally', () => {
    /*
     * Segment routes are GENERATED from readySegments(), so flipping `ready` to true is
     * enough to mount a path. That is convenient and it is also how a segment could
     * silently shadow an existing page. C5.1 checked slug freedom by hand once; this keeps
     * checking it for every segment that ships afterwards.
     */
    const declared = new Set(
      [...APP.matchAll(/path="\/?([a-z0-9-]+)"/g)].map((m) => m[1]),
    );
    for (const s of readySegments()) {
      expect(declared.has(s.slug)).toBe(false);
    }
  });

  it('uses static routes rather than a :slug param that would shadow other pages', () => {
    // A dynamic /:slug would have to sit above /proof, /platform and the rest, and would
    // swallow them. Static routes plus an explicit prop cannot.
    expect(APP).not.toContain('path=":slug"');
  });
});

describe('only ready segments reach a visitor', () => {
  it('routes the three segments Ali approved on 18 October 2026, in IA order', () => {
    // Higher education first as the C2.5 beachhead, then enterprise (C5.5), workforce
    // (C5.6) and the ecosystem partners (C5.8). This list changes only when a segment
    // actually SHIPS, which is a real behaviour change, and that is why the assertion is
    // exact rather than a length check. Government is the one door still unwritten.
    expect(readySegments().map((s) => s.slug))
      .toEqual(['higher-education', 'enterprise', 'workforce', 'ecosystem']);
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
    // Was 'enterprise' until C5.5 shipped it. 'government' is the current unready case:
    // Ali approved that it gets its own section, and no page has been written yet.
    expect(getSegment('government')).toBeUndefined();
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

/*
 * The guards above were written against higher education when it was the only page. They
 * are not specific to it, so they run against EVERY ready segment here: a future segment
 * inherits them by existing rather than by someone remembering to copy a test.
 */
describe.each(readySegments().map((s) => [s.slug, s] as const))(
  'every ready segment: %s',
  (slug, seg) => {
    const h = html(slug);
    const text = textOf(h).toLowerCase();

    it('renders, and leads with its own category noun', () => {
      expect(h).not.toBe('');
      expect(h).toContain('<h1');
      expect(text).toContain(seg.noun.toLowerCase());
    });

    it('prints no price anywhere', () => {
      // C2.3's numbers are approved internally and have no row in the C0.6 registry, and
      // the registry is the gate for anything externally visible.
      expect(textOf(h)).not.toMatch(/\$\s?\d/);
    });

    it('never uses wording the claim registry prohibits', () => {
      expect(text).not.toMatch(/\bfree\b/);       // CLM-027, TWC 40 TAC 807.172(d)
      expect(text).not.toMatch(/\bautonomous\b/); // CLM-009
      expect(text).not.toMatch(/we certify|colaberry certifies|certified by colaberry/); // CLM-026
      expect(text).not.toMatch(/\bguarantee\b/);
    });

    it('never claims a partnership with a frontier lab', () => {
      /*
       * `anthropic.partner` is DO_NOT_PUBLISH in the registry: no contract, badge asset or
       * authorization was ever located for it. The ecosystem page is literally about
       * partnering, which is exactly where that claim would slip back in, so the guard runs
       * against every segment rather than only that one.
       */
      expect(text).not.toMatch(/anthropic\s+(partner|partnership)/);
      expect(text).not.toMatch(/claude\s+code\s+partner/);
      expect(text).not.toMatch(/\bofficial\s+partner\b/);
      expect(text).not.toMatch(/\bpartnered\s+with\s+(anthropic|openai)\b/);
    });

    it('does not describe cohort one as complete', () => {
      expect(text).not.toContain('demo day');
      expect(text).not.toMatch(/first cohort (has )?(completed|graduated)/);
    });

    it('offers exactly one path to enquiry, carrying its own segment for attribution', () => {
      expect(hrefs(h).filter((x) => x.startsWith('/contact')))
        .toEqual([`/contact?segment=${slug}`]);
    });

    it('sends the reader to the published records', () => {
      expect(hrefs(h)).toContain('/proof');
    });

    it('offers three things a buyer gets, not five', () => {
      expect(seg.gets).toHaveLength(3);
      for (const g of seg.gets) expect(textOf(h)).toContain(g.h);
    });

    it('uses American spelling', () => {
      // "license is a product name in the C2.3 price list", and the rule is repo-wide.
      expect(text).not.toMatch(/programme|licence|organisation|centre\b|behaviour|analyse/);
    });
  },
);

describe('the segments argue differently, which is the point of having more than one', () => {
  const ready = readySegments();

  it('gives each segment a distinct lede and proof band', () => {
    // Sharing a template stops five different arguments. It is not permission to ship the
    // same page three times, so the two bands that carry the argument must differ.
    expect(new Set(ready.map((s) => s.lede)).size).toBe(ready.length);
    expect(new Set(ready.map((s) => s.proof)).size).toBe(ready.length);
  });

  it('gives each segment a distinct call to action and set of headings', () => {
    expect(new Set(ready.map((s) => s.ctaLabel)).size).toBe(ready.length);
    const allHeadings = ready.flatMap((s) => s.gets.map((g) => g.h));
    expect(new Set(allHeadings).size).toBe(allHeadings.length);
  });

  it('frames each proof band for the person who actually checks it', () => {
    const bySlug = Object.fromEntries(ready.map((s) => [s.slug, s.proof.toLowerCase()]));
    expect(bySlug['higher-education']).toContain('higher education');
    expect(bySlug.enterprise).toContain('sponsor');
    expect(bySlug.workforce).toContain('funder');
    expect(bySlug.ecosystem).toContain('client');
  });

  it('answers the partner question a partner actually asks first', () => {
    // A partner's opening fear is losing the client relationship, not capability. If the
    // ecosystem page does not answer that in its own words it is a customer page wearing
    // a partner label.
    const eco = getSegment('ecosystem')!;
    const blob = `${eco.lede} ${eco.gets.map((g) => `${g.h} ${g.body}`).join(' ')}`.toLowerCase();
    expect(blob).toMatch(/your account stays yours|relationship/);
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
