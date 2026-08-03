import { sequelize } from '../../config/database';
import { sendAlertEmail } from '../../services/emailService';
import { runReliabilityAlertCheck, __resetCooldownForTests } from '../../services/reliabilityAlertingService';

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
