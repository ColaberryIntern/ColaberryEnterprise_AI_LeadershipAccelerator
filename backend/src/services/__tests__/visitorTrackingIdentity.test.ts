const visitorUpdate = jest.fn();
const visitorFindByPk = jest.fn();
const leadUpdate = jest.fn();
const sessionUpdate = jest.fn();
const pageEventUpdate = jest.fn();
const activityCreate = jest.fn();
const ledgerCreate = jest.fn();

jest.mock('../../models', () => ({
  Visitor: { findByPk: (...a: unknown[]) => visitorFindByPk(...a) },
  VisitorSession: { update: (...a: unknown[]) => sessionUpdate(...a) },
  PageEvent: { update: (...a: unknown[]) => pageEventUpdate(...a) },
  Lead: { update: (...a: unknown[]) => leadUpdate(...a) },
  Activity: { create: (...a: unknown[]) => activityCreate(...a) },
  EventLedger: { create: (...a: unknown[]) => ledgerCreate(...a) },
}));

import { Op } from 'sequelize';

const VISITOR_ID = '11111111-1111-4111-8111-111111111111';
const LEAD_ID = 4242;

function stubVisitor() {
  visitorFindByPk.mockResolvedValue({
    update: visitorUpdate,
    total_sessions: 3,
    total_pageviews: 9,
    fingerprint: 'fp-abc',
  });
}

async function callResolveIdentity() {
  const mod = await import('../visitorTrackingService');
  return mod.resolveIdentity(VISITOR_ID, LEAD_ID);
}

beforeEach(() => {
  [
    visitorUpdate,
    visitorFindByPk,
    leadUpdate,
    sessionUpdate,
    pageEventUpdate,
    activityCreate,
    ledgerCreate,
  ].forEach((m) => m.mockReset());
  [visitorUpdate, leadUpdate, sessionUpdate, pageEventUpdate, activityCreate, ledgerCreate].forEach(
    (m) => m.mockResolvedValue(undefined),
  );
  stubVisitor();
});

describe('resolveIdentity — page_events backfill (D1)', () => {
  it('backfills page_events.lead_id for the identified visitor', async () => {
    await callResolveIdentity();

    expect(pageEventUpdate).toHaveBeenCalledTimes(1);
    const [values, options] = pageEventUpdate.mock.calls[0];
    expect(values).toEqual({ lead_id: LEAD_ID });
    expect(options.where.visitor_id).toBe(VISITOR_ID);
  });

  it('only touches rows whose lead_id is still null', async () => {
    // Without this predicate a later identification of the same browser would
    // silently reassign historical events to a different lead.
    await callResolveIdentity();
    const [, options] = pageEventUpdate.mock.calls[0];
    expect(options.where.lead_id).toEqual({ [Op.is]: null });
  });

  it('leaves the existing visitor_sessions backfill intact', async () => {
    await callResolveIdentity();
    expect(sessionUpdate).toHaveBeenCalledTimes(1);
    const [values, options] = sessionUpdate.mock.calls[0];
    expect(values).toEqual({ lead_id: LEAD_ID });
    expect(options.where.visitor_id).toBe(VISITOR_ID);
  });
});

describe('resolveIdentity — the backfill must never break identity resolution', () => {
  it('still links visitor and lead, logs Activity and EventLedger when the page_events update throws', async () => {
    pageEventUpdate.mockRejectedValue(new Error('deadlock detected'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    // The caller's real job is identity resolution. An analytics backfill
    // failing must not cost us the identity link.
    await expect(callResolveIdentity()).resolves.toBeUndefined();

    expect(visitorUpdate).toHaveBeenCalledWith({ lead_id: LEAD_ID });
    expect(leadUpdate).toHaveBeenCalledTimes(1);
    expect(activityCreate).toHaveBeenCalledTimes(1);
    expect(ledgerCreate).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[VisitorTracking] page_events lead_id backfill failed (non-fatal):',
      'deadlock detected',
    );
    warn.mockRestore();
  });

  it('returns early without touching anything when the visitor is unknown', async () => {
    visitorFindByPk.mockResolvedValue(null);
    await expect(callResolveIdentity()).resolves.toBeUndefined();
    expect(pageEventUpdate).not.toHaveBeenCalled();
    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});
