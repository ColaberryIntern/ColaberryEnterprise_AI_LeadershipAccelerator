/**
 * PlatformV2.test.tsx
 *
 * WHAT THIS GUARDS NOW. The page was rebuilt on Ali's call of 2026-08-20: the surface
 * showroom, the role-based-views notice, the maturity ladder, the roadmap and the Experience
 * Studio block were all removed, and the argument carries the page. Five assertions here
 * kept describing that removed showroom and sat red for weeks, unnoticed, because nothing
 * ran them. They are gone.
 *
 * What survives is everything that is about HONESTY rather than layout, because none of it
 * changed when the layout did: the unbuilt four-view console is never depicted as a product,
 * no admin route reaches a public page, no blocked claim and no price is rendered, and the
 * page still says readiness is earned rather than self-reported. Two claim boundaries the
 * page header records as settled with Ali are now asserted too.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import PlatformV2 from '../PlatformV2';
import { SHOWROOM_SURFACES } from '../../../config/v2Platform';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/platform']}>
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

  /* The "In development" notice and the Experience Studio description were both removed
     with the showroom. The one thing those two tests guarded that still matters — that no
     admin surface is ever linked from a public page — is covered by the next case. */

  it('exposes no admin route anywhere on the page', () => {
    expect(html()).not.toMatch(/\/admin\b/);
  });
});

describe('PlatformV2 — labelling and claims', () => {
  it('labels the surface panel as sample data', () => {
    expect(textOf(html())).toContain('Sample data');
  });

  /**
   * CONDITIONAL, NOT VACUOUS. This required at least one metric on the page and then that
   * every one carried an evidence class. The showroom that held the metrics is gone, so
   * "at least one" now fails on a page that is telling no lies at all. The honesty property
   * — a figure never appears without its evidence class — is kept for the day metrics
   * return; the demand that the page HAVE metrics was layout, and layout is Ali's call.
   */
  it('never renders a metric without an evidence class', () => {
    const h = html();
    const metrics = (h.match(/data-metric="true"/g) || []).length;
    const labelled = (h.match(/data-evidence="/g) || []).length;
    expect(labelled).toBeGreaterThanOrEqual(metrics);
  });

  /**
   * THE TWO CLAIM BOUNDARIES the page header records as settled with Ali on 2026-08-19.
   * Neither was asserted before; both are the kind of sentence that drifts back in during a
   * copy edit and is very hard to spot in review.
   */
  it('never calls the work production-grade', () => {
    expect(textOf(html())).not.toMatch(/production-grade/i);
  });

  it('never claims Claude Code as an embedded runtime', () => {
    // The honest claim is a Claude Code PROMPT shipped with every story. "Built on",
    // "powered by" and "runs on" would each promise the runtime instead.
    expect(textOf(html())).not.toMatch(/(built|powered|runs|running)\s+on\s+Claude\s+Code/i);
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

describe('PlatformV2 — the evidence-not-completion argument', () => {
  /* The DATA_EARNED explainer block was removed with the showroom; its titles no longer
     appear and asserting them would pin a section Ali took out. */

  /**
   * THE SUBSTANCE, NOT THE SENTENCE. The page must still say readiness is earned rather than
   * self-reported, or the whole Platform argument collapses into a training-report claim.
   * The rebuilt page says it as "Earned, not self-reported" and "Capability, not course
   * completion"; the old assertion also demanded the literal words "training report", which
   * was the phrasing of a paragraph that no longer exists. Pinning the phrase is what made
   * this go red while the claim itself was intact on the page.
   */
  it('makes the evidence-not-completion point explicitly', () => {
    const text = textOf(html());
    expect(text).toMatch(/momentum, not courses|not course completion/i);
    expect(text).toMatch(/self-reported/i);
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
