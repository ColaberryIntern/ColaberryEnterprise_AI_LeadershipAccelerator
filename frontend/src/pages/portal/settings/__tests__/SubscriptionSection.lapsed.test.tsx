/**
 * A membership that ran out must offer a way back in.
 *
 * ── THE DEFECT THESE TESTS PIN ───────────────────────────────────────────────
 *
 * The section had exactly two states: `active`, which shows the plan and a
 * Cancel button, and `canceled`, which shows Resubscribe. Nothing handled the
 * state members actually end up in, which is a row still marked `active` whose
 * `current_period_end` has already passed.
 *
 * So a lapsed member saw the ACTIVE screen, with an "Access through" date in
 * the past, and their only available action was to cancel. Meanwhile the
 * renewal reminder cron correctly classified them as lapsed and mailed them
 * asking for payment. Two halves of the product disagreeing about one row, with
 * the member stuck in the middle: chased for money and given no way to pay it.
 *
 * Found on 2026-08-31 because a member wrote in twice. Her first note asked
 * whether payment had failed; the reply told her to renew in the portal; her
 * second said "The renewal option doesnt exist. Where can i find it?" She was
 * right both times. A query at that moment found 19 members in the same state.
 *
 * ── WHAT EACH TEST WOULD CATCH IF IT REGRESSED ───────────────────────────────
 *
 *   1  the lapsed member is offered a renewal at all - the shipped defect.
 *   2  they are NOT shown Cancel, which was the only button they used to get.
 *   3  a genuinely active member is untouched and still sees Cancel. Breaking
 *      this would be worse than the original bug, since it would push paying
 *      members toward a renewal they do not owe.
 *   4  the boundary is the period end, not the status string, so a row that
 *      expires one second from now is still active.
 *   5  a `canceled` row keeps its own screen and does not get swallowed by the
 *      new branch.
 *
 * Uses the `createRoot` + `act` pattern already proven in this package (see
 * projects/__tests__/AcceptanceChecklist.honesty.test.tsx). There is no
 * @testing-library in this workspace and adding one for a test would be a
 * drive-by install.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const HOUR = 3600 * 1000;
let mockView: any = null;

jest.mock('../../../../services/subscriptionApi', () => ({
  __esModule: true,
  fetchSubscription: () => Promise.resolve(mockView),
  startSubscriptionCheckout: () => Promise.resolve({ url: 'https://example.test/checkout' }),
  cancelSubscription: () => Promise.resolve({ access_until: null }),
  confirmSubscriptionCheckout: () => Promise.resolve(null),
}));
jest.mock('../../../../services/portalEnrollmentApi', () => ({
  __esModule: true,
  formatClassDate: (d: string) => d,
}));
jest.mock('../../../../utils/tracker', () => ({
  __esModule: true,
  trackEvent: () => { /* no-op */ },
}));
jest.mock('../../../../utils/oncePerSession', () => ({
  __esModule: true,
  markOncePerSession: () => true,
}));

// Imported after the mocks so the component picks them up.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SubscriptionSection = require('../SubscriptionSection').default;

function subscription(overrides: Record<string, unknown>) {
  return {
    status: 'active',
    plan: 'monthly',
    amount_cents: 19900,
    current_period_end: new Date(Date.now() - 8 * 24 * HOUR).toISOString(),
    started_at: new Date(Date.now() - 40 * 24 * HOUR).toISOString(),
    next_payment: null,
    access_until: null,
    cancel_reason: null,
    ...overrides,
  };
}

async function render(view: any): Promise<{ html: string; cleanup: () => void }> {
  mockView = view;
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root;
  await act(async () => {
    root = createRoot(host);
    root.render(<SubscriptionSection />);
  });
  // Let the fetchSubscription promise settle into state.
  await act(async () => { await Promise.resolve(); });
  const html = host.innerHTML;
  return {
    html,
    cleanup: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

describe('a lapsed membership can be renewed', () => {
  it('offers a renewal when the period has already ended', async () => {
    const r = await render({ subscription: subscription({}) });
    expect(r.html).toMatch(/Renew membership/i);
    r.cleanup();
  });

  it('does NOT offer Cancel to someone who has already lapsed', async () => {
    const r = await render({ subscription: subscription({}) });
    // Cancel was the only action a lapsed member used to be given.
    expect(r.html).not.toMatch(/Cancel subscription/i);
    r.cleanup();
  });

  it('says plainly that the membership ended, rather than showing it as active', async () => {
    const r = await render({ subscription: subscription({}) });
    expect(r.html).toMatch(/Lapsed/);
    expect(r.html).not.toMatch(/●\s*Active/);
    r.cleanup();
  });
});

describe('members who are genuinely current are untouched', () => {
  it('a paying member still sees Cancel and is not pushed to renew', async () => {
    const r = await render({
      subscription: subscription({
        current_period_end: new Date(Date.now() + 20 * 24 * HOUR).toISOString(),
      }),
    });
    expect(r.html).toMatch(/Cancel subscription/i);
    expect(r.html).not.toMatch(/Renew membership/i);
    r.cleanup();
  });

  it('the boundary is the period end, so a row expiring in an hour is still active', async () => {
    const r = await render({
      subscription: subscription({
        current_period_end: new Date(Date.now() + HOUR).toISOString(),
      }),
    });
    expect(r.html).not.toMatch(/Renew membership/i);
    r.cleanup();
  });
});

describe('the canceled state keeps its own screen', () => {
  it('a canceled row still shows Resubscribe, not the lapsed branch', async () => {
    const r = await render({
      subscription: subscription({
        status: 'canceled',
        access_until: new Date(Date.now() + 5 * 24 * HOUR).toISOString(),
      }),
    });
    expect(r.html).toMatch(/Resubscribe/i);
    expect(r.html).not.toMatch(/Renew membership/i);
    r.cleanup();
  });
});
