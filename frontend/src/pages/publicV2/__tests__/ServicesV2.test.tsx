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
    expect(textOf(h1)).toMatch(/Build\. Guide\. Train\./i);
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

  it('leads with the demo pilot, because two of the three services start there', () => {
    const text = textOf(indexHtml());
    expect(text).toContain('The demo pilot.');
    expect(text.indexOf('The demo pilot.')).toBeLessThan(text.indexOf('Three services.'));
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
