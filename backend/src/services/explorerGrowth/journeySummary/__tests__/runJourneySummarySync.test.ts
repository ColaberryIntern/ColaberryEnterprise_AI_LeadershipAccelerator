/**
 * The runner's one safety-critical property: a GHL write to a missing field
 * returns success and stores nothing, so a run that cannot prove its first
 * write landed must STOP rather than report hundreds of silent no-ops.
 */
import { runJourneySummarySync } from '../runJourneySummarySync';
import { loadJourneyTargets } from '../journeySummaryData';
import {
  resolveWriteTarget,
  verifyWriteLanded,
  writeJourneySummary,
} from '../journeySummaryWriter';
import { JourneyTarget } from '../journeySummaryData';

jest.mock('../journeySummaryData');
jest.mock('../journeySummaryWriter');

const mockLoad = loadJourneyTargets as jest.MockedFunction<typeof loadJourneyTargets>;
const mockWrite = writeJourneySummary as jest.MockedFunction<typeof writeJourneySummary>;
const mockVerify = verifyWriteLanded as jest.MockedFunction<typeof verifyWriteLanded>;
const mockResolve = resolveWriteTarget as jest.MockedFunction<typeof resolveWriteTarget>;

const NOW = new Date('2026-11-28T12:00:00Z');

function target(leadId: number, over: Partial<JourneyTarget['input']> = {}): JourneyTarget {
  return {
    leadId,
    ghlContactId: `contact-${leadId}`,
    leadSource: 'open_house',
    input: {
      generatedAt: NOW,
      interest: 'AI leadership',
      signals: ['High intent'],
      events: [],
      nextStep: null,
      caution: null,
      ...over,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWrite.mockResolvedValue({ status: 'written' });
  mockVerify.mockResolvedValue(true);
  mockResolve.mockResolvedValue({ apiKey: 'k', field: 'ent_lead_journey_summary' });
  // Silence the structured log lines so test output stays readable.
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => { jest.restoreAllMocks(); });

describe('runJourneySummarySync', () => {
  it('writes a card for every lead that has one', async () => {
    mockLoad.mockResolvedValue([target(1), target(2), target(3)]);
    const r = await runJourneySummarySync({ now: NOW });
    expect(r.written).toBe(3);
    expect(r.failed).toBe(0);
    expect(r.abortedReason).toBeNull();
  });

  describe('the canary', () => {
    it('verifies exactly once, not once per lead', async () => {
      mockLoad.mockResolvedValue([target(1), target(2), target(3)]);
      await runJourneySummarySync({ now: NOW });
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    it('ABORTS the run when the first write did not persist', async () => {
      // This is the whole point: updateContact said success, the value is not
      // there, so the field is probably missing from this sub-account.
      mockVerify.mockResolvedValue(false);
      mockLoad.mockResolvedValue([target(1), target(2), target(3)]);

      const r = await runJourneySummarySync({ now: NOW });

      expect(r.abortedReason).toBe('canary_write_did_not_persist');
      expect(r.considered).toBe(1);
      expect(mockWrite).toHaveBeenCalledTimes(1);
    });

    it('does not abort when the write landed', async () => {
      mockLoad.mockResolvedValue([target(1), target(2)]);
      const r = await runJourneySummarySync({ now: NOW });
      expect(r.abortedReason).toBeNull();
      expect(mockWrite).toHaveBeenCalledTimes(2);
    });
  });

  describe('honest counting', () => {
    it('counts an empty card instead of writing one', async () => {
      mockLoad.mockResolvedValue([
        target(1, { interest: null, signals: [] }),
        target(2),
      ]);
      const r = await runJourneySummarySync({ now: NOW });
      expect(r.emptyCards).toBe(1);
      expect(r.written).toBe(1);
      expect(mockWrite).toHaveBeenCalledTimes(1);
    });

    it('separates a missing route from a missing field', async () => {
      mockWrite
        .mockResolvedValueOnce({ status: 'skipped', reason: 'no_route' })
        .mockResolvedValueOnce({ status: 'skipped', reason: 'no_field' });
      mockLoad.mockResolvedValue([target(1), target(2)]);

      const r = await runJourneySummarySync({ now: NOW });

      expect(r.skippedNoRoute).toBe(1);
      expect(r.skippedNoField).toBe(1);
      expect(r.written).toBe(0);
    });

    it('records a failure without ending the pass', async () => {
      mockWrite
        .mockResolvedValueOnce({ status: 'failed', errorClass: 'TimeoutError', detail: 'slow' })
        .mockResolvedValueOnce({ status: 'written' });
      mockLoad.mockResolvedValue([target(1), target(2)]);
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const r = await runJourneySummarySync({ now: NOW });

      expect(r.failed).toBe(1);
      expect(r.written).toBe(1);
      expect(r.abortedReason).toBeNull();
    });
  });

  describe('safety rails', () => {
    it('writes nothing in a dry run', async () => {
      mockLoad.mockResolvedValue([target(1), target(2)]);
      const r = await runJourneySummarySync({ now: NOW, dryRun: true });
      expect(mockWrite).not.toHaveBeenCalled();
      expect(r.written).toBe(0);
      expect(r.considered).toBe(2);
    });

    it('honors a limit, so a first live run can be small', async () => {
      mockLoad.mockResolvedValue([target(1), target(2), target(3), target(4)]);
      const r = await runJourneySummarySync({ now: NOW, limit: 2 });
      expect(r.considered).toBe(2);
      expect(mockWrite).toHaveBeenCalledTimes(2);
    });

    it('is safe on an empty pool', async () => {
      mockLoad.mockResolvedValue([]);
      const r = await runJourneySummarySync({ now: NOW });
      expect(r.considered).toBe(0);
      expect(r.written).toBe(0);
      expect(r.abortedReason).toBeNull();
    });
  });

  it('is idempotent: the same pool twice produces the same counts', async () => {
    mockLoad.mockResolvedValue([target(1), target(2)]);
    const a = await runJourneySummarySync({ now: NOW });
    const b = await runJourneySummarySync({ now: NOW });
    expect(b.written).toBe(a.written);
    expect(b.emptyCards).toBe(a.emptyCards);
    expect(b.failed).toBe(a.failed);
  });
});
