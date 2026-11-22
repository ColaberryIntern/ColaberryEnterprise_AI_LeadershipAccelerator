const mockFindByPk = jest.fn();
const mockFindAll = jest.fn();
jest.mock('../../../../models/CommsHubWhatsAppGroup', () => ({ __esModule: true, default: { findByPk: (...a: unknown[]) => mockFindByPk(...a), findAll: (...a: unknown[]) => mockFindAll(...a) } }));
const mockLog = jest.fn();
jest.mock('../../activityLog', () => ({ logActivity: (...a: unknown[]) => mockLog(...a) }));
jest.mock('../../../../config/database', () => ({ sequelize: { transaction: (fn: (t: unknown) => unknown) => fn({ LOCK: { UPDATE: 'UPDATE' } }), query: jest.fn() } }));

import {
  cantSendReason, fetchAllGroups, ourRank, setGroupEnabled, toView, listWhatsAppGroups, GroupNotFoundError, GroupNotSendableError, SYNC_MAX_PAGES,
} from '../whatsappGroups';
import { requireConnection, sameNumber } from '../whatsappConnection';
import { readWhatsAppConfig } from '../config';
import { UnavailableError, type ProviderGroup, type WhatsAppProvider } from '../provider';

/** CH10.2 the group rules, pagination, and switching a group on or off. The upserts run on Postgres in the integration test. */
const ME = '15550001234';
const ACTOR = { id: 'u-jackie', label: 'jackie@colaberry.com' };
const pg = (n: number, o: Partial<ProviderGroup> = {}): ProviderGroup => ({
  id: `1203630000000${String(n).padStart(5, '0')}@g.us`, name: `Group ${n}`, participants: [{ id: ME, rank: 'member' }], participants_count: 2,
  announcements: false, suspended: false, terminated: false, ...o,
});
const row = (o: Record<string, unknown> = {}) => {
  const r: Record<string, unknown> = {
    id: '11111111-1111-4111-8111-111111111111', name: 'Comms Hub test group', participants_count: 2, enabled: false, left_at: null,
    suspended: false, terminated: false, announcements: false, our_rank: 'member', cant_send_reason: null,
    last_synced_at: new Date('2026-11-21T22:00:00Z'), provider_group_id: '120363000000000001@g.us', ...o,
  };
  r.update = jest.fn(async (v: Record<string, unknown>) => { Object.assign(r, v); return r; });
  return r;
};
function pager(all: ProviderGroup[], failAtOffset?: number): WhatsAppProvider & { listGroups: jest.Mock } {
  const no = jest.fn();
  return {
    health: no, getGroup: no, sendText: no, sendImage: no, listSentSince: no,
    listGroups: jest.fn(async (count: number, offset: number) => {
      if (offset === failAtOffset) throw new UnavailableError();
      return { groups: all.slice(offset, offset + count), total: all.length };
    }),
  } as never;
}
beforeEach(() => jest.clearAllMocks());

describe('cantSendReason', () => {
  it.each([
    [{}, null],
    [{ left_at: new Date() }, 'left'],
    [{ suspended: true }, 'suspended'],
    [{ terminated: true }, 'terminated'],
    [{ our_rank: null }, 'not_a_member'],
    [{ announcements: true, our_rank: 'member' }, 'admins_only'],
    [{ announcements: true, our_rank: 'admin' }, null],
    [{ announcements: true, our_rank: 'creator' }, null],
    [{ cant_send_reason: 'forbidden' }, 'forbidden'],
  ])('%j gives %s', (o, want) => { expect(cantSendReason(row(o) as never)).toBe(want); });

  it('a group switched on that later becomes unsendable reads as NOT enabled, with the reason', () => {
    const v = toView(row({ enabled: true, suspended: true }) as never);
    expect([v.enabled, v.sendable, v.cant_send_reason]).toEqual([false, false, 'WhatsApp has suspended this group.']);
    expect(Object.keys(v).sort()).toEqual(['cant_send_reason', 'enabled', 'id', 'last_synced_at', 'name', 'participants_count', 'sendable']);
  });
});

describe('our rank and number matching', () => {
  it('finds our rank by digits, bare or with a WhatsApp suffix; absent means null', () => {
    expect(sameNumber('15550001234@s.whatsapp.net', '+1 555 000 1234')).toBe(true);
    expect(sameNumber('', ME)).toBe(false);
    expect(ourRank(pg(1, { participants: [{ id: `${ME}@s.whatsapp.net`, rank: 'admin' }] }), ME)).toBe('admin');
    expect(ourRank(pg(1, { participants: [{ id: '15559990000', rank: 'admin' }] }), ME)).toBeNull();
  });
});

