/**
 * opsAlertSubscriptionSeed tests — BC #10099862873 (P0): Ali's channel
 * decision (email for all alerts, voice added for critical only) must be
 * idempotent to re-run on every server boot without duplicating rows.
 */
jest.mock('../../models/AlertSubscription', () => ({ findOne: jest.fn(), create: jest.fn() }));

import { seedOpsAlertSubscriptions } from '../opsAlertSubscriptionSeed';
import AlertSubscription from '../../models/AlertSubscription';

const findOne = AlertSubscription.findOne as jest.Mock;
const create = AlertSubscription.create as jest.Mock;

describe('seedOpsAlertSubscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path (first boot): creates both the email-for-all and voice-for-critical rows', async () => {
    findOne.mockResolvedValue(null);
    create.mockResolvedValue({});

    await seedOpsAlertSubscriptions();

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ alert_type: '*', channels: ['dashboard', 'email'] })
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ alert_type: 'critical', channels: ['voice'] })
    );
  });

  it('idempotency (second boot): existing rows are updated in place, never duplicated', async () => {
    const update = jest.fn();
    findOne.mockResolvedValue({ update });

    await seedOpsAlertSubscriptions();
    await seedOpsAlertSubscriptions();

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(4); // 2 rows x 2 runs
  });

  it('boundary: voice channel never carries email, so a critical alert cannot double-send email via both matching rows', async () => {
    findOne.mockResolvedValue(null);
    create.mockResolvedValue({});

    await seedOpsAlertSubscriptions();

    const criticalRowCall = create.mock.calls.find((c) => c[0].alert_type === 'critical');
    expect(criticalRowCall[0].channels).not.toContain('email');
  });
});
