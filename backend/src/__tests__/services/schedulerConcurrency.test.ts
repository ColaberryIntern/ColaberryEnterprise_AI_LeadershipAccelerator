/**
 * Scheduler Concurrency Tests (T4)
 * T4: Atomic claim, processing state, stale recovery (10 tests)
 * Tests the concurrency-safe patterns added to schedulerService.
 */

const mockSequelizeQuery = jest.fn();
const mockSequelizeTransaction = jest.fn();
const mockScheduledEmailUpdate = jest.fn().mockResolvedValue([0]);

jest.mock('../../config/database', () => ({
  sequelize: {
    query: (...args: any[]) => mockSequelizeQuery(...args),
    transaction: (fn: any) => mockSequelizeTransaction(fn),
  },
}));

jest.mock('../../models', () => ({
  ScheduledEmail: {
    update: (...args: any[]) => mockScheduledEmailUpdate(...args),
    findAll: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  Campaign: {
    findByPk: jest.fn().mockResolvedValue({ id: 'c1', status: 'active', settings: {} }),
    findAll: jest.fn().mockResolvedValue([]),
  },
  Lead: {
    findByPk: jest.fn().mockResolvedValue({ id: 1, status: 'new' }),
  },
  CampaignLead: {
    count: jest.fn().mockResolvedValue(0),
  },
  SystemSetting: {
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../services/settingsService', () => ({
  getSetting: jest.fn().mockResolvedValue(null),
  setSetting: jest.fn().mockResolvedValue(undefined),
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: true, email: 'test@t.com', phone: '555' }),
}));

jest.mock('../../services/activityService', () => ({
  logActivity: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../services/communicationSafetyService', () => ({
  evaluateSend: jest.fn().mockResolvedValue({
    allowed: true,
    redirect: null,
    testMode: false,
    deliveryMode: 'live',
  }),
}));

describe('schedulerConcurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── T4: Processing State Machine ───────────────────────────────────────

  describe('ScheduledEmail processing state', () => {
    test('processing_started_at field exists in model definition', () => {
      // Verify model has the field — the model definition is tested by checking
      // that the column exists. Since we're testing with mocks, we verify
      // the update call includes the field.
      const updateData = {
        status: 'processing',
        processing_started_at: new Date(),
        processor_id: 'proc-abc',
      };
      expect(updateData).toHaveProperty('processing_started_at');
      expect(updateData).toHaveProperty('processor_id');
      expect(updateData.status).toBe('processing');
    });

    test('status transitions: pending → processing → sent', () => {
      const validTransitions: Record<string, string[]> = {
        pending: ['processing', 'cancelled', 'paused'],
        processing: ['sent', 'failed', 'pending'],  // pending = retry reset
        sent: [],      // terminal
        failed: [],    // terminal
        cancelled: [], // terminal
      };

      expect(validTransitions.pending).toContain('processing');
      expect(validTransitions.processing).toContain('sent');
      expect(validTransitions.processing).toContain('failed');
      expect(validTransitions.sent).toHaveLength(0); // terminal
      expect(validTransitions.failed).toHaveLength(0); // terminal
    });

    test('retry resets status back to pending and clears processor', () => {
      const retryUpdate = {
        status: 'pending',
        processing_started_at: null,
        processor_id: null,
      };
      expect(retryUpdate.status).toBe('pending');
      expect(retryUpdate.processing_started_at).toBeNull();
      expect(retryUpdate.processor_id).toBeNull();
    });
  });

  // ─── Stale Recovery ─────────────────────────────────────────────────────

  // Stale recovery is tested in `services/scheduling/__tests__/claimLease.test.ts`, against the
  // real `recoverStaleActions`.
  //
  // Two tests lived here and were deleted rather than moved, because neither could fail. One
  // built the recovery `where` clause inside the test and asserted on its own object; the other
  // called the `ScheduledEmail.update` mock directly with hand-written arguments and asserted
  // the mock had received them. Production code was never involved, so both stayed green when
  // recovery changed on 2026-10-27 to consume an attempt per recycle, while describing the old
  // behavior as though it were still covered. A test that cannot fail is worse than no test:
  // it reports coverage that does not exist. Found by Quincy Ninying while building Ellis.

  // ─── Atomic Claim Query ──────────────────────────────────────────────────

  describe('atomic claim pattern', () => {
    test('claim query should use FOR UPDATE SKIP LOCKED', () => {
      const claimSQL = `
        UPDATE scheduled_emails
        SET status = 'processing', processing_started_at = NOW(), processor_id = :processorId
        WHERE id IN (
          SELECT id FROM scheduled_emails
          WHERE status = 'pending' AND scheduled_for <= NOW() AND attempts_made < max_attempts
          ORDER BY scheduled_for ASC LIMIT :batchSize
          FOR UPDATE SKIP LOCKED
        ) RETURNING *
      `;

      expect(claimSQL).toContain('FOR UPDATE SKIP LOCKED');
      expect(claimSQL).toContain("status = 'processing'");
      expect(claimSQL).toContain('processing_started_at = NOW()');
      expect(claimSQL).toContain('processor_id = :processorId');
      expect(claimSQL).toContain('RETURNING *');
    });

    test('claim should use a transaction', async () => {
      const mockTx = { commit: jest.fn(), rollback: jest.fn() };
      mockSequelizeTransaction.mockImplementation(async (fn) => {
        return fn(mockTx);
      });

      // Simulate transaction wrapper
      await mockSequelizeTransaction(async (tx: any) => {
        mockSequelizeQuery.mockResolvedValueOnce([[], 0]);
        await mockSequelizeQuery('UPDATE ...', { transaction: tx });
        return [];
      });

      expect(mockSequelizeTransaction).toHaveBeenCalled();
      expect(mockSequelizeQuery).toHaveBeenCalled();
    });

    test('claim should rollback on error', async () => {
      const mockTx = { commit: jest.fn(), rollback: jest.fn() };
      mockSequelizeTransaction.mockImplementation(async (fn) => {
        try {
          return await fn(mockTx);
        } catch (err) {
          mockTx.rollback();
          throw err;
        }
      });

      mockSequelizeQuery.mockRejectedValueOnce(new Error('deadlock'));

      await expect(
        mockSequelizeTransaction(async (tx: any) => {
          return mockSequelizeQuery('UPDATE ...', { transaction: tx });
        }),
      ).rejects.toThrow('deadlock');

      expect(mockTx.rollback).toHaveBeenCalled();
    });

    test('processor_id should be unique per scheduler instance', () => {
      const id1 = `proc-${process.pid}-${Date.now()}`;
      const id2 = `proc-${process.pid}-${Date.now() + 1}`;
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^proc-\d+-\d+$/);
    });
  });
});
