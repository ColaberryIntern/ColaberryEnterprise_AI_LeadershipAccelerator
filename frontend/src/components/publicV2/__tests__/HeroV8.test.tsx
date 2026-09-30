/**
 * HeroV8.test.tsx
 *
 * The hero is the most prominent slot on the site, so what is asserted here is
 * mostly about what may NOT appear in it: no unlabelled product surface, no
 * credential we are not authorised to claim. The rest checks that the diagram
 * still says in text what it says in colour and motion.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import HeroV8 from '../HeroV8';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <HeroV8 />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('HeroV8', () => {
  it('carries the positioning as a single h1', () => {
    const h = html();
    expect((h.match(/<h1/g) || []).length).toBe(1);
    const line = h.slice(h.indexOf('<h1'), h.indexOf('</h1>'))
      .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    expect(line).toContain('Build the system.');
    expect(line).toContain('Build the people.');
  });

  it('states the supporting claim in its approved wording', () => {
    // The supplied design rewrote this to "same platform, same timeline". The
    // phrasing kept is the one the claims work settled on.
    expect(textOf(html())).toContain('in one platform, at the same time');
  });

  it('renders both calls to action in the site-wide title case', () => {
    const t = textOf(html());
    expect(t).toContain('Explore the Live Platform');
    expect(t).toContain('Map an AI Opportunity');
  });

  /**
   * The status chips are the readout of the animation happening in the diagram.
   * They exist so the cycle's meaning is available as TEXT and not only as
   * colour and motion -- which also means a reader who never sees it animate
   * still learns what the machine is doing.
   */
  it('reads the animation out in words', () => {
    const t = textOf(html());
    expect(t).toContain('System in production');
    expect(t).toContain('People own the system');
    expect(t).toContain('Handover complete');
  });

  /**
   * Both layers of the diagram must be present. If someone adds a stage to the
   * drawing and not the CSS delays, or removes one, this is the guard that the
   * machine still depicts the whole path the headline argues.
   */
  it('draws the machine layer and the people layer', () => {
    const t = textOf(html());
    ['Ingest', 'Model', 'Deploy', 'Agents', 'Guardrails', 'One platform'].forEach((n) =>
      expect(t).toContain(n));
    ['Data eng', 'Architect', 'Ops lead', 'Analyst', 'Exec'].forEach((n) =>
      expect(t).toContain(n));
  });

  it('hides the diagram from assistive tech, since the copy already says it', () => {
    expect(html()).toContain('aria-hidden="true"');
  });

  /**
   * No product screenshot in the hero. An unlabelled depiction of a live product
   * surface in the most prominent slot on the site is exactly what the claims
   * registry exists to prevent; the readiness dashboard lives further down the
   * page behind its own gate.
   */
  it('ships no product screenshot and needs no sample label', () => {
    const h = html();
    expect(h).not.toContain('/site-v2/shot-');
    expect(h).not.toContain('data-sample');
  });

  it('claims no Anthropic credential or partner designation', () => {
    const t = textOf(html());
    ['Certified Anthropic', 'Anthropic Partner', 'Official Anthropic', 'Claude Code Partner']
      .forEach((banned) => expect(t).not.toContain(banned));
  });
});
