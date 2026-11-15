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
  /*
      The h1 is now the offer, not the operating model. "Build the system. Build
      the people." is `positioning.primary` in the claims registry: VERIFIED and
      approved on every route, but approved is not mandatory. The v5 site model
      leads on what the company sells. The claim is unused here, not retired.
  */
  it('carries the offer as the h1', () => {
    const h = html();
    const h1 = h.slice(h.indexOf('<h1'), h.indexOf('</h1>'));
    const line = h1.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    expect(line).toContain('We build, guide and train');
    expect(line).toContain('your company into AI.');
    expect(textOf(h)).toContain('Then the next leader.');
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
    expect(text).toContain('Start with a demo pilot');
    expect(text).toContain('Build, guide or train?');
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

  it('links each of the three services to its page', () => {
    const h = html();
    ['build', 'guide', 'train'].forEach((slug) =>
      expect(h).toContain(`/services/${slug}`));
  });

  /*
      THE "TWO ENGINES" BAND IS GONE, and with it the lane-step assertion that
      was here. It described the operating model as an abstraction, directly
      under a hero that now names the three services outright. What replaced it
      is concrete: the hero's three chips, and the department map below.
  */
  it('shows the rollout as departments at different stages, not as an abstraction', () => {
    const text = textOf(html());
    ['Finance', 'Operations', 'Customer service', 'Sales', 'HR', 'IT &amp; Data'].forEach((d) =>
      expect(text).toContain(d));
  });

  it('states each department stage as a WORD, never colour alone', () => {
    const text = textOf(html());
    ['Automating', 'Demo pilot', 'Next leader', 'Not started'].forEach((label) =>
      expect(text).toContain(label));
  });

  it('labels the department map as sample data, because it depicts no real customer', () => {
    // An unlabelled mock of a customer dashboard is a fabricated proof claim.
    expect(html()).toContain('data-sample="true"');
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

/**
 * THE DEMO-PILOT BAND replaced the second CTA interrupt on 2026-11-14.
 *
 * The second honouring of the budget's own rule. The page carried TWO interrupts
 * pushing to the same workspace; the first survives, so the swap cut a repetition
 * rather than a message, and the band that took its place answers a question the
 * page never answered: how an engagement actually begins.
 *
 * These guard the properties that make the swap safe: the count did not move, the
 * remaining interrupt is still there, the five engagements are still reachable, and
 * the band asserts no figure it cannot be held to.
 */
describe('HomeV2 — the demo-pilot band', () => {
  it('renders all three steps, in order', () => {
    const text = textOf(html());
    ['Find the ROI', 'Prove it with a demo pilot', 'Roll it out, leader by leader']
      .forEach((t) => expect(text).toContain(t));
    const idx = ['Find the ROI', 'Prove it with a demo pilot', 'Roll it out, leader by leader']
      .map((t) => text.indexOf(t));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('marks the middle step by a label, not by colour alone', () => {
    // The step is inverted in CSS. Inversion is invisible to a screen reader and
    // to greyscale, so the tag is what actually carries "start here".
    expect(textOf(html())).toContain('Where everyone starts');
  });

  /*
      BOUNDED BY THE BAND'S OWN CLOSING TAG, not by the heading of whatever
      section used to follow it.

      This previously sliced from cbv2-demopilot-title to cbv2-services-title.
      When the five-engagement band was replaced, that second anchor stopped
      existing, indexOf returned -1, and `slice(start, -1)` quietly extended the
      slice to the whole rest of the page -- so the guard started reading the
      book citation's "95%" and the accolades' figures as if they were in this
      band. It failed loudly only because the band then moved up the page; had
      it stayed put, the widening would have gone unnoticed. The length check
      below did not catch it, because a far-too-long slice is still longer
      than zero.
  */
  it('asserts no figure: the ROI case is promised, never quantified', () => {
    const h = html();
    const start = h.indexOf('cbv2-demopilot-title');
    expect(start).toBeGreaterThan(-1);
    const end = h.indexOf('</section>', start);
    expect(end).toBeGreaterThan(start);
    const band = h.slice(start, end);
    // Sanity-check the bounds: the band's own content must be inside them, and
    // the neighbouring sections' must not.
    expect(band).toContain('Three steps. No big-bang project.');
    expect(band).not.toContain('Trust Before Intelligence');
    const text = band.replace(/<[^>]*>/g, ' ');
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/\d+\s?%/);
  });

  /*
      BOTH mid-page CTA interrupts are gone now. The first was swapped for this
      demo-pilot band; the second went with the v5 rewrite, because the hero and
      the final CTA already offer a way in and this band answers the same "what
      do I do next" question with an actual answer rather than a nudge.
  */
  it('no longer interrupts the page to push the workspace', () => {
    expect((html().match(/cbv2-cint/g) || []).length).toBe(0);
    expect(textOf(html())).not.toContain('Stop reading about it');
  });

  it('still routes on to the services', () => {
    expect(html()).toContain('href="/services"');
  });
});
