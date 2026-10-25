/**
 * C21 (v6 D3): the Admissions building's plans and services, pure.
 *  - four cards; every figure comes from a claim key (none typed), and the Explorer card has no figure ("No card needed");
 *  - the month-to-month claim is on no card (annual first, Ali 2026-10-24);
 *  - each card's one action and the service rows depend on who is looking and whether they are subscribed;
 *  - every action reuses an existing flow (Settings tabs, the enroll and sponsorship pages, the booking sheet).
 */
import { PLAN_CARDS, cardAction, serviceRows } from '../admissions/plansModel';
import { publicClaim } from '../../../config/claimsRegistry';

const member = { audience: 'member' as const, subscribed: false };

it('four cards, priced only through claim keys; no month-to-month; the Explorer card carries no figure', () => {
  expect(PLAN_CARDS.map((c) => c.id)).toEqual(['explorer', 'individual', 'team', 'services']);
  for (const c of PLAN_CARDS) {
    expect(`${c.name} ${c.priceText ?? ''} ${c.unit} ${c.subText ?? ''} ${c.blurb}`).not.toMatch(/\$\d/);
    expect(`${c.name} ${c.priceText ?? ''} ${c.blurb}`).not.toMatch(/\bfree\b/i);
  }
  expect(PLAN_CARDS.map((c) => c.priceClaim)).toEqual([null, 'pricing.individual.annual', 'pricing.team', 'pricing.services']);
  expect(PLAN_CARDS.some((c) => c.priceClaim === 'pricing.individual.monthly' || c.subClaim === 'pricing.individual.monthly')).toBe(false);
  expect(PLAN_CARDS.find((c) => c.featured)?.id).toBe('individual');
});

it('the prices the cards name are approved for the plans page and the campus', () => {
  for (const route of ['/portal/plans', '/portal/campus']) {
    expect(publicClaim('pricing.individual.annual', route)).toBe('$149');
    expect(publicClaim('pricing.team', route)).toBe('$1,200');
    expect(publicClaim('pricing.department', route)).toBe('$950 at department scale');
    expect(publicClaim('pricing.services', route)).toBe('Scoped on a call');
    expect(publicClaim('pricing.individual.monthly', route)).toBeNull();
  }
});

it("each card's one action follows the viewer", () => {
  expect(cardAction('explorer', { audience: 'explorer', subscribed: false })).toEqual({ kind: 'current', label: 'Your current tier' });
  expect(cardAction('explorer', member)).toBeNull();
  expect(cardAction('individual', member)).toEqual({ kind: 'link', label: 'Activate', to: '/portal/settings?tab=subscription' });
  expect(cardAction('individual', { ...member, subscribed: true })).toEqual({ kind: 'current', label: 'Your current tier' });
  expect(cardAction('individual', { audience: 'staff', subscribed: false })).toBeNull();
  expect(cardAction('team', { audience: 'business', subscribed: false })).toMatchObject({ label: 'Activate seats', to: '/portal/settings?tab=team' });
  expect(cardAction('team', member)).toMatchObject({ label: 'Activate seats', to: '/sponsorship', external: true });
  expect(cardAction('services', { audience: 'staff', subscribed: false })).toEqual({ kind: 'book', label: '📅 Book a call' });
});

it('service rows: only those that apply, business seats first, staff only Services', () => {
  const ids = (a: Parameters<typeof serviceRows>[0]) => serviceRows(a).map((r) => r.id);
  expect(ids(member)).toEqual(['individual', 'redeem', 'billing', 'services']);
  expect(ids({ ...member, subscribed: true })).toEqual(['individual', 'billing', 'services']);
  expect(serviceRows({ ...member, subscribed: true })[0].action).toEqual({ kind: 'current', label: '✓ Active' });
  expect(ids({ audience: 'explorer', subscribed: false })).toEqual(['individual', 'redeem', 'services']);
  expect(ids({ audience: 'business', subscribed: false })).toEqual(['team', 'services']);
  expect(ids({ audience: 'staff', subscribed: false })).toEqual(['services']);
});