describe('fetchAllGroups', () => {
  it('reads every page (230 groups in 3 pages of 100)', async () => {
    const all = Array.from({ length: 230 }, (_, i) => pg(i + 1));
    const p = pager(all);
    expect(await fetchAllGroups(p)).toHaveLength(230);
    expect(p.listGroups.mock.calls).toEqual([[100, 0], [100, 100], [100, 200]]);
  });
  it('0 groups is one call and an empty list', async () => {
    const p = pager([]);
    expect(await fetchAllGroups(p)).toEqual([]);
    expect(p.listGroups).toHaveBeenCalledTimes(1);
  });
  it('a failure on page 3 throws before anything is written', async () => {
    await expect(fetchAllGroups(pager(Array.from({ length: 230 }, (_, i) => pg(i + 1)), 200))).rejects.toBeInstanceOf(UnavailableError);
  });
  it('drops duplicates and ids that are not WhatsApp group ids, and the page loop is bounded', async () => {
    const odd = { ...pg(1), id: '15551234567@s.whatsapp.net' };
    expect((await fetchAllGroups(pager([pg(1), pg(1), odd, pg(2)]))).map((g) => g.name)).toEqual(['Group 1', 'Group 2']);
    const endless = pager([]);
    endless.listGroups.mockImplementation(async (_c: number, offset: number) => ({ groups: [pg(offset + 1)], total: 1e9 }));
    await fetchAllGroups(endless);
    expect(endless.listGroups).toHaveBeenCalledTimes(SYNC_MAX_PAGES);
  });
});

describe('requireConnection', () => {
  const ON = readWhatsAppConfig({ COMMS_HUB_WHATSAPP_ENABLED: 'true', WHAPI_TOKEN: 't', NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  const health = (state: string, number: string | null) => ({ health: jest.fn(async () => ({ state, number })) } as never);
  it('refuses when off, not linked, or without a number; answers with our number when linked', async () => {
    await expect(requireConnection({ config: readWhatsAppConfig({} as NodeJS.ProcessEnv) })).rejects.toMatchObject({ errorClass: 'NotConnectedError', message: 'WhatsApp is switched off for the hub.' });
    await expect(requireConnection({ config: ON, provider: health('QR', null) })).rejects.toMatchObject({ errorClass: 'NotConnectedError' });
    await expect(requireConnection({ config: ON, provider: health('AUTH', null) })).rejects.toMatchObject({ errorClass: 'NotConnectedError' });
    expect((await requireConnection({ config: ON, provider: health('AUTH', ME) })).number).toBe(ME);
  });
});

describe('setGroupEnabled', () => {
  it('switches a sendable group on, with one activity row naming it', async () => {
    const r = row();
    mockFindByPk.mockResolvedValue(r);
    const v = await setGroupEnabled(r.id as string, true, ACTOR);
    expect(v.enabled).toBe(true);
    expect(mockLog).toHaveBeenCalledWith(ACTOR, 'whatsapp.group_enabled', 'whatsapp_group', r.id, { name: 'Comms Hub test group' }, expect.anything());
  });
  it('the same value twice changes nothing and logs nothing', async () => {
    const r = row({ enabled: true });
    mockFindByPk.mockResolvedValue(r);
    await setGroupEnabled(r.id as string, true, ACTOR);
    expect(r.update).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });
  it('refuses to switch on a group that cannot be sent to, but always allows switching off', async () => {
    const r = row({ announcements: true, enabled: true });
    mockFindByPk.mockResolvedValue(r);
    await expect(setGroupEnabled(r.id as string, true, ACTOR)).rejects.toBeInstanceOf(GroupNotSendableError);
    await setGroupEnabled(r.id as string, false, ACTOR);
    expect(mockLog).toHaveBeenCalledWith(ACTOR, 'whatsapp.group_disabled', 'whatsapp_group', r.id, { name: 'Comms Hub test group' }, expect.anything());
  });
  it('an unknown group is NotFound', async () => {
    mockFindByPk.mockResolvedValue(null);
    await expect(setGroupEnabled('22222222-2222-4222-8222-222222222222', true, ACTOR)).rejects.toBeInstanceOf(GroupNotFoundError);
  });
});

it('the list puts groups the number left last and carries no provider ids or numbers', async () => {
  mockFindAll.mockResolvedValue([row({ id: 'a', name: 'Alpha', left_at: new Date() }), row({ id: 'b', name: 'Beta' })]);
  const list = await listWhatsAppGroups();
  expect(list.map((g) => g.name)).toEqual(['Beta', 'Alpha']);
  expect(JSON.stringify(list)).not.toMatch(/@g\.us|15550001234/);
});
