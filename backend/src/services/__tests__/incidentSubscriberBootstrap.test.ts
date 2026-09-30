/**
 * incidentSubscriberBootstrap — BC #10099862873 (P1, item 3): registers the
 * dormant per-project cognitive-incident email subscriber at boot, using a
 * fixed staff recipient list (Kes's decision 2026-07-16) rather than the
 * enrolled student.
 */
const mockRegisterIncidentSubscriber = jest.fn().mockReturnValue(() => {});
const mockCreateEmailSubscriber = jest.fn().mockReturnValue({ id: 'cognitive-incident-email' });
const mockGetSetting = jest.fn();

jest.mock('../../intelligence/systemStateEngine/incidents/incidentFanoutEngine', () => ({
  registerIncidentSubscriber: (...a: any[]) => mockRegisterIncidentSubscriber(...a),
}));
jest.mock('../../intelligence/systemStateEngine/incidents/subscribers/emailSubscriber', () => ({
  createEmailSubscriber: (...a: any[]) => mockCreateEmailSubscriber(...a),
}));
jest.mock('../emailService', () => ({ sendRawEmail: jest.fn() }));
jest.mock('../settingsService', () => ({ getSetting: (...a: any[]) => mockGetSetting(...a) }));
jest.mock('../../config/env', () => ({ env: { emailFrom: 'ali@colaberry.com' } }));

import { registerCognitiveIncidentSubscriber } from '../incidentSubscriberBootstrap';

describe('registerCognitiveIncidentSubscriber', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('happy path: a configured setting is parsed into a comma-split recipient list', async () => {
    mockGetSetting.mockResolvedValue('a@colaberry.com, b@colaberry.com');

    await registerCognitiveIncidentSubscriber();

    expect(mockCreateEmailSubscriber).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['a@colaberry.com', 'b@colaberry.com'] })
    );
    expect(mockRegisterIncidentSubscriber).toHaveBeenCalledTimes(1);
  });

  it('boundary: an unset setting falls back to env.emailFrom, not an empty recipient list', async () => {
    mockGetSetting.mockResolvedValue('');

    await registerCognitiveIncidentSubscriber();

    expect(mockCreateEmailSubscriber).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['ali@colaberry.com'] })
    );
  });

  it('idempotency: re-registering (e.g. on restart) does not throw and calls register again with the same id', async () => {
    mockGetSetting.mockResolvedValue('a@colaberry.com');

    await registerCognitiveIncidentSubscriber();
    await registerCognitiveIncidentSubscriber();

    expect(mockRegisterIncidentSubscriber).toHaveBeenCalledTimes(2);
    expect(mockCreateEmailSubscriber.mock.calls[0][0].id).toBe('cognitive-incident-email');
    expect(mockCreateEmailSubscriber.mock.calls[1][0].id).toBe('cognitive-incident-email');
  });

  it('failure path: a settings-lookup failure is caught and logged, not thrown', async () => {
    mockGetSetting.mockRejectedValue(new Error('DB down'));

    await expect(registerCognitiveIncidentSubscriber()).resolves.not.toThrow();
    expect(mockRegisterIncidentSubscriber).not.toHaveBeenCalled();
  });
});
