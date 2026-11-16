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
  /*
      The headline is now the three services, not "Build the system. Build the
      people." That line is `positioning.primary` in the claims registry, which
      is VERIFIED and approved everywhere -- but approved is not mandatory, and
      the v5 site model leads on what the company sells rather than on the
      operating model behind it. The claim is unused here, not retired.
  */
  it('carries the offer as a single h1', () => {
    const h = html();
    expect((h.match(/<h1/g) || []).length).toBe(1);
    const line = h.slice(h.indexOf('<h1'), h.indexOf('</h1>'))
      .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    expect(line).toContain('We build, guide and train');
    expect(line).toContain('your company into AI.');
  });

  it('says what is actually sold, and never promises a result', () => {
    const t = textOf(html());
    expect(t).toContain('prove it with a demo pilot');
    expect(t).toContain('department by department');
    // No figure, and no duration: the hero sells a method, not an outcome.
    expect(t).not.toMatch(/\$\s?[\d,]/);
    expect(t).not.toMatch(/in\s+\d+\s+(days?|weeks?|months?)/i);
  });

  /*
      Sentence case, not the title case the two retired CTAs used. The v5 model
      is sentence case throughout, and so are the pages added alongside it
      (/services, /book, /demo-pilot), so this is the site agreeing with itself.
  */
  it('renders both calls to action, pointing at the pilot and the chooser', () => {
    const t = textOf(html());
    expect(t).toContain('Start with a demo pilot');
    expect(t).toContain('Build, guide or train?');
    expect(html()).toContain('href="/demo-pilot"');
    expect(html()).toContain('href="/services"');
  });

  /**
   * The status chips are the readout of the animation happening in the diagram.
   * They exist so the cycle's meaning is available as TEXT and not only as
   * colour and motion -- which also means a reader who never sees it animate
   * still learns what the machine is doing.
   */
  it('reads the animation out in words', () => {
    const t = textOf(html());
    expect(t).toContain('We build it');
    expect(t).toContain('We guide you');
    expect(t).toContain('We train you');
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
  it('ships no product screenshot', () => {
    expect(html()).not.toContain('/site-v2/shot-');
  });

  /**
   * THIS ASSERTION FLIPPED, and the flip is the point.
   *
   * It used to read "and needs no sample label", which was true while the hero
   * held nothing but a drawing. The hero now carries the rollout grid, which
   * the v5 model puts inside the opening band and which is invented data: six
   * departments at made-up stages. The old assertion would have passed only by
   * the badge being absent, which is the exact failure it existed to catch, so
   * it is inverted rather than deleted. The most prominent slot on the site is
   * the last place a mock should go unlabelled.
   */
  it('labels the rollout grid as sample data', () => {
    const h = html();
    expect(h).toContain('data-sample="true"');
    expect(textOf(h)).toContain('Sample data');
  });

  it('states every department stage as a word, never colour alone', () => {
    const t = textOf(html());
    ['Automating', 'Demo pilot', 'Next leader', 'Not started'].forEach((label) =>
      expect(t).toContain(label));
  });

  it('claims no Anthropic credential or partner designation', () => {
    const t = textOf(html());
    ['Certified Anthropic', 'Anthropic Partner', 'Official Anthropic', 'Claude Code Partner']
      .forEach((banned) => expect(t).not.toContain(banned));
  });
});
