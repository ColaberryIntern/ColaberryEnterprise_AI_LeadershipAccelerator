import DeadLetterJob from '../../models/DeadLetterJob';
import { wrapWithDeadLetter } from '../../services/deadLetterService';

jest.mock('../../models/DeadLetterJob', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({ id: 'row-1' }) },
}));

const mockCreate = DeadLetterJob.create as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('wrapWithDeadLetter', () => {
  // Each test uses its own job name — failure counts are tracked in a module-scope
  // Map keyed by job name, so distinct names keep tests independent without needing
  // a test-only reset export.

  it('does not write a dead-letter row on success', async () => {
    await wrapWithDeadLetter('TestJob-success', 'Test Job', async () => 'ok');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not write a dead-letter row on a single failure (not exhausted yet)', async () => {
    await wrapWithDeadLetter('TestJob-single-fail', 'Test Job', async () => { throw new Error('boom'); });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('writes exactly one dead-letter row after 3 consecutive failures', async () => {
    const failing = async () => { throw new Error('boom'); };
    await wrapWithDeadLetter('TestJob-exhaust', 'Test Job', failing);
    await wrapWithDeadLetter('TestJob-exhaust', 'Test Job', failing);
    expect(mockCreate).not.toHaveBeenCalled();
    await wrapWithDeadLetter('TestJob-exhaust', 'Test Job', failing);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const row = mockCreate.mock.calls[0][0];
    expect(row.job_name).toBe('TestJob-exhaust');
    expect(row.consecutive_failures).toBe(3);
    expect(row.error_message).toContain('boom');
    expect(row.resolved).toBe(false);
  });

  it('resets the failure count on a subsequent success (no dead-letter row after recovery)', async () => {
    const failing = async () => { throw new Error('boom'); };
    const ok = async () => 'ok';
    await wrapWithDeadLetter('TestJob-recover', 'Test Job', failing);
    await wrapWithDeadLetter('TestJob-recover', 'Test Job', failing);
    await wrapWithDeadLetter('TestJob-recover', 'Test Job', ok);
    await wrapWithDeadLetter('TestJob-recover', 'Test Job', failing);
    await wrapWithDeadLetter('TestJob-recover', 'Test Job', failing);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('never throws even when the DeadLetterJob write itself fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db unavailable'));
    const failing = async () => { throw new Error('boom'); };

    await expect(
      (async () => {
        await wrapWithDeadLetter('TestJob-dlq-write-fails', 'Test Job', failing);
        await wrapWithDeadLetter('TestJob-dlq-write-fails', 'Test Job', failing);
        await wrapWithDeadLetter('TestJob-dlq-write-fails', 'Test Job', failing);
      })()
    ).resolves.toBeUndefined();
  });
});
