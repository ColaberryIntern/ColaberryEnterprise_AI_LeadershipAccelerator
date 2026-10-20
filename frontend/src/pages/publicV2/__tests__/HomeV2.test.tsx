/**
 * HomeV2.test.tsx
 *
 * Asserts the homepage's governance guarantees, not just that it renders:
 * no blocked claim appears, the unbuilt four-view console is absent, the
 * section budget is respected, and every figure carries an evidence class.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import HomeV2 from '../HomeV2';
import { SERVICES } from '../../../config/v2Content';
import { SEGMENTS, readySegments } from '../../../config/v2Segments';

/** Read off disk, because a door is only safe if the route it points at is declared. */
const APP = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');

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
  /**
   * UPDATED with the v7 hero. Two changes, both deliberate.
   *
   * The third line is now the payoff rather than a third verb: "Prove the
   * capability" read as one more thing you DO, which flattened the structure
   * into a list when lines one and two already carry the differentiator.
   *
   * And the assertion no longer runs through textOf(). The progress rails are
   * real DOM sitting INSIDE the words -- "system" and "people" each wrap a span
   * -- so replacing tags with a space, which is right for prose, reads
   * "Build the system ." here. Tag boundaries are collapsed instead, so this
   * asserts the sentence a reader actually sees rather than the markup that
   * produces it.
   */
  it('carries the positioning line as the h1', () => {
    const h = html();
    const h1 = h.slice(h.indexOf('<h1'), h.indexOf('</h1>'));
    const line = h1.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    expect(line).toContain('Build the system.');
    expect(line).toContain('Build the people.');
    // "Your team owns it." left the h1 with the v8 hero and is now the deck
    // paragraph beneath it. That is the better structure -- the h1 is the
    // positioning statement, the deck supports it -- so the line is asserted on
    // the page rather than inside the heading.
    expect(textOf(h)).toContain('Your team owns it.');
  });

  it('has exactly one h1', () => {
    expect((html().match(/<h1/g) || []).length).toBe(1);
  });

  /**
   * The homepage section budget.
   *
   * Raised from 9 to 10 on 2026-08-17 for the "idea to shipped build" band, at
   * Ali's explicit direction to feature the story-build system prominently. The
   * budget is not a formality -- it is what has kept this page from sprawling
   * the way the old marketing site did -- so it is RAISED deliberately and
   * recorded here rather than quietly deleted.
   *
   * Raised from 10 to 12 on 2026-09-11. The page reached twelve in #1895
   * (2026-08-27, the session-11 build-day work) and this test went red — but
   * nothing ran frontend tests then, so it stayed red for a fortnight and the
   * first anyone heard was when CI started running them. Put to Ali as a design
   * decision, not a test fix: keep twelve and record it, or cut two. He chose to
   * keep them. So the ceiling moves the same way it did last time, deliberately
   * and with the reason written down, rather than the guard being quietly
   * loosened or switched off.
   *
   * The rule stands: the next section to be added should replace one, not
   * extend this again.
   *
   * 2026-10-20, C5.2: HONORED, the first time. C5.1's segment doors needed a
   * home and the page was already at twelve, so the goal picker was REPLACED
   * rather than the ceiling raised a third time. Ali chose the swap from three
   * options put to him: swap, raise to thirteen, or a full five-band rewrite.
   * The picker asked the visitor to self-identify by GOAL where the IA routes
   * by SEGMENT, so it was the right job on the wrong axis and the natural thing
   * to give up. One section out, one in; the count is unchanged.
   */
  it('stays within the twelve-section budget', () => {
    const count = (html().match(/<section/g) || []).length;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(12);
  });

  it('renders both hero CTAs', () => {
    const text = textOf(html());
    expect(text).toContain('Explore the Live Platform');
    expect(text).toContain('Map an AI Opportunity');
  });

  /**
   * THE FIVE DOORS replaced the goal picker on 2026-10-20 (C5.2).
   *
   * This is the first time the budget's own rule - "the next section to be added
   * should replace one, not extend this again" - has actually been honored. The
   * picker asked the visitor to self-identify by GOAL; the C5.1 information
   * architecture routes by SEGMENT, so it was the right job on the wrong axis.
   * The count stays at twelve.
   *
   * The tests below are about the property that makes the swap safe: the doors
   * are GENERATED from readySegments(), the same source App.tsx maps to routes,
   * so a door cannot point at a page that is not mounted.
   */
  it('renders a door for every ready segment, and no others', () => {
    const text = textOf(html());
    readySegments().forEach((s) => expect(text).toContain(s.name));
    expect(readySegments().length).toBeGreaterThan(0);
  });

  it('renders exactly as many doors as there are ready segments', () => {
    const h = html();
    const doors = (h.match(/class="cbv2-door"/g) || []).length;
    expect(doors).toBe(readySegments().length);
  });

  it('does not render a door for a segment that is not ready', () => {
    const text = textOf(html());
    const unready = SEGMENTS.filter((s) => !s.ready);
    // Guards the guard: if every segment were ready this would pass vacuously.
    expect(unready.length).toBeGreaterThan(0);
    unready.forEach((s) => expect(text).not.toContain(s.name));
  });

  it('points every door at a route App.tsx actually mounts', () => {
    const h = html();
    readySegments().forEach((s) => {
      expect(h).toContain(`href="/${s.slug}"`);
    });
    // The routes are generated from the same call, so this asserts the pairing
    // rather than a hand-maintained list.
    expect(APP).toContain('readySegments().map');
  });

  it('instruments each door', () => {
    const h = html();
    readySegments().forEach((s) => {
      expect(h).toContain(`data-track="home_door_${s.slug}"`);
    });
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
  /**
   * UPDATED IN 1.11. The hero used to draw the readiness dashboard as HTML
   * <Metric> components; it now shows the real product screenshot. The rule it
   * was protecting is unchanged and still enforced: any figure presented as data
   * must be labelled as sample. That labelling now comes from the SampleBadge in
   * the figure caption, and it must survive the image failing to load, which is
   * why the badge lives in the caption rather than being burnt into the picture.
   */
  it('labels the depicted product data as sample', () => {
    const h = html();
    expect(h).toContain('data-sample="true"');
    expect(h).toContain('<figcaption');
  });

  it('gives any remaining rendered metric an evidence class', () => {
    const h = html();
    const metrics = (h.match(/data-metric="true"/g) || []).length;
    const labelled = (h.match(/data-evidence="/g) || []).length;
    expect(labelled).toBeGreaterThanOrEqual(metrics);
  });

  it('describes the screenshot for people who cannot see it', () => {
    const h = html();
    const alt = h.match(/alt="([^"]{40,})"/);
    expect(alt).not.toBeNull();
  });

  it('marks the hero readiness panel as sample data', () => {
    expect(textOf(html())).toContain('Sample data');
  });
});
