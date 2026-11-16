/**
 * HeroV8.test.tsx
 *
 * The hero is the most prominent slot on the site, so what is asserted here is
 * mostly about what may NOT appear in it: no unlabelled product surface, no
 * credential we are not authorised to claim. The rest checks that the diagram
 * still says in text what it says in colour and motion.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import HeroV8 from '../HeroV8';

const CSS = fs.readFileSync(path.join(__dirname, '..', 'heroV8.css'), 'utf8');

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <HeroV8 />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * THE ROLLOUT TOGGLE IS A REAL CONTROL.
 *
 * The model draws a department-by-department / company-wide switch, and a
 * segmented control that looked switchable but changed nothing would be worse
 * than none at all. These drive it the way a visitor does.
 */
describe('HeroV8 — the rollout toggle', () => {
  /*
      Driven on plain react-dom. `@testing-library/react` is not a dependency
      of this app and adding one to write a test is not a decision to take on
      the way past.
  */
  let host: HTMLDivElement;
  let root: Root;

  const mount = (): void => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <HeroV8 />
        </MemoryRouter>,
      );
    });
  };

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const modeButton = (label: RegExp): HTMLButtonElement => {
    const found = [...host.querySelectorAll<HTMLButtonElement>('.cbv2-rollout-block__mode')]
      .find((b) => label.test(b.textContent || ''));
    if (!found) throw new Error('no mode button matching ' + String(label));
    return found;
  };

  const states = (): string[] =>
    [...host.querySelectorAll('.cbv2-dept__status')].map((el) => el.textContent as string);

  const heading = (): string =>
    (host.querySelector('.cbv2-rollout-block__bar h2') as HTMLElement).textContent as string;

  it('starts on department by department', () => {
    mount();
    expect(modeButton(/department by department/i).getAttribute('aria-pressed')).toBe('true');
    expect(modeButton(/company-wide/i).getAttribute('aria-pressed')).toBe('false');
    expect(heading()).toBe('Department by department.');
  });

  it('changes what every department is shown at when the mode changes', () => {
    mount();
    const before = states();
    expect(before).toHaveLength(6);
    expect(before).toContain('Not started');

    act(() => {
      modeButton(/company-wide/i).click();
    });

    const after = states();
    expect(after).not.toEqual(before);
    // Company-wide means every department moves at once; none is left waiting.
    expect(after).not.toContain('Not started');
    expect(after).not.toContain('Next leader');
    expect(heading()).toBe('Company-wide.');
    expect(modeButton(/company-wide/i).getAttribute('aria-pressed')).toBe('true');
  });

  it('names every state in words, so the grid never reads by colour alone', () => {
    mount();
    const legend = host.querySelector('.cbv2-rollout-block__legend') as HTMLElement;
    ['Automating', 'Demo pilot', 'Next leader', 'Not started'].forEach((state) =>
      expect(legend.textContent).toContain(state));
  });
});

/**
 * THE INK GUARD, written because of a defect that shipped to production.
 *
 * The hero above the rollout band is light, so `--h8-ink` is dark ink. Inside
 * the band it has to mean the opposite. The first attempt set the colour on the
 * heading alone; that rule ended up with TWO `color` declarations, and the
 * later one resolved to the light hero's ink. The heading rendered at 1.17:1
 * against near-black and the page looked finished.
 *
 * Both halves of that are asserted: the band flips the token, and no rule in
 * this file declares `color` twice.
 */
describe('HeroV8 — the dark band cannot inherit the light hero’s ink', () => {
  it('flips the ink token on the band rather than per element', () => {
    /*
        lastIndexOf, not indexOf: `.cbv2-h8__rollout` appears twice, first as
        the tail of the grouped rule that sets the shared wrap width, then as
        the band's own rule. indexOf reads the grouped one, and this
        assertion passed against the wrong block on its first run.
    */
    const at = CSS.lastIndexOf('.cbv2-h8__rollout {');
    expect(at).toBeGreaterThan(-1);
    const block = CSS.slice(at, CSS.indexOf('}', at));
    expect(block).toMatch(/--h8-ink:\s*#f4f6fa/);
  });

  it('declares color at most once in any rule', () => {
    const offenders: string[] = [];
    /* Each rule body, with its selector, so a failure names the rule. */
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m = re.exec(CSS);
    while (m !== null) {
      const declarations = (m[2].match(/(^|[;\s])color\s*:/g) || []).length;
      if (declarations > 1) offenders.push(m[1].trim());
      m = re.exec(CSS);
    }
    expect(offenders).toEqual([]);
  });
});

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
   * THIS ASSERTION WAS INVERTED ON 2026-11-16, and the inversion is the point.
   *
   * It required the wired system diagram -- Ingest, Model, Deploy, Agents,
   * Guardrails, five people, a handover stamp -- and it passed for months. Then
   * Ali looked at the deployed page: "what file are you looking at because
   * nothing I gave you looks like this."
   *
   * That diagram is in NEITHER file he has supplied. Not in
   * `colaberry-enterprise-site.html`, not in `colaberry-enterprise-v4.html`. It
   * came from a much older design, and a guard that REQUIRED it is a guard
   * holding the site away from the brief. So it now forbids what it used to
   * demand, and the case below asserts what the model actually specifies.
   */
  it('ships no system diagram, which is in neither supplied file', () => {
    const t = textOf(html());
    ['Ingest', 'Guardrails', 'Ops lead', 'HANDOVER COMPLETE', 'Data eng'].forEach((gone) =>
      expect(t).not.toContain(gone));
  });

  /**
   * THE FIDELITY GUARD THAT WAS MISSING.
   *
   * The checks that preceded this counted bands and compared heading order.
   * Both heroes are one band with one h1, so everything passed while the most
   * prominent element on the site matched nothing Ali had sent. Counting
   * sections cannot see a picture. These assert the hero's PARTS.
   */
  it('builds the hero from the four parts the model gives it', () => {
    const t = textOf(html());

    // 1. the eyebrow and the headline
    expect(t).toContain('Claude Code');
    expect(t).toContain('Colaberry Enterprise AI');
    expect(t).toContain('We build, guide and train your company into AI.');

    // 2. the lede and both buttons
    expect(t).toContain('prove it with a demo pilot');
    expect(t).toContain('Start with a demo pilot');
    expect(t).toContain('Build, guide or train?');

    // 3. three cards, each with the sentence the old chips did not have
    [
      ['We build it.', 'designed with your business experts'],
      ['We guide you.', 'in your own environment and current systems'],
      ['We train you.', 'becomes Forward Deployed Engineers'],
    ].forEach(([title, line]) => {
      expect(t).toContain(title);
      expect(t).toContain(line);
    });

    // 4. the rollout block, with its legend and its toggle
    expect(t).toContain('Your company, moving to AI');
    ['Automating', 'Demo pilot', 'Next leader', 'Not started'].forEach((state) =>
      expect(t).toContain(state));
    expect(t).toContain('Company-wide');
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
