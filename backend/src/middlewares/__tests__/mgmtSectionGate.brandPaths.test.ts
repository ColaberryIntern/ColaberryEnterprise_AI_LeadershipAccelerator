import { pathToSection } from '../mgmtSectionGate';

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
 * Why 'campaigns' and not a new section key: brand admin governs the sending identity behind
 * campaigns and communications, and both of those are already 'campaigns'. Minting a new key
 * would mean every scoped role that legitimately reaches campaign tooling loses this surface
 * until each role definition is edited — a permissions change disguised as a routing change.
 */

const BRAND_ENDPOINTS = [
  '/api/admin/brands',
  '/api/admin/brands/c0000000-0000-4000-8000-000000000003',
  '/api/admin/brands/c0000000-0000-4000-8000-000000000003/send-readiness',
  '/api/admin/brands/c0000000-0000-4000-8000-000000000003/sender-profiles',
];

describe('mgmtSectionGate classifies the brand admin surface', () => {
  it('maps every brand endpoint to the campaigns section', () => {
    for (const path of BRAND_ENDPOINTS) {
      expect(pathToSection(path)).toBe('campaigns');
    }
  });

  it('agrees with the marketing surface it belongs to', () => {
    // If these ever diverge, an operator can reach the campaign that sends from a brand but
    // not the brand itself, which reads as a bug in the page rather than a policy decision.
    expect(pathToSection('/api/admin/brands')).toBe(pathToSection('/api/admin/marketing'));
  });

  it('classifies an unknown sub-path rather than leaving it to fall off the map', () => {
    // Detail and action routes added later inherit the prefix. This is the property that
    // makes the row durable instead of a list to maintain per endpoint.
    expect(pathToSection('/api/admin/brands/anything/deeper/still')).toBe('campaigns');
  });

  it('does not accidentally classify a DIFFERENT surface that merely starts similarly', () => {
    // Guards against a prefix rule that is too greedy. `/api/admin/brand-safety` is not a
    // brand-admin route and must not inherit its section by string accident.
    expect(pathToSection('/api/admin/brand-safety')).not.toBe('campaigns');
  });
});
