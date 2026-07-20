import { refundPayment, voidPayment, getPayment, isVoidable, isSettled } from '../paysimpleService';

// Lock the exact PaySimple endpoints — a wrong path is what broke the first
// refund attempt (POST /refund → PaySimple "Route does not exist"). The real
// refund is PUT /v4/payment/{id}/reverse; void is PUT /v4/payment/{id}/void.
jest.mock('../../config/env', () => ({ env: { paysimpleApiUser: 'u', paysimpleApiKey: 'k', paysimpleEnv: 'live', paymentMode: 'live' } }));

describe('paysimpleService payment reversal endpoints', () => {
  const calls: Array<{ url: string; method: string }> = [];
  beforeEach(() => {
    calls.length = 0;
    (global as any).fetch = jest.fn(async (url: string, opts: any) => {
      calls.push({ url, method: opts.method });
      return { ok: true, json: async () => ({ Response: { Id: 1 } }) } as any;
    });
  });

  it('refundPayment reverses via PUT /v4/payment/{id}/reverse', async () => {
    await refundPayment('154860344');
    expect(calls[0]).toEqual({ url: 'https://api.paysimple.com/v4/payment/154860344/reverse', method: 'PUT' });
  });

  it('voidPayment voids via PUT /v4/payment/{id}/void', async () => {
    await voidPayment('154860344');
    expect(calls[0]).toEqual({ url: 'https://api.paysimple.com/v4/payment/154860344/void', method: 'PUT' });
  });

  it('getPayment reads GET /v4/payment/{id}', async () => {
    await getPayment('154860344');
    expect(calls[0]).toEqual({ url: 'https://api.paysimple.com/v4/payment/154860344', method: 'GET' });
  });

  it('isVoidable / isSettled reflect the payment state', () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(isVoidable({ CanVoidUntil: future })).toBe(true);
    expect(isVoidable({ CanVoidUntil: '2020-01-01T00:00:00Z' })).toBe(false);
    expect(isVoidable({ CanVoidUntil: null })).toBe(false);
    expect(isSettled({ ActualSettledDate: '2026-07-20T00:00:00Z', Status: 'Settled' })).toBe(true);
    expect(isSettled({ ActualSettledDate: null, Status: 'Posted' })).toBe(false);
  });
});
