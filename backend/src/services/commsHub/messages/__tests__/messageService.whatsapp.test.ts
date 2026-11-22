/**
 * CH10.3 WhatsApp groups as recipients: offered only while WhatsApp is switched on and only for groups
 * Jackie switched on that the number can post in; setDestinations refuses everything else in words.
 */
type Row = Record<string, any>;
const messages = new Map<string, Row>();
let dests: Row[] = [];
const groups = new Map<string, Row>();
const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
const G3 = '33333333-3333-4333-8333-333333333333';

jest.mock('../../../../config/database', () => ({ sequelize: { transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({ LOCK: { UPDATE: 'UPDATE' } })) } }));
jest.mock('../../../../models/CommsHubMessage', () => ({ __esModule: true, default: { findByPk: jest.fn(async (id: string) => messages.get(id) ?? null) } }));
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => null) } }));
jest.mock('../../../../models/CommsHubDraft', () => ({ __esModule: true, default: { findAll: jest.fn(async () => []) } }));
jest.mock('../../../../models/CommsHubDestination', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => dests),
    destroy: jest.fn(async ({ where }: Row) => { dests = dests.filter((d) => !where.id.includes(d.id)); }),
    create: jest.fn(async (r: Row) => { const d = { id: `d${dests.length + 10}`, ...r }; dests.push(d); return d; }),
  },
}));
jest.mock('../../../../models/CommsHubApproval', () => ({ __esModule: true, default: { findOne: jest.fn(async () => null) } }));
jest.mock('../../../../models/CommsHubDelivery', () => ({ __esModule: true, default: { findAll: jest.fn(async () => []) } }));
jest.mock('../../../../models/Cohort', () => ({ __esModule: true, default: { findAll: jest.fn(async () => []), findByPk: jest.fn(async () => null) } }));
jest.mock('../../../../models/CommsHubSettings', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => ({ id: 1, test_cohort_id: null })) } }));
jest.mock('../../../../models/CommsHubWhatsAppGroup', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(async (id: string) => groups.get(id) ?? null),
    findAll: jest.fn(async ({ where }: Row) => [...groups.values()].filter((g) => g.enabled === where.enabled && g.left_at === null)),
  },
}));
jest.mock('../../activityLog', () => ({ logActivity: jest.fn(async () => undefined) }));
const reconciled: string[] = [];
jest.mock('../approvals', () => {
  const actual = jest.requireActual('../approvals');
  return { MessageRuleError: actual.MessageRuleError, approveMessage: jest.fn(), submitForApproval: jest.fn(), scheduleMessage: jest.fn(), reconcileApproval: jest.fn(async (_id: string, reason: string) => { reconciled.push(reason); return true; }) };
});
jest.mock('../drafting', () => ({ recommendDestinations: jest.fn(async () => []) }));

import { destinationOptions, setDestinations } from '../messageService';

const JACKIE = { id: 'jackie-1', label: 'Jackie' };
const ENV = { ...process.env };
const on = (): void => { process.env.COMMS_HUB_WHATSAPP_ENABLED = 'true'; process.env.WHAPI_TOKEN = 'tok_test'; };
const group = (id: string, o: Row = {}): Row => ({ id, name: 'Comms Hub test group', enabled: true, left_at: null, suspended: false, terminated: false, announcements: false, our_rank: 'member', cant_send_reason: null, ...o });
const wa = (id: string) => ({ channel: 'whatsapp' as const, target_type: 'whatsapp_group' as const, target_id: id, label: 'WhatsApp: x' });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e) => ({ status: e.status, reason: e.reason, message: e.message }));

beforeEach(() => {
  messages.clear(); dests = []; groups.clear(); reconciled.length = 0;
  delete process.env.COMMS_HUB_WHATSAPP_ENABLED; delete process.env.WHAPI_TOKEN;
  messages.set('m1', { id: 'm1', status: 'draft', event_id: null });
  groups.set(G1, group(G1));
  groups.set(G2, group(G2, { name: 'Announcements only', announcements: true }));
  groups.set(G3, group(G3, { name: 'Switched off', enabled: false }));
});
afterAll(() => { process.env = ENV; });

describe('destinationOptions', () => {
  it('offers no WhatsApp group while WhatsApp is switched off', async () => {
    expect((await destinationOptions()).some((o) => o.channel === 'whatsapp')).toBe(false);
  });
  it('with WhatsApp on: only switched-on groups the number can post in, labelled', async () => {
    on();
    expect((await destinationOptions()).filter((o) => o.channel === 'whatsapp')).toEqual([{ ...wa(G1), label: 'Comms Hub test group' }]);
  });
});

describe('setDestinations', () => {
  it('adds a switched-on group when WhatsApp is on, and re-checks the approval', async () => {
    on();
    await setDestinations('m1', [wa(G1)], JACKIE);
    expect(dests.map((d) => [d.channel, d.target_type, d.target_id])).toEqual([['whatsapp', 'whatsapp_group', G1]]);
    expect(reconciled).toEqual(['destinations_changed']);
  });
  it('refuses a group while WhatsApp is off', async () => {
    expect(await refusal(setDestinations('m1', [wa(G1)], JACKIE))).toMatchObject({ status: 409, reason: 'whatsapp_off' });
  });
  it('refuses a group that is switched off, cannot be posted in, or is unknown; and a group by another channel', async () => {
    on();
    expect(await refusal(setDestinations('m1', [wa(G3)], JACKIE))).toMatchObject({ status: 409, reason: 'whatsapp_group_off', message: 'WhatsApp sending to Switched off is not switched on, so it cannot be chosen.' });
    expect(await refusal(setDestinations('m1', [wa(G2)], JACKIE))).toMatchObject({ status: 409, reason: 'whatsapp_group_off' });
    expect(await refusal(setDestinations('m1', [wa('44444444-4444-4444-8444-444444444444')], JACKIE))).toMatchObject({ status: 400, reason: 'bad_destination' });
    expect(await refusal(setDestinations('m1', [wa('not-a-uuid')], JACKIE))).toMatchObject({ status: 400, reason: 'bad_destination' });
    expect(await refusal(setDestinations('m1', [{ ...wa(G1), channel: 'in_app' as never }], JACKIE))).toMatchObject({ status: 400, reason: 'bad_destination' });
    expect(await refusal(setDestinations('m1', [{ ...wa(G1), target_type: 'cohort_feed' as never }], JACKIE))).toMatchObject({ status: 400, reason: 'bad_destination' });
    expect(dests).toEqual([]);
  });
  it('a group already on the message stays, even if it was switched off since (its history is kept); a new one is still checked', async () => {
    on();
    await setDestinations('m1', [wa(G1)], JACKIE);
    groups.get(G1)!.enabled = false;
    await expect(setDestinations('m1', [wa(G1)], JACKIE)).resolves.toBeUndefined();
    expect(await refusal(setDestinations('m1', [wa(G1), wa(G3)], JACKIE))).toMatchObject({ reason: 'whatsapp_group_off' });
  });
});
