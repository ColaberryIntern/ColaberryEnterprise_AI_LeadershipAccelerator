import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import BrandReadinessPanel, { type BrandReadinessPanelProps } from '../BrandReadinessPanel';
import type { Brand, BrandSendReadiness } from '../../../../services/adminBrandApi';

/**
 * The four empty states must be DISTINGUISHABLE, and `unknown` must never read as `fail`.
 *
 * Four different facts get collapsed into one blank panel by almost every dashboard:
 *
 *   loading         — nothing is known yet
 *   load-failed     — the request failed; what is on screen is not current
 *   empty           — the request SUCCEEDED and there is nothing in scope
 *   none-configured — the brand exists but has nothing set up
 *
 * The third and fourth matter most. "You have no brands" is a permissions question; "this brand
 * has nothing configured" is a setup task. An operator shown the wrong one debugs the wrong
 * thing. And a failed fetch rendering as "no brands" actively teaches them their brands were
 * deleted.
 *
 * These tests assert the four are mutually exclusive by CONTENT, not merely that something
 * rendered — a panel that always printed "No data" would satisfy a weaker check.
 */

let container: HTMLDivElement;
let root: Root;

const BRAND: Brand = {
  id: 'b1', tenant_id: 't1', slug: 'colaberry-enterprise', name: 'Colaberry Enterprise',
  status: 'active', default_public_url: null, support_email: null,
};

function baseProps(over: Partial<BrandReadinessPanelProps> = {}): BrandReadinessPanelProps {
  return {
    loading: false,
    error: null,
    brands: [],
    scopeMode: 'scoped',
    selectedBrandId: null,
    readiness: null,
    readinessLoading: false,
    onSelectBrand: () => undefined,
    onRetry: () => undefined,
    ...over,
  };
}

function render(over: Partial<BrandReadinessPanelProps> = {}): string {
  act(() => { root.render(<BrandReadinessPanel {...baseProps(over)} />); });
  return container.textContent ?? '';
}

/**
 * The text of each table cell, separately.
 *
 * NOT a regex over `container.textContent`. Adjacent elements concatenate with NO separator,
 * so a verified domain whose SPF passes yields one string: verifiedPassNot checked...
 * A word-boundary-anchored pattern then matches nothing there, because the character before
 * P is a letter and no boundary exists between them. The first version of these tests failed against a
 * correct component for exactly that reason. Reading cells individually is both immune to it
 * and a stricter assertion: it checks the value landed in a CELL, not merely somewhere on the
 * page.
 */
