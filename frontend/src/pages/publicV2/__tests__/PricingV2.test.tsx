/**
 * PricingV2.test.tsx
 *
 * Prices are the claims most likely to go stale and most damaging when they do:
 * a retired $4,500 offer survived on a landing page for a month after withdrawal.
 * So the assertions are about provenance, not about specific numbers.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import PricingV2 from '../PricingV2';
import { PRICING_TIERS, SERVICE_SHAPES, COMPARE_ROWS } from '../../../config/v2Pricing';
import { publicClaim } from '../../../config/claimsRegistry';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/pricing']}>
      <PricingV2 />
    </MemoryRouter>,
  );
const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('PricingV2 — every figure comes from the registry', () => {
  it('renders each tier price through its registry claim', () => {
    const text = textOf(html());
    PRICING_TIERS.forEach((t) => {
      const wording = publicClaim(t.priceClaim, '/pricing');
      if (wording) expect(text).toContain(wording);
    });
  });

  it('shows the figures that ARE approved for this route', () => {
    // These are approved for /pricing only, which is why this page exists.
    // RETIRED 2026-08-19: there is no month-to-month plan. The claim is kept in
    // the registry as NEEDS_VERIFICATION with no approved route, so the key
    // cannot be quietly reused for a different number -- and it must now
    // resolve to null everywhere rather than print a price we do not offer.
    expect(publicClaim('pricing.individual.monthly', '/pricing')).toBeNull();
    expect(publicClaim('pricing.team', '/pricing')).not.toBeNull();
    expect(publicClaim('pricing.department', '/pricing')).not.toBeNull();
  });

  it('renders no retired or repo-only price', () => {
    const text = textOf(html());
    expect(text).not.toContain('4,500');
    expect(text).not.toContain('1,788');
  });

  it('states that engagements are scoped rather than listed', () => {
    // Registry wording is "Scoped on a call"; match the claim, not my phrasing.
    expect(textOf(html())).toMatch(/[Ss]coped on a call/);
  });

  it('does not claim to issue the credential itself', () => {
    const text = textOf(html());
    expect(text).toContain('issued by the certifying body');
    expect(text).not.toContain('Certified Anthropic AI Systems Architect');
  });
});

describe('PricingV2 — structure', () => {
  it('marks exactly one tier as recommended', () => {
    expect(PRICING_TIERS.filter((t) => t.featured)).toHaveLength(1);
  });

  it('has exactly one h1 and exposes no admin route', () => {
    const h = html();
    expect((h.match(/<h1/g) || []).length).toBe(1);
    expect(h).not.toMatch(/\/admin\b/);
  });

  it('sends every tier somewhere real', () => {
    const h = html();
    PRICING_TIERS.forEach((t) => expect(h).toContain(`href="${t.ctaRoute}"`));
  });
});

describe('PricingV2 — Build, Guide and Train', () => {
  it('renders all three services with their verb, promise and commercial shape', () => {
    const text = textOf(html());
    expect(SERVICE_SHAPES).toHaveLength(3);
    SERVICE_SHAPES.forEach((svc) => {
      expect(text).toContain(svc.verb);
      expect(text).toContain(svc.promise);
      expect(text).toContain(svc.terms);
    });
  });

  it('recommends exactly one service, and marks it by more than colour', () => {
    const featured = SERVICE_SHAPES.filter((s) => s.featured);
    expect(featured).toHaveLength(1);
    // --featured carries a top rule and a border in CSS, so the recommendation
    // survives greyscale. Colour alone would not.
    expect(html()).toContain('cbv2-shape--featured');
  });

  it('carries NO figure inside a service card: shapes are shapes, prices live in the ladder', () => {
    // The whole point of the shape cards is that they commit to a structure
    // without asserting a number the registry has not approved for this route.
    SERVICE_SHAPES.forEach((svc) => {
      const copy = [svc.verb, svc.promise, svc.blurb, svc.terms, ...svc.includes].join(' ');
      expect(copy).not.toMatch(/\$\s?\d/);
      expect(copy).not.toMatch(/\d[\d,]*\s*(?:dollars|USD)/i);
    });
  });

  it('keeps the comparison table in step with the cards', () => {
    // A row that forgets a column, or a fourth service added without a column,
    // is the failure this guards. The table is authored by hand beside the
    // cards, so nothing but a test keeps the two from drifting.
    expect(COMPARE_ROWS).toHaveLength(8);
    COMPARE_ROWS.forEach((row) => {
      expect(row.label.length).toBeGreaterThan(0);
      [row.build, row.guide, row.train].forEach((cell) => {
        expect(typeof cell).toBe('string');
        expect(cell.length).toBeGreaterThan(0);
      });
    });
  });

  it('renders every comparison row and one column header per service', () => {
    const text = textOf(html());
    COMPARE_ROWS.forEach((row) => expect(text).toContain(row.label));
    const h = html();
    // scope="col" headers: the leading "Compare" cell plus one per service.
    expect((h.match(/scope="col"/g) || []).length).toBe(SERVICE_SHAPES.length + 1);
    expect((h.match(/scope="row"/g) || []).length).toBe(COMPARE_ROWS.length);
  });

  it('sends every service somewhere real', () => {
    const h = html();
    SERVICE_SHAPES.forEach((svc) => expect(h).toContain(`href="${svc.ctaRoute}"`));
  });

  it('still leads to the demo pilot, which is what every engagement starts with', () => {
    expect(textOf(html())).toMatch(/demo pilot/i);
  });
});
