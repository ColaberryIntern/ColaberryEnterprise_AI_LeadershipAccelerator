/**
 * Apollo credit kill switch (CC-20260710-a9f2).
 *
 * Every Apollo endpoint burns paid credits. These tests prove that when
 * APOLLO_ENABLED is off (the default), no Apollo entry point makes a network
 * call — the scheduled lead-gen agents can keep running without spending a
 * single credit — and that flipping the flag on restores the call path.
 */

// Mutable env stub so each test can toggle the flag.
const mockEnv = { apolloEnabled: false, apolloApiKey: 'test-key' };
jest.mock('../../config/env', () => ({ env: mockEnv }));

// Stub the Sequelize model + GHL sync so importing apolloService doesn't pull
// in the full model graph or attempt a DB connection.
jest.mock('../../models/Lead', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../../services/ghlService', () => ({ syncNewLeadToGhl: jest.fn() }));

import {
  searchPeople,
  enrichPerson,
  requestPhoneReveal,
  getApolloQuota,
} from '../../services/apolloService';

describe('Apollo credit kill switch', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when disabled (APOLLO_ENABLED unset — default)', () => {
    beforeEach(() => {
      mockEnv.apolloEnabled = false;
    });

    it('searchPeople returns an empty result and makes no network call', async () => {
      const result = await searchPeople({ q_person_title: ['CEO'], per_page: 25, page: 1 });
      expect(result).toEqual({ people: [], total: 0, page: 1, per_page: 25 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('enrichPerson returns null and makes no network call', async () => {
      const result = await enrichPerson('someone@example.com');
      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requestPhoneReveal resolves without a network call', async () => {
      await expect(requestPhoneReveal('test-key', 'person-123')).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('getApolloQuota reports unavailable without a network call', async () => {
      const quota = await getApolloQuota();
      expect(quota.available).toBe(false);
      expect(quota.message).toMatch(/disabled/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('when enabled (APOLLO_ENABLED=true)', () => {
    beforeEach(() => {
      mockEnv.apolloEnabled = true;
    });

    it('searchPeople hits the Apollo API (guard does not block)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ people: [], total_entries: 0 }),
        text: async () => '',
      });
      await searchPeople({ q_person_title: ['CEO'], per_page: 1, page: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('/v1/mixed_people/api_search');
    });
  });
});
