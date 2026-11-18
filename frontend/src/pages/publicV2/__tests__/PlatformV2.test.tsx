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
  /*
     INVERTED 2026-11-16, not deleted. This used to REQUIRE every showroom
     surface label on the page ("renders a tab for every surface whose
     capability is live"). The tabs went on 2026-08-20; after that it stayed
     green only because the hero's diagram carried the labels as SVG <title>
     tooltips. That diagram is in neither design file Ali supplied and was
     removed when its CSS vanished and production drew it as black boxes. The
     v5 model names none of these surfaces. A guard that requires something the
     model does not have holds the page away from the model, so it now says the
     opposite: no surface is depicted as a diagram node, a tooltip, or a tab.
     ("Free company workspace" is also the offer's name in running copy, so this
     is asserted on markup, not on text.)
  */
  /*
     NARROWED 2026-11-16 (page group 2), not loosened. The page now draws the model's
     line icons and button arrows, so "no <svg> at all" would forbid the model itself.
     What the guard is about is a DIAGRAM: an svg that names something. So every svg
     must be decorative (aria-hidden) and carry no <title> or <text> at all.
  */
  it('depicts no showroom surface as a diagram node, a tooltip or a tab', () => {
    const h = html();
    const svgs = h.match(/<svg[\s\S]*?<\/svg>/g) || [];
    svgs.forEach((svg) => {
      expect(svg).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect(svg).not.toMatch(/<title|<text/);
    });
    SHOWROOM_SURFACES.forEach((s) => expect(h).not.toContain(`<title>${s.label}</title>`));
    const tabTexts = [...h.matchAll(/<(\w+)[^>]*role="tab"[^>]*>([\s\S]*?)<\/\1>/g)].map((m) =>
      textOf(m[2]),
    );
    expect(tabTexts.length).toBeGreaterThan(0);
    SHOWROOM_SURFACES.forEach((s) => tabTexts.forEach((t) => expect(t).not.toContain(s.label)));
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
      'Certified Anthropic Forward Deployed AI Engineer',
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
    /*
        "momentum, not courses" lived in TwoExperiences, which the v5 cut to
        four surfaces removed. CapabilityEarned's "course completion is not one
        of them" then carried it, and CapabilityEarned came off the page in turn
        when the four surfaces were folded into one band.

        The POINT has never changed and is still made explicitly, now by the
        "for your people" surface: readiness is computed from evidence, not
        attendance. The pattern follows whichever sentence is on the page rather
        than pinning one phrasing -- pinning the phrase is exactly what made
        this assertion go red twice while the claim itself was intact.
    */
    expect(text).toMatch(
      /computed from evidence, not attendance|course completion is not one of them|momentum, not courses|not course completion/i,
    );
    expect(text).toMatch(/self-reported/i);
  });
});

/**
 * THE FIDELITY GUARD.
 *
 * Ali gave this repo `colaberry-enterprise-site.html` as the design model and
 * then said the site did not look like it. Measured side by side at 1440px,
 * this page was the biggest gap on the site: nine bands and 11,854px against
 * the model's four and 5,910px, because each of the four surfaces was its own
 * full-width band.
 *
 * A note saying "keep it to four bands" does not fail a build. This does. Every
 * assertion below was mutation-tested: re-rendering any surface as its own
 * <section>, or putting a retired band back on the page, turns one of them red.
 */
describe('PlatformV2 — four bands, as the v5 model draws it', () => {
  it('renders exactly four top-level bands', () => {
    expect((html().match(/<section/g) || []).length).toBe(4);
  });

  it('carries all four surfaces, each addressed to a role', () => {
    const text = textOf(html());
    ['For leaders', 'For project tracking', 'For proof', 'For your people'].forEach((who) =>
      expect(text).toContain(who),
    );
  });

  it('numbers the surfaces one to four', () => {
    const h = html();
    ['leaders', 'tracking', 'proof', 'people'].forEach((id) =>
      expect(h).toContain(`id="cbv2-surf-${id}"`),
    );
  });

  it('does not bring back a band the model has no room for', () => {
    const text = textOf(html());
    /* The build pipeline, the maturity ladder and the inline thesis band. Each
       component still exists; none of them belongs on this page. */
    [
      'From a sentence about your business',
      'From AI Aware to AI Organization',
      'The best people to work on your AI already work for you',
    ].forEach((gone) => expect(text).not.toContain(gone));
  });

  /**
   * Every invented figure on this page is badged. Three of them now exist -- the
   * rollout table, the releases table and the repository panel -- and an
   * unbadged mock of a customer's dashboard, plan or repository is a fabricated
   * proof claim, not a layout detail.
   */
  it('badges every invented figure, not just the first', () => {
    const h = html();
    expect((h.match(/Sample data/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('shows the repository figure as illustrative, with a pending criterion', () => {
    const text = textOf(html());
    expect(text).toContain('your-org/order-exceptions');
    /* If every criterion read "confirmed" the figure would be a claim that
       nothing ever fails verification. One is deliberately pending. */
    expect(text).toMatch(/AC-\d pending/);
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
