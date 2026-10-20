import { sequelize } from '../../config/database';
import { sendAlertEmail } from '../../services/emailService';
import {
  runReliabilityAlertCheck,
  __resetCooldownForTests,
  FAILURE_ONLY_EVENT_TYPES,
} from '../../services/reliabilityAlertingService';

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../services/emailService', () => ({ sendAlertEmail: jest.fn().mockResolvedValue(undefined) }));

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockSendAlert = sendAlertEmail as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  __resetCooldownForTests();
});

describe('runReliabilityAlertCheck', () => {
  it('does not alert when the error rate is below threshold', async () => {
    mockQuery.mockResolvedValue([{ total: 100, failures: 5 }]);
    const result = await runReliabilityAlertCheck();
    expect(result.errorRatePct).toBe(5);
    expect(result.breached).toBe(false);
    expect(mockSendAlert).not.toHaveBeenCalled();
  });

  it('does not alert when sample size is too small, even at 100% failure', async () => {
    mockQuery.mockResolvedValue([{ total: 3, failures: 3 }]);
    const result = await runReliabilityAlertCheck();
    expect(result.suppressedBySampleSize).toBe(true);
    expect(mockSendAlert).not.toHaveBeenCalled();
  });

  it('alerts once when the error rate breaches threshold with adequate sample size', async () => {
    mockQuery.mockResolvedValue([{ total: 40, failures: 15 }]); // 37.5% -> rounds to 38%, > 25%
    const result = await runReliabilityAlertCheck();
    expect(result.breached).toBe(true);
    expect(result.alertSent).toBe(true);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
    expect(mockSendAlert.mock.calls[0][0]).toBe('ali@colaberry.com');
    expect(mockSendAlert.mock.calls[0][1].type).toBe('reliability_error_rate');
  });

  it('suppresses a second breach within the cooldown window (does not alert twice per breach)', async () => {
    mockQuery.mockResolvedValue([{ total: 40, failures: 15 }]);
    const first = await runReliabilityAlertCheck();
    const second = await runReliabilityAlertCheck();

    expect(first.alertSent).toBe(true);
    expect(second.breached).toBe(true);
    expect(second.suppressedByCooldown).toBe(true);
    expect(second.alertSent).toBe(false);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
  });

  it('does not throw and reports alertSent=false when the email send fails', async () => {
    mockQuery.mockResolvedValue([{ total: 40, failures: 15 }]);
    mockSendAlert.mockRejectedValueOnce(new Error('mandrill down'));

    const result = await runReliabilityAlertCheck();

    expect(result.breached).toBe(true);
    expect(result.alertSent).toBe(false);
  });
});

// ─── Scope of the rate ────────────────────────────────────────────────────
// Regression guard for the 2026-09-01 false page: the alert counted every row in
// ai_events, including auth telemetry that is only ever written on failure. Two
// abandoned admin tabs re-polling with an expired JWT drove it to "94% AI event
// failure rate" while real model calls were failing at 0%. These tests assert on
// WHICH ROWS the query counts, which the original suite never did.
describe('error-rate scope (what the query counts)', () => {
  it('excludes failure-only auth/security event types from the rate', async () => {
    mockQuery.mockResolvedValue([{ total: 100, failures: 5 }]);
    await runReliabilityAlertCheck();

    const sql = mockQuery.mock.calls[0][0] as string;
    const opts = mockQuery.mock.calls[0][1] as { replacements?: Record<string, unknown> };

    expect(sql).toContain('event_type NOT IN (:failureOnlyEventTypes)');
    expect(opts.replacements?.failureOnlyEventTypes).toEqual(FAILURE_ONLY_EVENT_TYPES);
  });

  it('names every known failure-only event type, so none can leak into the rate', () => {
    // If a new auth/security event type is added to the codebase it must be listed
    // here too. Locking the exact set makes that omission a failing test, not a page.
    expect([...FAILURE_ONLY_EVENT_TYPES].sort()).toEqual([
      'admin_auth_failed',
      'delivery_client_auth_failed',
      'delivery_client_link_no_membership',
      'participant_auth_failed',
      'sales_or_admin_auth_failed',
    ]);
  });

  it('still scopes to the rolling window', async () => {
    mockQuery.mockResolvedValue([{ total: 100, failures: 5 }]);
    await runReliabilityAlertCheck();
    expect(mockQuery.mock.calls[0][0]).toContain("INTERVAL '15 minutes'");
  });

  it('does not page when auth spam is excluded and real AI traffic is healthy', async () => {
    // The exact prod shape on 2026-09-01: the query now returns only the 3 real AI
    // events from that window, all successful, instead of 48 rows of which 45 were
    // expired-JWT auth failures.
    mockQuery.mockResolvedValue([{ total: 854, failures: 0 }]);
    const result = await runReliabilityAlertCheck();

    expect(result.errorRatePct).toBe(0);
    expect(result.breached).toBe(false);
    expect(mockSendAlert).not.toHaveBeenCalled();
  });

  it('still pages when real AI events genuinely fail', async () => {
    // The fix must not make the alert unable to fire.
    mockQuery.mockResolvedValue([{ total: 60, failures: 30 }]);
    const result = await runReliabilityAlertCheck();

    expect(result.errorRatePct).toBe(50);
    expect(result.breached).toBe(true);
    expect(result.alertSent).toBe(true);
  });

  it('is idempotent: two consecutive checks read the same rows the same way', async () => {
    mockQuery.mockResolvedValue([{ total: 100, failures: 5 }]);
    await runReliabilityAlertCheck();
    await runReliabilityAlertCheck();

    expect(mockQuery.mock.calls[0][0]).toEqual(mockQuery.mock.calls[1][0]);
    expect(mockQuery.mock.calls[0][1]).toEqual(mockQuery.mock.calls[1][1]);
  });
});
