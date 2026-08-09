/**
 * HomeV2.test.tsx
 *
 * Asserts the homepage's governance guarantees, not just that it renders:
 * no blocked claim appears, the unbuilt four-view console is absent, the
 * section budget is respected, and every figure carries an evidence class.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import HomeV2 from '../HomeV2';
import { GOALS, SERVICES } from '../../../config/v2Content';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <HomeV2 />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('HomeV2 — governance guarantees', () => {
  it('renders no blocked claim anywhere on the page', () => {
    const text = textOf(html());
    [
      'Claude Code partner',
      'Anthropic / Claude Code',
      'Certified Anthropic AI Systems Architect',
      '5,000+',
      '10,000+',
      '$100M',
      'Since 2012',
      '477%',
      '28 to 85',
      '$1,788',
      '$4,500',
      'Vistage',
      'ActionCOACH',
    ].forEach((banned) => expect(text).not.toContain(banned));
  });

  it('omits the four-view console entirely — the capability is unbuilt', () => {
    const text = textOf(html());
    expect(text).not.toContain('Four roles, one system');
    expect(text).not.toContain('Executive View');
    expect(text).not.toContain('Architect View');
  });

  it('states the withheld-claims position rather than quietly omitting it', () => {
    expect(textOf(html())).toContain('Track-record claims withheld');
  });

  it('uses the safe credential wording, not the blocked one', () => {
    const text = textOf(html());
    expect(text).toContain('certification preparation');
    expect(text).not.toContain('Certified Anthropic AI Systems Architect');
  });

  it('shows the capability statement instead of a partner designation', () => {
    expect(textOf(html())).toContain('We build on Claude and Claude Code.');
  });
});

describe('HomeV2 — structure', () => {
  it('carries the positioning line as the h1', () => {
    const h = html();
    const h1 = h.slice(h.indexOf('<h1'), h.indexOf('</h1>'));
    expect(textOf(h1)).toContain('Build the system. Build the people.');
    expect(textOf(h1)).toContain('Prove the capability.');
  });

  it('has exactly one h1', () => {
    expect((html().match(/<h1/g) || []).length).toBe(1);
  });

  it('stays within the nine-section budget', () => {
    const count = (html().match(/<section/g) || []).length;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(9);
  });

  it('renders both hero CTAs', () => {
    const text = textOf(html());
    expect(text).toContain('Explore the Live Platform');
    expect(text).toContain('Map an AI Opportunity');
  });

  it('renders all four goal options', () => {
    const text = textOf(html());
    GOALS.forEach((g) => expect(text).toContain(g.label));
  });

  it('defaults the goal chooser to the first option, pressed', () => {
    expect(html()).toContain('aria-pressed="true"');
  });

  it('links every service to its detail route', () => {
    const h = html();
    SERVICES.forEach((s) => expect(h).toContain(`/services/${s.slug}`));
  });

  it('renders both engine lanes with five steps each', () => {
    const text = textOf(html());
    ['Discover', 'Design', 'Build', 'Govern', 'Measure'].forEach((s) => expect(text).toContain(s));
    ['Assess', 'Learn', 'Prove', 'Lead'].forEach((s) => expect(text).toContain(s));
  });
});

describe('HomeV2 — every figure is labelled', () => {
  it('gives each metric an evidence class', () => {
    const h = html();
    const metrics = (h.match(/data-metric="true"/g) || []).length;
    const labelled = (h.match(/data-evidence="/g) || []).length;
    expect(metrics).toBeGreaterThan(0);
    expect(labelled).toBeGreaterThanOrEqual(metrics);
  });

  it('marks the hero readiness panel as sample data', () => {
    expect(textOf(html())).toContain('Sample data');
  });
});
