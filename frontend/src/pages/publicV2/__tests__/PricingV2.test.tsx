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
import { PRICING_TIERS } from '../../../config/v2Pricing';
import { publicClaim } from '../../../config/claimsRegistry';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/v2/pricing']}>
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
    expect(publicClaim('pricing.individual.monthly', '/pricing')).not.toBeNull();
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
