// Mock the models before importing the engine so the import-time
// dependency graph picks up the mocks.
jest.mock('../../models', () => ({
  RequirementsMap: { count: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  ReportingInsight: { create: jest.fn() },
}));

import { RequirementsMap } from '../../models';
import { generateFromGaps } from '../../intelligence/requirements/requirementGenerationEngine';

const countMock = (RequirementsMap as any).count as jest.MockedFunction<any>;
const findOneMock = (RequirementsMap as any).findOne as jest.MockedFunction<any>;
const createMock = (RequirementsMap as any).create as jest.MockedFunction<any>;

const PROJECT_ID = 'proj-1';
const CAP_A = '11111111-aaaa-bbbb-cccc-dddddddddddd';
const CAP_B = '22222222-aaaa-bbbb-cccc-dddddddddddd';
const CYCLE_ID = 'cycle-1';
const METRICS = { reqCoverage: 0, qualityScore: 0, readiness: 0 };

describe('requirementGenerationEngine — scope-aware key generation', () => {
  beforeEach(() => {
    countMock.mockReset();
    findOneMock.mockReset();
    createMock.mockReset();
    // Default: under outstanding cap + no existing rows
    countMock.mockResolvedValue(0);
    findOneMock.mockResolvedValue(null);
    createMock.mockResolvedValue({});
  });

  test('project-scoped template uses AUTO-PROJECT-<suffix> key (no cap prefix)', async () => {
    // INTELLIGENCE-PATTERN-DETECTION is project-scoped — both templates
    // (PATTERN-DETECTION + ANOMALY-ALERTS) should use project-wide keys.
    const gaps: any[] = [{
      gap_id: 'INTELLIGENCE-PATTERN-DETECTION',
      gap_type: 'intelligence',
      title: 'x', description: 'x', signals: [], severity: 7,
      target: 'BP', suggested_category: 'intelligence',
    }];

    await generateFromGaps(gaps, PROJECT_ID, CAP_A, null, CYCLE_ID, METRICS);

    expect(createMock).toHaveBeenCalledTimes(2);
    const createdKeys = createMock.mock.calls.map((c: any) => c[0].requirement_key);
    expect(createdKeys).toEqual(['AUTO-PROJECT-PATTERN-DETECTION', 'AUTO-PROJECT-ANOMALY-ALERTS']);
  });

  test('capability-scoped template uses AUTO-<capId>-<suffix> key (legacy behavior)', async () => {
    // INTELLIGENCE-RECOMMENDATIONS is capability-scoped — each cap gets its own key.
    const gaps: any[] = [{
      gap_id: 'INTELLIGENCE-RECOMMENDATIONS',
      gap_type: 'intelligence',
      title: 'x', description: 'x', signals: [], severity: 7,
      target: 'BP', suggested_category: 'agent',
    }];

    await generateFromGaps(gaps, PROJECT_ID, CAP_A, null, CYCLE_ID, METRICS);

    expect(createMock).toHaveBeenCalledTimes(2);
    const createdKeys = createMock.mock.calls.map((c: any) => c[0].requirement_key);
    // First 8 chars of CAP_A = '11111111', slugified stays '11111111'
    expect(createdKeys).toEqual([
      'AUTO-11111111-SMART-RECOMMENDATIONS',
      'AUTO-11111111-RECOMMENDATION-OUTCOMES',
    ]);
  });

  test('project-scoped template generates ONCE across multiple capabilities (the bug we fixed)', async () => {
    // Simulate: cap A triggers the gap first.
    const gaps: any[] = [{
      gap_id: 'INTELLIGENCE-SIMULATION',
      gap_type: 'intelligence',
      title: 'x', description: 'x', signals: [], severity: 7,
      target: 'BP', suggested_category: 'intelligence',
    }];

    // First call: cap A — no existing row, create 2 (SIMULATION-ENGINE + FORECAST-MODELS).
    findOneMock.mockResolvedValue(null);
    await generateFromGaps(gaps, PROJECT_ID, CAP_A, null, CYCLE_ID, METRICS);
    expect(createMock).toHaveBeenCalledTimes(2);

    // Second call: cap B triggers the same gap — findOne now returns an
    // existing row for the project-scoped key. Dedup should skip both templates.
    createMock.mockClear();
    findOneMock.mockResolvedValue({ id: 'existing-row' });

    const result = await generateFromGaps(gaps, PROJECT_ID, CAP_B, null, CYCLE_ID, METRICS);

    expect(createMock).not.toHaveBeenCalled();
    expect(result.skipped_dedup).toBe(2);
  });

  test('project-scoped template nulls capability_id on the row (platform-level ownership)', async () => {
    const gaps: any[] = [{
      gap_id: 'BEHAVIOR-USER-TRACKING',
      gap_type: 'behavior',
      title: 'x', description: 'x', signals: [], severity: 7,
      target: 'BP', suggested_category: 'frontend',
    }];

    await generateFromGaps(gaps, PROJECT_ID, CAP_A, 'feat-1', CYCLE_ID, METRICS);

    expect(createMock).toHaveBeenCalled();
    const firstCall = createMock.mock.calls[0][0];
    expect(firstCall.capability_id).toBeNull();
    expect(firstCall.feature_id).toBeNull();
    expect(firstCall.project_id).toBe(PROJECT_ID);
  });

  test('capability-scoped template preserves capability_id on the row', async () => {
    const gaps: any[] = [{
      gap_id: 'BEHAVIOR-DECISION-LOGGING',
      gap_type: 'behavior',
      title: 'x', description: 'x', signals: [], severity: 7,
      target: 'BP', suggested_category: 'backend',
    }];

    await generateFromGaps(gaps, PROJECT_ID, CAP_A, 'feat-1', CYCLE_ID, METRICS);

    expect(createMock).toHaveBeenCalled();
    const firstCall = createMock.mock.calls[0][0];
    expect(firstCall.capability_id).toBe(CAP_A);
    expect(firstCall.feature_id).toBe('feat-1');
  });
});
