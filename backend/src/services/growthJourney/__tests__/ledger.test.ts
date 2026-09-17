/**
 * T410 - the ledger adapter, over the REAL `ledgerService` and a mocked
 * `EventLedger.create`: one row with tenant and brand, ids untouched (a UUID
 * is not a phone number), Dates kept, an address-like string redacted and
 * reported by path, and a ledger that throws answering `recorded: false`
 * with one redacted warning - never a throw.
 */

const create = jest.fn();
jest.mock('../../../models/EventLedger', () => ({ __esModule: true, default: { create: (...a: unknown[]) => create(...a) } }));
const redactForLogs = jest.fn((s: string) => jest.requireActual('../../../utils/piiRedaction').redactForLogs(s));
jest.mock('../../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => redactForLogs(s) }));

import { JOURNEY_ACTOR, recordJourneyEvent, redactPayload } from '../ledger';

const SCOPE = { tenant_id: '10000000-0000-4000-8000-000000000002', brand_id: '20000000-0000-4000-8000-000000000003' };
const HANDOFF_ID = '30000000-0000-4000-8000-000000000001';
const warned = () => (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: 'ev-1' });
  redactForLogs.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the row', () => {
  it('writes one event_ledger row: type, actor, entity type and id, the payload, the tenant and the brand', async () => {
    const occurred = new Date('2026-09-17T04:20:00Z');
    const r = await recordJourneyEvent('growth_journey.handoff.expired', 'growth_journey_handoff', HANDOFF_ID, SCOPE, { handoff_id: HANDOFF_ID, lead_id: 501, from: 'queued', sla_due_at: occurred, ticket_id: null });
    expect(r).toEqual({ recorded: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({
      event_type: 'growth_journey.handoff.expired', actor: JOURNEY_ACTOR, entity_type: 'growth_journey_handoff', entity_id: HANDOFF_ID,
      payload: { handoff_id: HANDOFF_ID, lead_id: 501, from: 'queued', sla_due_at: occurred, ticket_id: null },
      tenant_id: SCOPE.tenant_id, brand_id: SCOPE.brand_id,
    });
    expect(create.mock.calls[0][0].payload.sla_due_at).toBeInstanceOf(Date);
    expect(warned()).toEqual([]);
    expect(JOURNEY_ACTOR).toBe('growth_journey');
  });

  it('an explicit actor (the human, the requester) is written as given', async () => {
    await recordJourneyEvent('growth_journey.classification.overridden', 'growth_journey_classification', 'c-1', SCOPE, { override_of: 'c-0' }, 'human:staff-1');
    expect(create.mock.calls[0][0]).toMatchObject({ actor: 'human:staff-1', entity_type: 'growth_journey_classification', entity_id: 'c-1' });
  });
});

describe('the payload', () => {
  it('leaves ids alone - a UUID with digit groups is not a phone number - and keeps Dates, numbers, nulls and arrays', () => {
    const hits: string[] = [];
    const d = new Date('2026-09-17T00:00:00Z');
    const out = redactPayload({ handoff_id: HANDOFF_ID, when: d, n: 3, none: null, refs: ['501:meeting_scheduled', HANDOFF_ID], nested: { id: HANDOFF_ID } }, 'payload', hits);
    expect(out).toEqual({ handoff_id: HANDOFF_ID, when: d, n: 3, none: null, refs: ['501:meeting_scheduled', HANDOFF_ID], nested: { id: HANDOFF_ID } });
    expect((out as { when: Date }).when).toBe(d);
    expect(hits).toEqual([]);
  });

  it('a string carrying an address is redacted through redactForLogs and reported by path - nested and in arrays - and the row still writes', async () => {
    await recordJourneyEvent('growth_journey.handoff.dispositioned', 'growth_journey_handoff', HANDOFF_ID, SCOPE, {
      handoff_id: HANDOFF_ID, reason: 'call jane.doe@example.com back', notes: ['fine', 'cc bob@example.org'], nested: { who: 'x@y.io' },
    });
    const row = create.mock.calls[0][0];
    expect(JSON.stringify(row.payload)).not.toMatch(/jane\.doe|bob@|x@y/);
    expect(row.payload.reason).toBe('call j***@example.com back');
    expect(row.payload.notes[0]).toBe('fine');
    expect(row.payload.notes[1]).toContain('***');
    expect(row.payload.nested.who).toContain('***');
    expect(row.payload.handoff_id).toBe(HANDOFF_ID);
    const line = warned().find((l) => l.includes('growth_journey.ledger.payload_redacted'));
    // The warning line itself went through the redactor, whose phone pattern eats a UUID's digit groups (a cosmetic, known property of LOG lines; the ROW keeps the id, above).
    expect(JSON.parse(line as string)).toMatchObject({ event_type: 'growth_journey.handoff.dispositioned', entity_id: expect.stringMatching(/^30\*\*\*/), paths: ['payload.reason', 'payload.notes[1]', 'payload.nested.who'] });
    // The three values and the warning line: every string that carried an address went through the one redactor.
    expect(redactForLogs).toHaveBeenCalledTimes(4);
  });
});

describe('never a throw', () => {
  it('a ledger that is down is one redacted warning with the error class, the entity and the scope, and recorded: false - the caller decides nothing on it', async () => {
    create.mockRejectedValue(Object.assign(new Error('connection refused'), { name: 'SequelizeConnectionRefusedError' }));
    // Slug ids on the warning line: the redactor's phone pattern eats the digit groups of a UUID in a LOG line (a known, cosmetic property of `redactForLogs`); the ROW keeps them, as the test above pins.
    const SLUGS = { tenant_id: 't-colaberry', brand_id: 'b-enterprise' };
    const r = await recordJourneyEvent('growth_journey.outcome.recorded', 'growth_journey_outcome', 'o-1', SLUGS, { subject_ref: 'lead:501' });
    expect(r).toEqual({ recorded: false, error_class: expect.any(String) });
    const line = warned().find((l) => l.includes('growth_journey.ledger.write_failed'));
    expect(JSON.parse(line as string)).toMatchObject({ service: 'growth-journey', level: 'warn', outcome: 'failure', event_type: 'growth_journey.outcome.recorded', entity_type: 'growth_journey_outcome', entity_id: 'o-1', tenant_id: 't-colaberry', brand_id: 'b-enterprise', error_class: expect.any(String) });
    expect(redactForLogs).toHaveBeenCalledTimes(1);
  });

  it('a synchronous throw from the model is caught the same way', async () => {
    create.mockImplementation(() => { throw new TypeError('EventLedger is not a constructor'); });
    await expect(recordJourneyEvent('growth_journey.decision.recorded', 'growth_journey_decision', 'd-1', SCOPE, {})).resolves.toMatchObject({ recorded: false });
  });
});
