/**
 * HomeV2.test.tsx
 *
 * Asserts the homepage's governance guarantees, not just that it renders:
 * no blocked claim appears, the unbuilt four-view console is absent, the
 * section budget is respected, and every figure carries an evidence class.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
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

/**
 * Live-DOM mount for the interaction tests below. Uses createRoot + act, the
 * pattern already established across this repo's interaction suites (see
 * portal/today/__tests__/TodayFeedV2.filter.test.tsx) -- @testing-library is not
 * a dependency here, and adding one to test a keyboard handler is not a trade
 * worth making.
 */
function mount(): { container: HTMLElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <HomeV2 />
      </MemoryRouter>,
    );
  });
  return { container, root };
}

const press = (el: Element, key: string): void => {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

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

  /**
   * The chooser moved from four toggle buttons (`aria-pressed`) to a proper
   * tablist: one selection revealing one panel is what tabs are for, and it
   * gives arrow-key navigation in assistive tech for free. The intent this
   * guards is unchanged -- a goal is selected on arrival, so the panel below is
   * never empty -- and it now also checks that the panel is wired to the tab
   * that selected it, which the old markup did not express at all.
   */
  it('defaults the goal chooser to the first option and wires it to the panel', () => {
    const h = html();
    expect(h).toContain('role="tablist"');
    expect(h).toContain('aria-selected="true"');
    expect(h).toContain('role="tabpanel"');
    expect(h).toContain('aria-controls="cbv2-goal-panel"');
    // exactly one tab may be selected at a time
    expect((h.match(/aria-selected="true"/g) || []).length).toBe(1);
  });

  /**
   * The role="tablist" assertion above passes on markup that does nothing when
   * you press an arrow key -- which is exactly what shipped first, and a browser
   * check caught it rather than this file. Declaring the role tells assistive
   * tech that arrows navigate the group and Tab exits it; both halves of that
   * promise are behaviour, so both are asserted here.
   */
  it('makes the tablist a single tab stop via a roving tabindex', () => {
    const h = html();
    const tabIndexes = (h.match(/role="tab"[^>]*tabindex="(-?\d)"/g) || []).map((m) =>
      (m.match(/tabindex="(-?\d)"/) as RegExpMatchArray)[1],
    );
    expect(tabIndexes.length).toBe(GOALS.length);
    expect(tabIndexes.filter((t) => t === '0').length).toBe(1);
    expect(tabIndexes.filter((t) => t === '-1').length).toBe(GOALS.length - 1);
  });

  it('moves selection with arrow keys, wrapping at both ends', () => {
    const { container, root } = mount();
    const tabs = (): HTMLElement[] => Array.from(container.querySelectorAll('[role="tab"]'));
    const selected = (): string => (tabs().find((t) => t.getAttribute('aria-selected') === 'true')
      ?.textContent ?? '');
    const last = GOALS.length - 1;

    expect(selected()).toContain(GOALS[0].label);
    press(tabs()[0], 'ArrowRight');
    expect(selected()).toContain(GOALS[1].label);
    // wraps backwards off the first tab rather than dead-ending
    press(tabs()[1], 'ArrowLeft');
    press(tabs()[0], 'ArrowLeft');
    expect(selected()).toContain(GOALS[last].label);
    // and forwards off the last
    press(tabs()[last], 'ArrowRight');
    expect(selected()).toContain(GOALS[0].label);
    press(tabs()[0], 'End');
    expect(selected()).toContain(GOALS[last].label);
    press(tabs()[last], 'Home');
    expect(selected()).toContain(GOALS[0].label);

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('keeps focus with the selection so the next arrow press continues', () => {
    // Without moving focus, arrowing twice would return to the tab the user
    // started on -- the selection would appear to bounce.
    const { container, root } = mount();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    (tabs[0] as HTMLElement).focus();
    press(tabs[0], 'ArrowRight');
    expect(document.activeElement).toBe(tabs[1]);
    press(document.activeElement as Element, 'ArrowRight');
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('swaps the panel contents with the selected goal, not just the tab state', () => {
    const { container, root } = mount();
    const panel = (): string => container.querySelector('[role="tabpanel"]')?.textContent ?? '';
    const lastGoal = GOALS[GOALS.length - 1];

    expect(panel()).toContain(GOALS[0].service);
    press(container.querySelectorAll('[role="tab"]')[0], 'End');
    expect(panel()).toContain(lastGoal.service);
    expect(panel()).toContain(lastGoal.proof);

    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('shows an answer for the default goal, so the panel is never empty', () => {
    const text = textOf(html());
    expect(text).toContain(GOALS[0].service);
    expect(text).toContain(GOALS[0].proof);
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
