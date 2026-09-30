/**
 * emitAlert re-notification suppression.
 *
 * Regression cover for the alert-email storm: the previous dedup window was one
 * hour, so a condition that stays broken (a cron job failing for days) produced
 * a brand-new alert row AND a fresh email every hour, indefinitely. Prod was
 * emitting ~250 alert emails/day, 16-23 of them per individual condition, which
 * buried the real signal.
 *
 * The rule under test: while an alert for the same title+type is still open,
 * fold occurrences into it and stay quiet — unless severity escalates or the
 * condition is still firing a full re-notify interval later.
 */
jest.mock('../../models/Alert', () => ({ __esModule: true, default: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() } }));
jest.mock('../../models/AlertEvent', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../../models/AlertSubscription', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../models/AlertResolution', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../alertDeliveryService', () => ({ deliverAlert: jest.fn() }));

import { emitAlert } from '../alertService';
import Alert from '../../models/Alert';
import AlertEvent from '../../models/AlertEvent';
import AlertSubscription from '../../models/AlertSubscription';
import { deliverAlert } from '../alertDeliveryService';

const findOne = Alert.findOne as unknown as jest.Mock;
const create = Alert.create as unknown as jest.Mock;
const updateStatic = Alert.update as unknown as jest.Mock;
const eventCreate = AlertEvent.create as unknown as jest.Mock;
const subFindAll = AlertSubscription.findAll as unknown as jest.Mock;
const deliver = deliverAlert as unknown as jest.Mock;

const HOUR = 60 * 60 * 1000;

function openAlert(overrides: Record<string, any> = {}) {
  const alert: Record<string, any> = {
    id: 'alert-1',
    severity: 3,
    status: 'new',
    created_at: new Date(Date.now() - 5 * HOUR),
    metadata: { occurrence_count: 1, last_notified_at: new Date(Date.now() - 5 * HOUR).toISOString() },
    ...overrides,
  };
  alert.update = jest.fn(async (fields: Record<string, any>) => Object.assign(alert, fields));
  return alert;
}

const input = {
  type: 'critical' as const,
  severity: 5,
  title: 'Cron Job Error Spike: OpenclawMarketSignalAgent',
  description: 'failing',
  sourceType: 'system' as const,
};

describe('emitAlert re-notification suppression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Subscription matching runs a raw-ish query path; an empty list keeps these
    // tests focused on the dedup decision rather than delivery fan-out.
    subFindAll.mockResolvedValue([]);
    eventCreate.mockResolvedValue({});
    updateStatic.mockResolvedValue([1]);
  });

  it('creates and notifies when no open alert exists for the condition', async () => {
    findOne.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'new-1', severity: 5, metadata: {} });

    await emitAlert(input);

    expect(create).toHaveBeenCalledTimes(1);
    expect(subFindAll).toHaveBeenCalled();
  });

  it('folds a recurrence into the open alert instead of creating a second one', async () => {
    const existing = openAlert({ severity: 5 });
    findOne.mockResolvedValue(existing);

    const returned = await emitAlert(input);

    expect(create).not.toHaveBeenCalled();
    expect(returned).toBe(existing);
    expect(existing.update).toHaveBeenCalledTimes(1);
    expect(existing.update.mock.calls[0][0].metadata.occurrence_count).toBe(2);
  });

  it('stays silent on a recurrence inside the re-notify interval', async () => {
    findOne.mockResolvedValue(openAlert({ severity: 5 }));

    await emitAlert(input);

    expect(deliver).not.toHaveBeenCalled();
    expect(eventCreate.mock.calls[0][0].details.renotified).toBe(false);
  });

  it('re-notifies once the condition is still firing past the re-notify interval', async () => {
    const stale = new Date(Date.now() - 30 * HOUR).toISOString();
    findOne.mockResolvedValue(openAlert({ severity: 5, metadata: { occurrence_count: 9, last_notified_at: stale } }));

    await emitAlert(input);

    expect(create).not.toHaveBeenCalled();
    expect(subFindAll).toHaveBeenCalled();
    expect(eventCreate.mock.calls[0][0].details.renotified).toBe(true);
  });

  it('re-notifies immediately when severity escalates, even inside the interval', async () => {
    const existing = openAlert({ severity: 3 });
    findOne.mockResolvedValue(existing);

    await emitAlert(input);

    expect(eventCreate.mock.calls[0][0].details.escalated).toBe(true);
    expect(subFindAll).toHaveBeenCalled();
    expect(existing.update.mock.calls[0][0].severity).toBe(5);
  });

  it('does not treat resolved/dismissed alerts as open (query excludes them)', async () => {
    findOne.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'new-2', severity: 5, metadata: {} });

    await emitAlert(input);

    const whereClause = findOne.mock.calls[0][0].where;
    expect(whereClause.title).toBe(input.title);
    expect(whereClause.type).toBe(input.type);
    expect(whereClause.status).toBeDefined();
    // No created_at floor any more: an open alert suppresses regardless of age.
    expect(whereClause.created_at).toBeUndefined();
  });
});
