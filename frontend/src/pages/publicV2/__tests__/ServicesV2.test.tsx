/**
 * ServicesV2.test.tsx
 *
 * The load-bearing assertion here is that NO price renders. Services pricing is
 * "scoped on a call", and independent review found a competitor's speed claim
 * had previously been restated as ours — so the tests police numbers, not layout.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ServicesV2, ServiceDetailV2 } from '../ServicesV2';
import { SERVICE_DETAILS } from '../../../config/v2Services';

const indexHtml = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/v2/services']}>
      <ServicesV2 />
    </MemoryRouter>,
  );

const detailHtml = (slug: string): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/v2/services/${slug}`]}>
      <Routes>
        <Route path="/v2/services/:slug" element={<ServiceDetailV2 />} />
      </Routes>
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('ServicesV2 index', () => {
  it('opens with the outcome question, not a list of offer names', () => {
    const h = indexHtml();
    const h1 = h.slice(h.indexOf('<h1'), h.indexOf('</h1>'));
    expect(textOf(h1)).toBe('What outcome do you need next?');
  });

  it('renders all five services', () => {
    const text = textOf(indexHtml());
    SERVICE_DETAILS.forEach((s) => expect(text).toContain(s.name));
  });

  it('links each service to its detail route', () => {
    const h = indexHtml();
    SERVICE_DETAILS.forEach((s) => expect(h).toContain(`/v2/services/${s.slug}`));
  });

  it('renders NO currency figure anywhere', () => {
    expect(textOf(indexHtml())).not.toMatch(/\$\s?[\d,]/);
  });

  it('states that pricing is scoped on a call', () => {
    expect(textOf(indexHtml())).toContain('Scoped on a call');
  });

  it('alternates rows via CSS order, applying the flip to every other row only', () => {
    const h = indexHtml();
    // 5 services -> rows 2 and 4 flip
    expect((h.match(/cbv2-svc--flip/g) || []).length).toBe(2);
  });

  it('shows every deliverable for every service', () => {
    const text = textOf(indexHtml());
    SERVICE_DETAILS.forEach((s) => s.deliverables.forEach((d) => expect(text).toContain(d)));
  });

  it('renders no blocked claim', () => {
    const text = textOf(indexHtml());
    ['5,000+', '10,000+', '$100M', 'Since 2012', '477%', 'Claude Code partner'].forEach((b) =>
      expect(text).not.toContain(b),
    );
  });
});

describe('ServiceDetailV2', () => {
  it.each(SERVICE_DETAILS.map((s) => [s.slug, s.name] as const))(
    'renders the six required fields for %s',
    (slug, name) => {
      const text = textOf(detailHtml(slug));
      expect(text).toContain(name);
      expect(text).toContain('Best fit');
      expect(text).toContain('Typical trigger');
      expect(text).toContain('Deliverables');
      expect(text).toContain('Proof required');
      expect(text).toContain('Next step');
    },
  );

  it('renders NO currency figure on any detail page', () => {
    SERVICE_DETAILS.forEach((s) => {
      expect(textOf(detailHtml(s.slug))).not.toMatch(/\$\s?[\d,]/);
    });
  });

  it('has exactly one h1 per detail page', () => {
    SERVICE_DETAILS.forEach((s) => {
      expect((detailHtml(s.slug).match(/<h1/g) || []).length).toBe(1);
    });
  });

  it('degrades gracefully for an unknown slug instead of crashing', () => {
    const text = textOf(detailHtml('does-not-exist'));
    expect(text).toContain('Service not found');
    expect(text).toContain('All services');
  });

  it('never states a duration or speed claim', () => {
    // a competitor's "3 weeks vs 12-16 weeks" had previously been restated as ours
    SERVICE_DETAILS.forEach((s) => {
      const text = textOf(detailHtml(s.slug));
      expect(text).not.toMatch(/\b\d+\s*(-|to)\s*\d+\s*weeks?\b/i);
      expect(text).not.toMatch(/\bin\s+\d+\s+(days?|weeks?|months?)\b/i);
    });
  });
});
