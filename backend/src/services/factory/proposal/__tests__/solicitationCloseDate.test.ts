/**
 * solicitationCloseDate (M5) - the close date is READ from the solicitation, never invented. These tests pin the
 * precedence (manual override -> snapshot closeAt -> snapshot closeDate -> vetting fallback), day-precision
 * normalization, the honest null when nothing is recorded, and fail-soft on a read error.
 */
const qFindOne = jest.fn();
jest.mock('../../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: (...a: any[]) => qFindOne(...a) } }));
const loadAiVettingView = jest.fn();
jest.mock('../../govAiVetting', () => ({ __esModule: true, loadAiVettingView: (...a: any[]) => loadAiVettingView(...a) }));

import { toCloseDateString, resolveSolicitationCloseDate } from '../solicitationCloseDate';

beforeEach(() => { jest.clearAllMocks(); loadAiVettingView.mockResolvedValue(null); });

describe('toCloseDateString - day precision, never a guess', () => {
  it('passes a YYYY-MM-DD date through unchanged', () => {
    expect(toCloseDateString('2026-03-15')).toBe('2026-03-15');
  });
  it('reduces an ISO datetime to its UTC calendar day', () => {
    expect(toCloseDateString('2026-03-15T23:30:00Z')).toBe('2026-03-15');
  });
  it('returns null for an unparseable or empty value', () => {
    expect(toCloseDateString('not a date')).toBeNull();
    expect(toCloseDateString('')).toBeNull();
    expect(toCloseDateString('   ')).toBeNull();
    expect(toCloseDateString(null)).toBeNull();
    expect(toCloseDateString(undefined)).toBeNull();
  });
});

describe('resolveSolicitationCloseDate - precedence', () => {
  it('a management manual override WINS over the snapshot', async () => {
    qFindOne.mockResolvedValue({
      requirements_json: { manualDeadline: { closeDate: '2026-06-01' } },
      source_snapshot: { closeAt: '2026-05-01T00:00:00Z' },
    });
    expect(await resolveSolicitationCloseDate('dp-1')).toBe('2026-06-01');
  });

  it('falls back to the snapshot closeAt when there is no manual override', async () => {
    qFindOne.mockResolvedValue({ requirements_json: {}, source_snapshot: { closeAt: '2026-05-01T12:00:00Z', closeDate: '2026-05-09' } });
    expect(await resolveSolicitationCloseDate('dp-1')).toBe('2026-05-01');
  });

  it('falls back to the snapshot closeDate when there is no closeAt', async () => {
    qFindOne.mockResolvedValue({ requirements_json: {}, source_snapshot: { opportunity: { closeDate: '2026-07-04' } } });
    expect(await resolveSolicitationCloseDate('dp-1')).toBe('2026-07-04');
  });

  it('falls back to the AI-vetting opportunity for a ZIP pursuit with no snapshot', async () => {
    qFindOne.mockResolvedValue({ requirements_json: {}, source_snapshot: null, tenant_id: 't-1', canonical_opportunity_id: 'op-1' });
    loadAiVettingView.mockResolvedValue({ opportunity: { closeDate: '2026-08-20' } });
    expect(await resolveSolicitationCloseDate('dp-1')).toBe('2026-08-20');
    expect(loadAiVettingView).toHaveBeenCalledWith('t-1', 'op-1');
  });

  it('returns null when the solicitation records NO close date anywhere (never fabricated)', async () => {
    qFindOne.mockResolvedValue({ requirements_json: {}, source_snapshot: {}, tenant_id: 't-1', canonical_opportunity_id: 'op-1' });
    loadAiVettingView.mockResolvedValue({ opportunity: {} });
    expect(await resolveSolicitationCloseDate('dp-1')).toBeNull();
  });

  it('returns null (fail-soft) when the qualification read throws', async () => {
    qFindOne.mockRejectedValue(new Error('db down'));
    expect(await resolveSolicitationCloseDate('dp-1')).toBeNull();
  });

  it('returns null with no project id, without querying', async () => {
    expect(await resolveSolicitationCloseDate('')).toBeNull();
    expect(qFindOne).not.toHaveBeenCalled();
  });
});
