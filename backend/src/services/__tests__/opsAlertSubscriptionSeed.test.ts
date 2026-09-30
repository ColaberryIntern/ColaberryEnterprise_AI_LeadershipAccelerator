/**
 * opsAlertSubscriptionSeed tests — BC #10099862873 (P0): Ali's channel
 * decision (email for all alerts, voice added for critical only) must be
 * idempotent to re-run on every server boot without duplicating rows.
 *
 * Uses findOrCreate (not a manual findOne-then-branch) so two overlapping
 * boots can't both see "no row" and both insert.
 */
jest.mock('../../models/AlertSubscription', () => ({ findOrCreate: jest.fn() }));

import { seedOpsAlertSubscriptions } from '../opsAlertSubscriptionSeed';
import AlertSubscription from '../../models/AlertSubscription';

const findOrCreate = AlertSubscription.findOrCreate as jest.Mock;

describe('seedOpsAlertSubscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path (first boot): creates both the email-for-all and voice-for-critical rows', async () => {
    findOrCreate.mockImplementation(async ({ defaults }: any) => [{ update: jest.fn() }, true]);

    await seedOpsAlertSubscriptions();

    expect(findOrCreate).toHaveBeenCalledTimes(2);
    expect(findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alert_type: '*', impact_area: '*' },
        defaults: expect.objectContaining({ channels: ['dashboard', 'email'] }),
      })
    );
    expect(findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alert_type: 'critical', impact_area: '*' },
        defaults: expect.objectContaining({ channels: ['voice'] }),
      })
    );
  });

  it('idempotency (second boot): existing rows are updated in place, never duplicated', async () => {
    const update = jest.fn();
    findOrCreate.mockResolvedValue([{ update }, false]);

    await seedOpsAlertSubscriptions();
    await seedOpsAlertSubscriptions();

    expect(update).toHaveBeenCalledTimes(4); // 2 rows x 2 runs
  });

  it('boundary: voice channel never carries email, so a critical alert cannot double-send email via both matching rows', async () => {
    findOrCreate.mockImplementation(async () => [{ update: jest.fn() }, true]);

    await seedOpsAlertSubscriptions();

    const criticalCall = findOrCreate.mock.calls.find((c) => c[0].where.alert_type === 'critical');
    expect(criticalCall[0].defaults.channels).not.toContain('email');
  });
});
