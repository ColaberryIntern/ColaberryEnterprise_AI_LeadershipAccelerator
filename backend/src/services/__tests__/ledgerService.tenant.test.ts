const create = jest.fn(async (row: Record<string, unknown>) => row);

jest.mock('../../models/EventLedger', () => ({
  __esModule: true,
  default: { create: (...a: unknown[]) => create(...(a as [Record<string, unknown>])) },
}));

import { logEvent, type LedgerScope } from '../ledgerService';

/**
 * T401: `logEvent` takes an optional sixth argument, the ecosystem scope.
 *
 * `event_ledger.tenant_id` / `brand_id` have existed, nullable and unwritten,
 * since the multi-tenant DDL added them. The Phase 4 events (classification,
 * override, transition, decision, handoff, disposition, outcome) are the first
 * to carry them. The property that matters is on the OTHER side: every one of
 * the existing five-argument callers still writes exactly what it wrote before
 * — NULL in both columns — so no existing ledger row changes meaning.
 */

beforeEach(() => create.mockClear());

describe('logEvent with a scope', () => {
  it('writes tenant_id and brand_id onto the row', async () => {
    const scope: LedgerScope = { tenant_id: 'tenant-1', brand_id: 'brand-1' };
    await logEvent('growth_journey.handoff.created', 'system', 'growth_journey_handoff', 'h-1', { handoff_id: 'h-1' }, scope);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({
      event_type: 'growth_journey.handoff.created',
      actor: 'system',
      entity_type: 'growth_journey_handoff',
      entity_id: 'h-1',
      payload: { handoff_id: 'h-1' },
      tenant_id: 'tenant-1',
      brand_id: 'brand-1',
    });
  });

  it('a partial scope writes the half it has and NULL for the other', async () => {
    await logEvent('e', 'a', 't', 'i', null, { brand_id: 'brand-1' });
    expect(create.mock.calls[0][0]).toMatchObject({ tenant_id: null, brand_id: 'brand-1' });
  });
});

describe('logEvent without a scope — every existing caller', () => {
  it('the five-argument call writes NULL in both columns, exactly as before', async () => {
    await logEvent('lead.created', 'admin:1', 'lead', '42', { source: 'form' });
    expect(create.mock.calls[0][0]).toEqual({
      event_type: 'lead.created',
      actor: 'admin:1',
      entity_type: 'lead',
      entity_id: '42',
      payload: { source: 'form' },
      tenant_id: null,
      brand_id: null,
    });
  });

  it('the four-argument call (no payload) still writes payload NULL and no scope', async () => {
    await logEvent('e', 'a', 't', 'i');
    expect(create.mock.calls[0][0]).toMatchObject({ payload: null, tenant_id: null, brand_id: null });
  });

  it('an empty scope object is the same as no scope', async () => {
    await logEvent('e', 'a', 't', 'i', undefined, {});
    expect(create.mock.calls[0][0]).toMatchObject({ tenant_id: null, brand_id: null });
  });
});
