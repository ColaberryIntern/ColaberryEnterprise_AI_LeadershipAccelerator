/**
 * The daily billing watch runs the decline reconcile first, so a decline PaySimple
 * never delivered as a webhook shows up in that morning's report as past_due.
 * A reconcile failure must not cost the rest of the watch.
 */
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: jest.fn() } }));
jest.mock('../billingHealthCheck', () => ({ runBillingHealthCheck: jest.fn() }));
jest.mock('../billingGatewayState', () => ({ getPaySimpleGatewayState: jest.fn() }));
jest.mock('../declinedChargeReconcile', () => ({ reconcileDeclinedScheduledCharges: jest.fn() }));

import { runBillingHealthCheck } from '../billingHealthCheck';
import { getPaySimpleGatewayState } from '../billingGatewayState';
import { reconcileDeclinedScheduledCharges } from '../declinedChargeReconcile';
import { runBillingWatch } from '../billingHealthReport';

const check = runBillingHealthCheck as jest.Mock;
const gateway = getPaySimpleGatewayState as jest.Mock;
const reconcile = reconcileDeclinedScheduledCharges as jest.Mock;
const order: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  gateway.mockImplementation(async () => { order.push('gateway'); return {}; });
  check.mockImplementation(async () => { order.push('check'); return { findings: [], milestones: [], needsAttention: false, checkedAt: 'now' }; });
  reconcile.mockImplementation(async () => { order.push('reconcile'); return { execute: true, since: 'x', rows: [] }; });
});
afterEach(() => jest.restoreAllMocks());

describe('runBillingWatch decline reconcile', () => {
  it('reconciles, for real, before reading the book when asked', async () => {
    await runBillingWatch({ reconcile: true });
    expect(reconcile).toHaveBeenCalledWith({ execute: true });
    expect(order).toEqual(['reconcile', 'gateway', 'check']);
  });

  it('does not reconcile unless asked, so a manual dry watch writes nothing', async () => {
    await runBillingWatch({});
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('a reconcile failure is logged and the checks still run', async () => {
    reconcile.mockRejectedValue(new Error('PaySimple down'));
    const r = await runBillingWatch({ reconcile: true });
    expect(check).toHaveBeenCalled();
    expect(r.needsAttention).toBe(false);
    expect((console.error as jest.Mock).mock.calls.join(' ')).toContain('decline_reconcile_failed');
  });
});
