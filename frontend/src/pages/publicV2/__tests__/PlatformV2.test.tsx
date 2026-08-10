/**
 * PlatformV2.test.tsx
 *
 * The load-bearing assertion: the showroom depicts ONLY surfaces that exist.
 * The four-view console is unbuilt, so it must be described as in development
 * and never rendered as a product surface.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import PlatformV2 from '../PlatformV2';
import { SHOWROOM_SURFACES, DATA_EARNED } from '../../../config/v2Platform';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/v2/platform']}>
      <PlatformV2 />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('PlatformV2 — only live surfaces are depicted', () => {
  it('renders a tab for every surface whose capability is live', () => {
    const text = textOf(html());
    SHOWROOM_SURFACES.forEach((s) => expect(text).toContain(s.label));
  });

  it('never depicts the unbuilt four-view console as a product surface', () => {
    const text = textOf(html());
    expect(text).not.toContain('Executive View');
    expect(text).not.toContain('Builder View');
    expect(text).not.toContain('Architect View');
    expect(text).not.toContain('Proof View');
    expect(text).not.toContain('Four roles, one system');
  });

  it('states plainly that role-based views are in development', () => {
    expect(textOf(html())).toMatch(/In development/i);
  });

  it('describes Experience Studio without exposing or linking it', () => {
    const h = html();
    expect(textOf(h)).toContain('Experience Studio');
    // never link an admin surface from a public page
    expect(h).not.toContain('/admin/orchestration');
    expect(h).not.toContain('href="/admin');
    expect(textOf(h)).toContain('deliberately not shown or linked');
  });

  it('exposes no admin route anywhere on the page', () => {
    expect(html()).not.toMatch(/\/admin\b/);
  });
});

describe('PlatformV2 — labelling and claims', () => {
  it('labels the surface panel as sample data', () => {
    expect(textOf(html())).toContain('Sample data');
  });

  it('gives every metric an evidence class', () => {
    const h = html();
    const metrics = (h.match(/data-metric="true"/g) || []).length;
    const labelled = (h.match(/data-evidence="/g) || []).length;
    expect(metrics).toBeGreaterThan(0);
    expect(labelled).toBeGreaterThanOrEqual(metrics);
  });

  it('renders no blocked claim', () => {
    const text = textOf(html());
    [
      'Claude Code partner',
      'Certified Anthropic AI Systems Architect',
      '5,000+',
      '10,000+',
      '$100M',
      'Since 2012',
      '477%',
      '$1,788',
    ].forEach((b) => expect(text).not.toContain(b));
  });

  it('renders no price', () => {
    expect(textOf(html())).not.toMatch(/\$\s?[\d,]/);
  });
});

describe('PlatformV2 — the how-it-is-earned explainer', () => {
  it('explains every way readiness is earned', () => {
    const text = textOf(html());
    DATA_EARNED.forEach((d) => expect(text).toContain(d.title));
  });

  it('makes the evidence-not-completion point explicitly', () => {
    const text = textOf(html());
    expect(text).toContain('not course completion');
    expect(text).toContain('self-reported');
  });
});

describe('PlatformV2 — structure', () => {
  it('has exactly one h1', () => {
    expect((html().match(/<h1/g) || []).length).toBe(1);
  });

  it('selects the first surface by default', () => {
    expect(html()).toContain('aria-selected="true"');
  });

  it('marks the tab list for assistive technology', () => {
    const h = html();
    expect(h).toContain('role="tablist"');
    expect(h).toContain('role="tabpanel"');
  });
});
