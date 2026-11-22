/**
 * CH7.4 safety controls: Pause is stored and read back by the sending worker (so it blocks sends),
 * every change writes one activity row with it, a repeat writes nothing, and a bad test cohort is
 * refused with nothing written.
 */
type Store = { id: number; sending_paused: boolean; quiet_hours: unknown; alert_recipients: string[]; test_cohort_id: string | null; updated_by: string | null; updated_at: Date };
let row: (Store & { update: jest.Mock }) | null = null;
const activity: Array<{ action: string; detail: unknown }> = [];
const tx = { LOCK: { UPDATE: 'UPDATE' } };
const makeRow = (o: Partial<Store> = {}): Store & { update: jest.Mock } => {
  const r = { id: 1, sending_paused: false, quiet_hours: null, alert_recipients: [], test_cohort_id: null, updated_by: null, updated_at: new Date('2026-11-20T15:00:00Z'), ...o } as Store & { update: jest.Mock };
  r.update = jest.fn(async (v: Partial<Store>) => { Object.assign(r, v); return r; });
  return r;
};

jest.mock('../../../../config/env', () => ({ env: { frontendUrl: 'https://enterprise.colaberry.ai' } }));
jest.mock('../../../../config/database', () => ({ sequelize: { transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)), query: jest.fn() } }));
jest.mock('../../../../models/CommsHubWhatsAppGroup', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => null), findAll: jest.fn(async () => []) } }));
jest.mock('../../../../models/CommsHubSettings', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(async () => row), create: jest.fn(async () => { row = makeRow(); return row; }) },
}));
jest.mock('../../../../models/Cohort', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(async (id: string) => (id === '77777777-7777-4777-8777-777777777777' ? { get: (k: string) => ({ id, name: 'Test cohort' } as Record<string, string>)[k] } : null)) },
}));
jest.mock('../../activityLog', () => ({ logActivity: jest.fn(async (_a: unknown, action: string, _t: unknown, _i: unknown, detail: unknown) => { activity.push({ action, detail }); }) }));
// deliveryRepo's other models: only settings() is used here.
jest.mock('../../../../models/CommsHubDelivery', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../models/CommsHubDestination', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../models/CommsHubDraft', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../models/CommsHubMessage', () => ({ __esModule: true, default: {} }));
// Quiet hours are not set in these tests (its real module pulls in the message models).
jest.mock('../../delivery/quietHours', () => ({ quietUntil: () => null }));
jest.mock('../../connectors/inAppConnector', () => ({ ALL_MEMBERS: 'all_members' }));
// The worker's connector registry would load the real community models; the test passes its own channel.
jest.mock('../../connectors', () => ({ ...jest.requireActual('../../connectors/types'), connectorFor: jest.fn() }));
jest.mock('../../delivery/messageLifecycle', () => ({ approvalStillMatches: jest.fn(), finishMessage: jest.fn(), startMessage: jest.fn() }));

import { readHubSettings, setSendingPaused, SettingsInputError, updateHubSettings } from '../hubSettings';
import { deliveryRepo } from '../../delivery/deliveryRepo';
import { runDeliveryTick } from '../../delivery/deliveryWorker';
import { FakeRepo } from '../../delivery/__tests__/fakeRepo';

const JACKIE = { id: 'u-jackie', label: 'jackie@colaberry.com' };
beforeEach(() => { row = makeRow(); activity.length = 0; jest.clearAllMocks(); });

describe('Pause all sending', () => {
  it('pausing stores it, logs it once, and the sending worker reads it and sends nothing', async () => {
    const v = await setSendingPaused(true, JACKIE);
    expect(v.sending_paused).toBe(true);
    expect(activity.map((a) => a.action)).toEqual(['sending.paused']);
    expect(await deliveryRepo.settings()).toEqual({ paused: true, quietHours: null });

    // The worker with the real settings read: a due message is not started and its channel is never called.
    const repo = new FakeRepo();
    repo.settings = () => deliveryRepo.settings();
    repo.messages.set('m1', { id: 'm1', status: 'scheduled', send_at: null, approvalMatches: true });
    repo.destinations.push({ id: 'd1', message_id: 'm1', channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members', allowed: true });
    repo.drafts.set('m1:in_app', { title: 'Demo Tuesday', body: 'Demo Tuesday is Tuesday at 6:00 PM CST.' });
    const send = jest.fn(async () => ({ provider_message_id: 'n1' }));
    const deps = { repo, connector: () => ({ channel: 'in_app', send }), log: jest.fn() } as never;
    const T = new Date('2026-11-20T16:00:00Z');
    const tick = await runDeliveryTick(deps, T);
    expect(tick.paused).toBe(true);
    expect(repo.messages.get('m1')!.status).toBe('scheduled');
    expect(send).not.toHaveBeenCalled();

    // Control: resuming through the same control lets the same tick send it, so the pause was the reason.
    await setSendingPaused(false, JACKIE);
    await runDeliveryTick(deps, T);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('pausing twice writes once (re-running is a no-op); resuming is logged and the worker sees it', async () => {
    await setSendingPaused(true, JACKIE);
    await setSendingPaused(true, JACKIE);
    expect(row!.update).toHaveBeenCalledTimes(1);
    await setSendingPaused(false, JACKIE);
    expect(activity.map((a) => a.action)).toEqual(['sending.paused', 'sending.resumed']);
    expect((await deliveryRepo.settings()).paused).toBe(false);
  });

  it('the first write creates the settings row when there is none', async () => {
    row = null;
    expect((await setSendingPaused(true, JACKIE)).sending_paused).toBe(true);
    expect(row!.sending_paused).toBe(true);
  });
});

describe('quiet hours, alert recipients, test cohort', () => {
  it('saves only what changed, normalizes the emails, names the cohort, and logs the fields', async () => {
    const v = await updateHubSettings({ quiet_hours: { start: '21:00', end: '08:00' }, alert_recipients: [' Jackie@Colaberry.com', 'jackie@colaberry.com', 'ops@colaberry.com'], test_cohort_id: '77777777-7777-4777-8777-777777777777' }, JACKIE);
    expect(v).toEqual(expect.objectContaining({ quiet_hours: { start: '21:00', end: '08:00' }, alert_recipients: ['jackie@colaberry.com', 'ops@colaberry.com'], test_cohort: { id: '77777777-7777-4777-8777-777777777777', name: 'Test cohort' } }));
    expect(activity).toEqual([{ action: 'settings.changed', detail: { fields: ['quiet_hours', 'alert_recipients', 'test_cohort_id'] } }]);
    await updateHubSettings({ quiet_hours: { start: '21:00', end: '08:00' }, alert_recipients: ['ops@colaberry.com', 'jackie@colaberry.com'].reverse() }, JACKIE);
    expect(activity).toHaveLength(1);
  });

  it('an unknown test cohort is refused and nothing is written', async () => {
    await expect(updateHubSettings({ test_cohort_id: '88888888-8888-4888-8888-888888888888', quiet_hours: null }, JACKIE)).rejects.toBeInstanceOf(SettingsInputError);
    expect(row!.update).not.toHaveBeenCalled();
    expect(activity).toHaveLength(0);
  });

  it('clearing quiet hours and the test cohort is a change; reading with no row is the defaults', async () => {
    row = makeRow({ quiet_hours: { start: '21:00', end: '08:00' }, test_cohort_id: '77777777-7777-4777-8777-777777777777' });
    const v = await updateHubSettings({ quiet_hours: null, test_cohort_id: null }, JACKIE);
    expect([v.quiet_hours, v.test_cohort]).toEqual([null, null]);
    row = null;
    expect(await readHubSettings()).toEqual({ sending_paused: false, quiet_hours: null, alert_recipients: [], test_cohort: null, updated_at: null });
  });
});
