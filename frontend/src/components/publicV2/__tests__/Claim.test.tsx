/**
 * Claim.test.tsx — asserts the rendering guarantee, not just that components mount.
 *
 * The point of these primitives is that an unverified claim, an unbuilt surface,
 * or an unlabelled figure cannot reach a customer-facing page. These tests fail
 * if any of those becomes possible again.
 *
 * Uses react-dom/server, matching the existing frontend test convention
 * (see components/admin/kitConfig/__tests__/panels.smoke.test.tsx). Deliberately
 * does NOT add @testing-library — CLAUDE.md forbids drive-by dependency adds.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Claim, canShow, EvidenceBadge, SampleBadge, Metric, CapabilityNotice } from '../Claim';

const html = (el: React.ReactElement): string => renderToStaticMarkup(el);
/** visible text only, tags stripped — what a reader actually sees */
const text = (el: React.ReactElement): string =>
  html(el).replace(/<[^>]*>/g, '').trim();

describe('<Claim> — renders governed copy or nothing', () => {
  it('renders a verified, live claim', () => {
    expect(text(<Claim claimKey="anthropic.capability" />)).toBe(
      'We build on Claude and Claude Code.',
    );
  });

  it('renders NOTHING for the unverified partner designation', () => {
    expect(text(<Claim claimKey="anthropic.partner" />)).toBe('');
  });

  it('renders NOTHING for a true claim about an unbuilt surface', () => {
    expect(text(<Claim claimKey="surface.fourview.console" />)).toBe('');
  });

  it('renders NOTHING for an unknown key rather than throwing', () => {
    expect(text(<Claim claimKey="not.a.real.key" />)).toBe('');
  });

  it('renders a fallback when one is supplied', () => {
    expect(text(<Claim claimKey="anthropic.partner" fallback={<em>omitted</em>} />)).toBe('omitted');
  });

  it('honours route scoping', () => {
    expect(text(<Claim claimKey="pricing.team" route="/pricing" />)).toContain('$1,200');
    expect(text(<Claim claimKey="pricing.team" route="/" />)).toBe('');
  });

  it('never renders the retired or repo-only prices', () => {
    const out = text(
      <>
        <Claim claimKey="pricing.retired.4500" />
        <Claim claimKey="pricing.repo.1788" />
      </>,
    );
    expect(out).not.toContain('4,500');
    expect(out).not.toContain('1,788');
  });

  it('renders into the requested element', () => {
    expect(html(<Claim claimKey="company.name" as="h2" />)).toContain('<h2');
  });
});

describe('canShow — for conditionally rendering whole sections', () => {
  it('is true for a publishable claim and false for a blocked one', () => {
    expect(canShow('anthropic.capability')).toBe(true);
    expect(canShow('surface.fourview.console')).toBe(false);
    expect(canShow('credential.cca')).toBe(false);
  });
});

describe('badges communicate by text and shape, not colour alone', () => {
  it('labels every evidence class in words', () => {
    expect(text(<EvidenceBadge evidence="verified" />)).toContain('Verified');
    expect(text(<EvidenceBadge evidence="anonymized" />)).toContain('Anonymized');
    expect(text(<EvidenceBadge evidence="illustrative" />)).toContain('Illustrative demo');
    expect(text(<EvidenceBadge evidence="pending" />)).toContain('Pending approval');
  });

  it('exposes the class as a data attribute for automated auditing', () => {
    expect(html(<EvidenceBadge evidence="anonymized" />)).toContain('data-evidence="anonymized"');
  });

  it('says "Sample data" in words', () => {
    expect(text(<SampleBadge />)).toContain('Sample data');
  });
});

describe('<Metric> — a figure cannot render unlabelled', () => {
  it('renders value, label and an evidence marker', () => {
    const out = html(<Metric value="63%" label="Avg Architect Readiness" evidence="illustrative" />);
    expect(out).toContain('63%');
    expect(out).toContain('Avg Architect Readiness');
    expect(out).toContain('Sample data');
    expect(out).toContain('data-metric="true"');
  });

  it('always carries a machine-checkable evidence attribute', () => {
    expect(html(<Metric value="12" label="Evidence shipped" evidence="verified" />)).toContain(
      'data-evidence="verified"',
    );
  });

  it('shows an illustrative figure as sample data, not as verified', () => {
    const out = text(<Metric value="1,640" label="Builder XP / week" evidence="illustrative" />);
    expect(out).toContain('Sample data');
    expect(out).not.toContain('Verified');
  });

  it('can suppress the inline badge when a block-level badge covers it', () => {
    expect(text(<Metric value="9" label="Evaluations" evidence="illustrative" badgeHidden />))
      .not.toContain('Sample data');
  });

  it('renders an optional delta', () => {
    expect(text(<Metric value="63%" label="Readiness" delta="+18 in 8 wks" evidence="illustrative" />))
      .toContain('+18 in 8 wks');
  });
});

describe('<CapabilityNotice> — explains an absence without leaking a verification failure', () => {
  it('explains that an unbuilt surface is in development', () => {
    expect(text(<CapabilityNotice claimKey="surface.fourview.console" />)).toMatch(/In development/i);
  });

  it('renders nothing for a live surface', () => {
    expect(text(<CapabilityNotice claimKey="surface.readiness.rollup" />)).toBe('');
  });

  it('renders nothing for a claim blocked on VERIFICATION, so no reason is disclosed', () => {
    expect(text(<CapabilityNotice claimKey="anthropic.partner" />)).toBe('');
  });
});
