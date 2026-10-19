import { pathToSection } from '../mgmtSectionGate';
import { roleCanAccessSection } from '../../services/access/mgmtRoles';

/**
 * The brand channel surface, classified after it refused everybody.
 *
 * FOUND LIVE, 19 Oct 2026, in an intern session with the whole cohort watching. The
 * product-experience intern opened Brands and the Channels tab answered "You do not have
 * access to this section." She holds `brands`, and the page itself rendered, so the refusal
 * came from inside it.
 *
 * `/api/admin/channel-accounts` was mapped NOWHERE. This gate is deny-by-default for a scoped
 * role, so an unmapped path falls through to a flat 403 with no row explaining it. The blast
 * radius was wider than the one person who hit it: EVERY scoped role was refused, including
 * `marketing`. Only a legacy full admin, who skips the gate entirely at
 * `if (!payload.mgmt_role) return next()`, could ever load that tab. It looked like it worked
 * because the only people who had opened it were the ones the gate does not apply to.
 *
 * ## The ordering here is load-bearing, not cosmetic
 *
 * `/api/admin/marketing/connectors` sat under the broad `['/api/admin/marketing', 'campaigns']`
 * row. `pathToSection` returns the FIRST match in array order, NOT the longest prefix, so a
 * narrower row placed after the broad one is never reached. The connectors row is therefore
 * inserted above it, and the test below fails if anyone moves it back.
 *
 * ## What is deliberately still 'campaigns'
 *
 * The OAuth endpoints. Reading a brand's configuration and granting something the right to
 * post as that brand are different decisions, and the second one was not made here.
 */

const CHANNEL_READS = [
  '/api/admin/channel-accounts',
  '/api/admin/channel-accounts/status',
  '/api/admin/channel-accounts/c0000000-0000-4000-8000-000000000003',
  '/api/admin/channel-accounts/c0000000-0000-4000-8000-000000000003/select',
  '/api/admin/marketing/connectors',
];

const STILL_CAMPAIGNS = [
  '/api/admin/marketing/connect/linkedin',
  '/api/admin/marketing/linkedin/status',
  '/api/admin/marketing/linkedin/connect',
];

describe('the brand channel surface is classified', () => {
  it.each(CHANNEL_READS)('%s maps to brands', (p) => {
    expect(pathToSection(p)).toBe('brands');
  });

  it('NONE of them is unmapped, which is the defect this closes', () => {
    // Stated separately from the mapping assertion because `null` is the exact value that
    // produced the live 403, and naming it makes the regression unmistakable.
    const unmapped = CHANNEL_READS.filter((p) => pathToSection(p) === null);
    expect(unmapped).toEqual([]);
  });
});

describe('the narrower row must stay ABOVE the broad marketing row', () => {
  it('connectors resolves to brands, not campaigns', () => {
    // This is the whole ordering guard. If the row is moved below
    // ['/api/admin/marketing', 'campaigns'] it silently becomes campaigns again and the
    // Channels tab breaks for a brands-only identity exactly as it did on 19 Oct.
    expect(pathToSection('/api/admin/marketing/connectors')).toBe('brands');
  });

  it('POSITIVE CONTROL: the broad marketing row still works for everything else', () => {
    // Without this, deleting the broad row entirely would also make the test above pass.
    expect(pathToSection('/api/admin/marketing')).toBe('campaigns');
    expect(pathToSection('/api/admin/marketing/drafts')).toBe('campaigns');
  });

  it.each(STILL_CAMPAIGNS)('%s is deliberately still campaigns', (p) => {
    expect(pathToSection(p)).toBe('campaigns');
  });
});

describe('who can actually reach it now', () => {
  it('product_experience can, which is the role that hit the 403', () => {
    expect(roleCanAccessSection('product_experience', 'brands')).toBe(true);
  });

  it('marketing can, so the role that always should have reached it is not left behind', () => {
    expect(roleCanAccessSection('marketing', 'brands')).toBe(true);
  });

  it('a role with no brands claim still cannot', () => {
    // The guard is still a guard. Lead intake has no business in brand channels.
    expect(roleCanAccessSection('lead_intake', 'brands')).toBe(false);
  });

  it('reaching channels does NOT hand anyone campaign tooling', () => {
    // The over-grant AF2.3 exists to prevent: brands must not drag campaigns along.
    expect(roleCanAccessSection('product_experience', 'campaigns')).toBe(false);
  });
});
