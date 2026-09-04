const mockFindOne = jest.fn();
jest.mock('../../../models/CertReadinessSnapshot', () => ({ __esModule: true, default: { findOne: (...a: any[]) => mockFindOne(...a) } }));

import { getCertReadinessField } from '../certReadinessSource';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCertReadinessField', () => {
  it('happy path: reads the most recent real persisted snapshot, never triggers a live compute', async () => {
    mockFindOne.mockResolvedValue({
      id: 'crs1', overall_state: 'approaching', overall_scaled: 72, knowledge_scaled: 75,
      evidence_coverage_pct: 60, weights_available: true, computed_at: new Date('2026-09-01'),
    });

    const field = await getCertReadinessField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ overallState: 'approaching', overallScaled: 72, knowledgeScaled: 75, evidenceCoveragePct: 60, weightsAvailable: true });
    expect(mockFindOne).toHaveBeenCalledWith(expect.objectContaining({ order: [['computed_at', 'DESC']] }));
  });

  it('honesty boundary: weights_available:false is surfaced as-is, never upgraded to false confidence', async () => {
    mockFindOne.mockResolvedValue({
      id: 'crs1', overall_state: 'building', overall_scaled: null, knowledge_scaled: 40,
      evidence_coverage_pct: 10, weights_available: false, computed_at: new Date('2026-09-01'),
    });

    const field = await getCertReadinessField('enrollment-1');

    expect(field.value?.weightsAvailable).toBe(false);
    expect(field.value?.overallScaled).toBeNull();
  });

  it('honesty boundary: no snapshot exists yet is unknown, not a fabricated not_measured score', async () => {
    mockFindOne.mockResolvedValue(null);

    const field = await getCertReadinessField('enrollment-1');

    expect(field.status).toBe('unknown');
    expect(field.value).toBeNull();
    expect(field.reliabilityReason).toContain('No practice-exam');
  });
});
