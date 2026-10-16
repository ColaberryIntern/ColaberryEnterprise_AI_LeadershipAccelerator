import { pathToSection } from '../mgmtSectionGate';
import { roleCanAccessSection } from '../../services/access/mgmtRoles';

/**
 * Brand administration must be CLASSIFIED, not merely unguarded.
 *
 * `brandRoutes` mounts inside `adminRoutes`, which applies `mgmtSectionGate` before it. For a
 * scoped mgmt role that gate is deny-by-default: `pathToSection` returning null falls through
 * to a flat 403, with no row anywhere explaining the refusal. So a new admin surface that
 * forgets this file does not ship "ungated" — it ships broken for every scoped identity, and
 * broken in the least diagnosable way.
 *
 * That is not hypothetical here. The gate's own source carries two separate comments recording
 * it happening: the explorer-growth row ("an UNMAPPED path is a latent 403") and the
 * case-studies row ("the receipt for learning that the expensive way"). This suite is the
 * brand surface's receipt, written at the same time as the routes rather than after someone
 * hit it.
 *
 * ## It IS its own section key now, as of 2026-10-16
 *
 * This header used to argue the opposite, and the argument was a good one: "minting a new key
 * would mean every scoped role that legitimately reaches campaign tooling loses this surface
 * until each role definition is edited - a permissions change disguised as a routing change."
 *
 * That objection names a CONDITION rather than forbidding the split, and the condition is now
 * met. `owner` and `admin` derive their sections from ALL_SECTIONS and picked `brands` up
 * automatically; `marketing` lists it explicitly in the same change. No role lost the surface,
 * and there is a test below asserting that rather than asking anyone to trust this paragraph.
 *
 * What changed is the readership, not the routing. A brand here is a website the platform
 * publishes to, and the Agent Factory gave those websites a second owner: the product-experience
 * intern, whose job is checking them and who has no business in the campaign tooling that used
 * to come attached. The alternative was handing her the whole `marketing` role, which is the
 * over-grant AF2.3 exists to prevent.
 */

const BRAND_ENDPOINTS = [
  '/api/admin/brands',
  '/api/admin/brands/c0000000-0000-4000-8000-000000000003',
  '/api/admin/brands/c0000000-0000-4000-8000-000000000003/send-readiness',
  '/api/admin/brands/c0000000-0000-4000-8000-000000000003/sender-profiles',
];

describe('mgmtSectionGate classifies the brand admin surface', () => {
  it('maps every brand endpoint to the brands section', () => {
    for (const path of BRAND_ENDPOINTS) {
      expect(pathToSection(path)).toBe('brands');
    }
  });

  it('is a DIFFERENT section from the marketing surface around it', () => {
    // These deliberately diverge as of 2026-10-16, which is the whole point of the split: brand
    // admin has a reader who is not a marketer, and campaign tooling has readers who do not
    // check websites.
    expect(pathToSection('/api/admin/brands')).not.toBe(pathToSection('/api/admin/marketing'));
    expect(pathToSection('/api/admin/marketing')).toBe('campaigns');
  });

  it('did not take brands away from anyone who already had it', () => {
    // The precise objection this file used to raise against splitting the key. Asserted rather
    // than promised, because "we edited the roles too" is exactly the kind of claim that is true
    // on the day it is written and false a month later.
    for (const role of ['owner', 'admin', 'marketing']) {
      expect(roleCanAccessSection(role, 'brands')).toBe(true);
    }
  });

  it('gives product_experience brands and NOT the campaign tooling around it', () => {
    // The reason the split happened. If this role ever reaches `campaigns`, the split bought
    // nothing and Mihret has Sarbjit's domain after all.
    expect(roleCanAccessSection('product_experience', 'brands')).toBe(true);
    for (const section of ['campaigns', 'inbox_content', 'revenue', 'program']) {
      expect(roleCanAccessSection('product_experience', section)).toBe(false);
    }
  });

  it('classifies an unknown sub-path rather than leaving it to fall off the map', () => {
    // Detail and action routes added later inherit the prefix. This is the property that
    // makes the row durable instead of a list to maintain per endpoint.
    expect(pathToSection('/api/admin/brands/anything/deeper/still')).toBe('brands');
  });

  it('maps the marketing content composer to campaigns, without swallowing content-queue', () => {
    expect(pathToSection('/api/admin/content')).toBe('campaigns');
    expect(pathToSection('/api/admin/content/abc/variants/generate')).toBe('campaigns');
    // A different surface that shares the prefix string but not the path boundary.
    expect(pathToSection('/api/admin/content-queue')).toBe('inbox_content');
  });

  it('maps the publishing queue and receipts to campaigns', () => {
    expect(pathToSection('/api/admin/publishing')).toBe('campaigns');
    expect(pathToSection('/api/admin/publishing/jobs/abc/retry')).toBe('campaigns');
    expect(pathToSection('/api/admin/publishing/publications/abc/handoff-complete')).toBe('campaigns');
  });

  it('does not accidentally classify a DIFFERENT surface that merely starts similarly', () => {
    // Guards against a prefix rule that is too greedy. `/api/admin/brand-safety` is not a
    // brand-admin route and must not inherit its section by string accident.
    expect(pathToSection('/api/admin/brand-safety')).not.toBe('brands');
  });
});
