/**
 * ServicesV2.test.tsx
 *
 * The load-bearing assertion here is that NO price renders. Services pricing is
 * "scoped on a call", and independent review found a competitor's speed claim
 * had previously been restated as ours — so the tests police numbers, not layout.
 *
 * Rewritten when /services went from five engagements to three services. The
 * number guards are unchanged and are the reason this file exists; what changed
 * is the shape being guarded. New here: every retired slug must redirect rather
 * than 404, because the five old URLs have been live and indexed.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ServicesV2, ServiceDetailV2 } from '../ServicesV2';
import {
  SERVICE_PAGES,
  LEGACY_SERVICE_REDIRECTS,
} from '../../../config/v2ServicePages';
import { SERVICE_SHAPES, COMPARE_ROWS } from '../../../config/v2Pricing';
import { SERVICE_DETAILS } from '../../../config/v2Services';

const indexHtml = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/services']}>
      <ServicesV2 />
    </MemoryRouter>,
  );

/** Render the detail route. Returns '' for a slug that redirects, by design. */
const detailHtml = (slug: string): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/services/${slug}`]}>
      <Routes>
        <Route path="/services/:slug" element={<ServiceDetailV2 />} />
        <Route path="*" element={<p>redirected</p>} />
      </Routes>
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('ServicesV2 index', () => {
  it('opens on the three services, not a list of five offer names', () => {
    const h = indexHtml();
    const h1 = h.slice(h.indexOf('<h1'), h.indexOf('</h1>'));
    /* each full stop is its own span (the model's accent dot), so close the gap the tag left */
    expect(textOf(h1).replace(/\s+\./g, '.')).toMatch(/Build\. Guide\. Train\./i);
  });

  it('renders all three services', () => {
    const text = textOf(indexHtml());
    SERVICE_SHAPES.forEach((s) => expect(text).toContain(s.promise));
  });

  it('links each service to its detail route', () => {
    const h = indexHtml();
    SERVICE_PAGES.forEach((s) => expect(h).toContain(`/services/${s.slug}`));
  });

  it('renders NO currency figure anywhere', () => {
    expect(textOf(indexHtml())).not.toMatch(/\$\s?[\d,]/);
  });

  it('states that pricing is scoped on a call', () => {
    expect(textOf(indexHtml())).toMatch(/scoped on a call|pricing/i);
  });

  /**
   * THE SUBSTANCE, NOT THE BAND.
   *
   * This used to require a "The demo pilot." band above the three cards, and
   * that it came first. The band came off when the chooser was brought to the
   * v5 model, which has no equivalent on this page.
   *
   * The fact it protected has not left: a visitor who does not yet know which
   * service they want still learns, from the comparison table, that two of the
   * three begin with a demo pilot, and the closing band offers them one. That
   * is what is asserted now. Pinning the band's heading was pinning a layout;
   * this pins the thing a visitor needs to be able to find out.
   */
  it('says two of the three services start with a demo pilot, and offers one', () => {
    const text = textOf(indexHtml());
    const startsWith = COMPARE_ROWS.find((r) => r.label === 'Starts with');
    expect(startsWith).toBeDefined();
    const row = startsWith as NonNullable<typeof startsWith>;
    expect([row.build, row.guide].filter((v) => /demo pilot/i.test(v))).toHaveLength(2);
    expect(row.train).not.toMatch(/demo pilot/i);
    // and the page itself offers the pilot, rather than only describing it
    expect(indexHtml()).toContain('/demo-pilot');
  });

  /**
   * The model closes every page on the same band, and this was the one page
   * that ended on a pricing footnote instead.
   */
  it('closes on the demo-pilot band, linked directly rather than through a redirect', () => {
    const h = indexHtml();
    expect(textOf(h)).toContain('See AI run on one of your processes');
    expect(h).toContain('href="/demo-pilot"');
    expect(h).not.toContain('href="/contact"');
  });

  /**
   * The chooser's own three questions, which the model has and this page did
   * not. They are about choosing BETWEEN the services, not about any one of
   * them, which is why they are not a duplicate of the service pages' FAQ.
   */
  it('answers the three questions a visitor has while still deciding', () => {
    const text = textOf(indexHtml());
    expect(text).toContain('Common questions.');
    [
      'Can we combine services?',
      'Is Build an off-the-shelf product?',
      'Will Guide add another tool to our stack?',
    ].forEach((q) => expect(text).toContain(q));
  });

  /**
   * THE FIDELITY GUARD. The model draws this page as five bands; it was
   * shipping four, missing the FAQ and the close and carrying a demo-pilot
   * band the model does not have. Exact in both directions, so adding or
   * dropping a band is a decision made on purpose.
   */
  it('renders exactly the model’s five bands', () => {
    expect((indexHtml().match(/<section/g) || []).length).toBe(5);
  });

  it('compares the three across every declared dimension', () => {
    const text = textOf(indexHtml());
    COMPARE_ROWS.forEach((r) => expect(text).toContain(r.label));
  });

  it('keeps the comparison table a real table, with row headers for screen readers', () => {
    const h = indexHtml();
    expect(h).toContain('<table');
    expect(h).toContain('scope="row"');
    expect(h).toContain('scope="col"');
  });
});

describe('ServiceDetailV2', () => {
  it('renders a page for each of the three services', () => {
    SERVICE_PAGES.forEach((s) => {
      expect(textOf(detailHtml(s.slug))).toContain(s.promise);
    });
  });

  it('renders NO currency figure on any detail page', () => {
    SERVICE_PAGES.forEach((s) => {
      expect(textOf(detailHtml(s.slug))).not.toMatch(/\$\s?[\d,]/);
    });
  });

  it('has exactly one h1 per detail page', () => {
    SERVICE_PAGES.forEach((s) => {
      expect((detailHtml(s.slug).match(/<h1/g) || []).length).toBe(1);
    });
  });

  it('never states a duration or speed claim', () => {
    SERVICE_PAGES.forEach((s) => {
      const text = textOf(detailHtml(s.slug));
      expect(text).not.toMatch(/\b\d+\s*(-|to)\s*\d+\s*weeks?\b/i);
      expect(text).not.toMatch(/\bin\s+\d+\s+(days?|weeks?|months?)\b/i);
    });
  });

  it('degrades gracefully for an unknown slug instead of crashing', () => {
    expect(textOf(detailHtml('no-such-service'))).toContain('Service not found');
  });

  it('shows the commercial terms, read from the same source as /pricing', () => {
    SERVICE_PAGES.forEach((s) => {
      const shape = SERVICE_SHAPES.find((x) => x.key === s.slug);
      expect(shape).toBeDefined();
      expect(textOf(detailHtml(s.slug))).toContain(shape!.terms);
    });
  });

  it('routes on to the other two services from every service page', () => {
    SERVICE_PAGES.forEach((s) => {
      const h = detailHtml(s.slug);
      SERVICE_PAGES.filter((o) => o.slug !== s.slug).forEach((o) => {
        expect(h).toContain(`/services/${o.slug}`);
      });
    });
  });
});

describe('the five retired service URLs', () => {
  it('covers every slug that used to have a page', () => {
    // If a sixth engagement is ever added to SERVICE_DETAILS and then retired,
    // this fails rather than silently leaving a dead URL behind.
    SERVICE_DETAILS.forEach((s) => {
      expect(Object.keys(LEGACY_SERVICE_REDIRECTS)).toContain(s.slug);
    });
  });

  it('redirects each one instead of rendering "not found"', () => {
    Object.keys(LEGACY_SERVICE_REDIRECTS).forEach((slug) => {
      expect(textOf(detailHtml(slug))).not.toContain('Service not found');
    });
  });

  it('points each one at a service that actually exists', () => {
    Object.values(LEGACY_SERVICE_REDIRECTS).forEach((target) => {
      expect(SERVICE_PAGES.map((s) => s.slug)).toContain(target);
    });
  });
});
