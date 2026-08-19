/**
 * HeroV7.test.tsx
 *
 * The hero's underlines are not decoration -- they encode a claim ("both tracks
 * advance together, in one platform"), so what they encode is asserted here,
 * along with the two things that are easy to get wrong in a decorative
 * component and impossible to notice by looking at it on a fast machine:
 * reduced-motion users must get a finished, meaningful frame rather than an
 * empty one, and the meaning must exist as TEXT and not only as coloured width.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import HeroV7 from '../HeroV7';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <HeroV7 />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('HeroV7', () => {
  it('states the positioning in the h1, with exactly one h1', () => {
    const h = html();
    expect((h.match(/<h1/g) || []).length).toBe(1);
    const line = h.slice(h.indexOf('<h1'), h.indexOf('</h1>'))
      .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    expect(line).toContain('Build the system.');
    expect(line).toContain('Build the people.');
  });

  /**
   * The rails carry the two tracks, so there must be one per track and the
   * stage pips must match the number of stages. If someone adds a stage to the
   * copy and not to the rail, the underline silently stops describing the
   * readout beside it.
   */
  it('draws one rail per track, each with a pip for every stage', () => {
    const h = html();
    expect((h.match(/cbv2-h7rail cbv2-h7rail--sys/g) || []).length).toBe(1);
    expect((h.match(/cbv2-h7rail cbv2-h7rail--ppl/g) || []).length).toBe(1);
    // Count the MODIFIER, not the base class: every pip carries both, so
    // matching /cbv2-h7pip/ double-counts each one.
    // Four stages per track: system is four of a kind, people is three plus the
    // certification gate, which is drawn differently on purpose.
    expect((h.match(/cbv2-h7pip--sys/g) || []).length).toBe(4);
    expect((h.match(/cbv2-h7pip--ppl/g) || []).length).toBe(3);
    expect((h.match(/cbv2-h7pip--cer/g) || []).length).toBe(1);
  });

  /**
   * The certification stage is the one gate in the sequence, and it is drawn in
   * its own colour. Colour alone is not information, but the pip is also the
   * only place the gate is marked in the markup, so its presence is asserted --
   * the readout below it supplies the words.
   */
  it('marks the certification stage as its own kind of pip', () => {
    expect((html().match(/cbv2-h7pip--cer/g) || []).length).toBe(1);
  });

  /**
   * Server render is the no-JS and pre-hydration frame. It must not be blank of
   * meaning: the first stage of each track is named, so a reader who never runs
   * the animation still learns what the two tracks are.
   */
  it('names the opening stage of both tracks without any JavaScript', () => {
    const t = textOf(html());
    expect(t).toContain('Opportunity mapped');
    expect(t).toContain('Team selected');
    expect(t).toContain('System');
    expect(t).toContain('People');
  });

  it('carries the supporting claim and both calls to action', () => {
    const t = textOf(html());
    expect(t).toContain('in one platform, at the same time');
    expect(t).toContain('Explore the Live Platform');
    expect(t).toContain('Map an AI Opportunity');
  });

  /**
   * The hero is now typographic: its dashboard screenshot moved down to the
   * free-workspace section. A screenshot reappearing here would be an unlabelled
   * depiction of a product surface in the most prominent slot on the site, which
   * is exactly what the claims registry exists to prevent.
   */
  it('ships no image, so nothing here needs a sample label', () => {
    expect(html()).not.toContain('<img');
  });

  /**
   * Blocked wordings. The credential rule on this site is specific: Colaberry's
   * own certification path may be named, an Anthropic credential may not.
   */
  it('claims no Anthropic credential or partner designation', () => {
    const t = textOf(html());
    ['Certified Anthropic', 'Anthropic Partner', 'Official Anthropic', 'Claude Code Partner']
      .forEach((banned) => expect(t).not.toContain(banned));
  });
});