function cellTexts(): string[] {
  return Array.from(container.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim());
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('the four empty states are distinct', () => {
  it('LOADING says it is loading, and does not claim there is nothing', () => {
    const text = render({ loading: true });
    expect(text).toMatch(/Loading brands/i);
    expect(text).not.toMatch(/No brands/i);
    expect(text).not.toMatch(/Nothing configured/i);
  });

  it('LOAD FAILED says the request failed and that the view is not current', () => {
    const text = render({ error: 'The brand list could not be loaded.' });
    expect(text).toMatch(/Could not load brands/i);
    // The load-bearing sentence: without it, an operator reads a server error as data loss.
    expect(text).toMatch(/not a statement that you have no brands/i);
    expect(text).not.toMatch(/No brands in your scope/i);
  });

  it('EMPTY says the request succeeded and nothing is in scope', () => {
    const text = render({ brands: [] });
    expect(text).toMatch(/No brands in your scope/i);
    expect(text).toMatch(/request succeeded/i);
    expect(text).not.toMatch(/Could not load/i);
  });

  it('EMPTY explains a DENIED scope as permissions, not as an empty system', () => {
    const text = render({ brands: [], scopeMode: 'denied' });
    expect(text).toMatch(/no tenant membership/i);
    expect(text).toMatch(/permissions result, not an empty system/i);
  });

  it('NONE CONFIGURED distinguishes a brand with no setup from having no brands', () => {
    const readiness: BrandSendReadiness = { brand: BRAND, domains: [], profiles: [] };
    const text = render({ brands: [BRAND], selectedBrandId: 'b1', readiness });
    expect(text).toMatch(/Nothing configured for this brand yet/i);
    expect(text).toMatch(/cannot send/i);
    // The brand IS listed — this is a setup task, not an absence.
    expect(text).toMatch(/Colaberry Enterprise/);
    expect(text).not.toMatch(/No brands in your scope/i);
  });

  it('the four states produce four different bodies', () => {
    // A panel that rendered one generic "No data" for everything would pass each test above
    // in isolation only by accident; this is the assertion that forbids it outright.
    const texts = [
      render({ loading: true }),
      render({ error: 'boom' }),
      render({ brands: [] }),
      render({ brands: [BRAND], selectedBrandId: 'b1', readiness: { brand: BRAND, domains: [], profiles: [] } }),
    ];
    expect(new Set(texts).size).toBe(4);
  });
});

describe('an unrun DNS check is not a failure', () => {
  const withDomain = (spf: 'unknown' | 'pass' | 'fail'): BrandSendReadiness => ({
    brand: BRAND,
    domains: [{
      id: 'd1', hostname: 'mail.colaberry.ai', purpose: 'email', is_primary: true,
      provider: null, verification_status: 'verified',
      spf_status: spf, dkim_status: 'unknown', dmarc_status: 'unknown',
      verified_at: null, last_checked_at: null,
    }],
    profiles: [],
  });

  it('renders `unknown` as "Not checked", never as a failure', () => {
    render({ brands: [BRAND], selectedBrandId: 'b1', readiness: withDomain('unknown') });
    const cells = cellTexts();
    expect(cells).toContain('Not checked');
    expect(cells).not.toContain('Fail');
  });

  it('still renders a real failure as Fail', () => {
    // The inverse guard. Softening everything to "Not checked" would be the same collapse
    // pointing the other way, and would hide a genuinely broken SPF record.
    render({ brands: [BRAND], selectedBrandId: 'b1', readiness: withDomain('fail') });
    expect(cellTexts()).toContain('Fail');
  });

  it('renders a pass as Pass', () => {
    render({ brands: [BRAND], selectedBrandId: 'b1', readiness: withDomain('pass') });
    const cells = cellTexts();
    expect(cells).toContain('Pass');
    // The other two checks are still unknown, so all three states appear at once - the
    // realistic case, and proof they render independently rather than from one overall verdict.
    expect(cells).toContain('Not checked');
  });

  it('says "Not checked" rather than a date when a domain has never been checked', () => {
    const text = render({ brands: [BRAND], selectedBrandId: 'b1', readiness: withDomain('unknown') });
    expect(text).not.toMatch(/Invalid Date/);
  });
});

describe('every failed preflight check is listed', () => {
  it('shows all failures, not just the first', () => {
    // Fixing one deliverability problem at a time and re-running is how a half-hour task
    // becomes a week. The backend already returns every failure; the panel must show them.
    const readiness: BrandSendReadiness = {
      brand: BRAND,
      domains: [],
      profiles: [{
        profile: { id: 'p1', name: 'Campaigns', from_email: 'hello@colaberry.ai', from_name: 'Colaberry' },
        preflight: {
          ok: false,
          failures: ['domain not verified', 'spf missing', 'dmarc missing'],
          checks: {
            profileActive: true, domainVerified: false, spf: false, dkim: true,
            dmarc: false, unsubscribeUrl: true, physicalAddress: true,
          },
        },
      }],
    };
    const text = render({ brands: [BRAND], selectedBrandId: 'b1', readiness });
    expect(text).toMatch(/domain not verified/);
    expect(text).toMatch(/spf missing/);
    expect(text).toMatch(/dmarc missing/);
    expect(text).toMatch(/Not ready/);
  });
});
