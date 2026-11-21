import { sequelize } from '../../config/database';
import { sendAlertEmail } from '../../services/emailService';
import {
  runReliabilityAlertCheck,
  __resetCooldownForTests,
  NON_RELIABILITY_EVENT_TYPES,
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

// ─── Regression: authorization rejections are not AI reliability failures ───
//
// Production 2026-11-21 14:45 Central fired a severity-8 "91% AI event failure rate"
// alert. All 20 of the 22 counted "failures" were `jwt expired` rejections from two
// people whose sessions timed out, while every real AI operation in the same window
// succeeded. The five tests above all passed throughout, because every one of them
// mocks `sequelize.query` and therefore never looks at the SQL. These do.
describe('error-rate query scope', () => {
  function capturedSql(): string {
    expect(mockQuery).toHaveBeenCalled();
    return String(mockQuery.mock.calls[0][0]);
  }
  function capturedOptions(): any {
    return mockQuery.mock.calls[0][1] ?? {};
  }

  beforeEach(() => {
    mockQuery.mockResolvedValue([{ total: 100, failures: 1 }]);
  });

  it('excludes authorization-rejection event types from the rate', async () => {
    await runReliabilityAlertCheck();

    expect(capturedSql()).toContain('event_type NOT IN (:excludedEventTypes)');
    expect(capturedOptions().replacements?.excludedEventTypes).toEqual(
      expect.arrayContaining([
        'admin_auth_failed',
        'participant_auth_failed',
        'sales_or_admin_auth_failed',
      ])
    );
  });

  it('keeps rows whose event_type is NULL rather than dropping them', async () => {
    await runReliabilityAlertCheck();
    // NOT IN (...) evaluates to NULL for a NULL event_type, which would silently
    // discard those rows from the denominator. The guard must be explicit.
    expect(capturedSql()).toContain('event_type IS NULL OR');
  });

  it('still counts genuine upstream failures, which are NOT excluded', () => {
    // These are real reliability signals (TimeoutError / UpstreamUnavailable) and
    // must keep reaching the alert. If someone adds them to the exclusion list to
    // quieten the channel, this fails.
    for (const upstream of ['basecamp_request_failed', 'ghl_request_failed', 'synthflow_call_failed']) {
      expect(NON_RELIABILITY_EVENT_TYPES as readonly string[]).not.toContain(upstream);
    }
  });

  it('never excludes a core AI operation event type', () => {
    for (const core of ['llm.call', 'tool.call', 'retrieval', 'agent.action']) {
      expect(NON_RELIABILITY_EVENT_TYPES as readonly string[]).not.toContain(core);
    }
  });

  it('reproduces the 2026-11-21 false alarm: 20 auth rejections + 2 real events no longer alert', async () => {
    // What the OLD query saw: 22 rows, 20 "failures" -> 91%, alert fires.
    // What the NEW query sees: the 20 auth rows are gone, leaving 2 rows, which is
    // below MIN_SAMPLE_SIZE, so the check correctly declines to judge.
    mockQuery.mockResolvedValue([{ total: 2, failures: 0 }]);

    const result = await runReliabilityAlertCheck();

    expect(result.suppressedBySampleSize).toBe(true);
    expect(result.breached).toBe(false);
    expect(mockSendAlert).not.toHaveBeenCalled();
  });

  it('a real LLM outage still alerts', async () => {
    // The fix must not make the alert unable to fire. Same shape, real failures.
    mockQuery.mockResolvedValue([{ total: 60, failures: 30 }]);

    const result = await runReliabilityAlertCheck();

    expect(result.errorRatePct).toBe(50);
    expect(result.breached).toBe(true);
    expect(result.alertSent).toBe(true);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
  });
});
