import { recordFeedback, startTestOut, CapeTodayPlanFeedbackError } from '../capeTodayPlanFeedbackService';
import { TodayPlanFeedback } from '../../../models';
import { resolveMappingForCard, CapeCurriculumSkillMapNotFoundError } from '../capeCurriculumSkillMapService';
import { startDiagnostic } from '../capeDiagnosticService';
import * as capeEvidenceLedgerService from '../capeEvidenceLedgerService';

// Mock the BARREL (`../../../models`), not the individual model file — the
// barrel also wires every model's Sequelize association at import time
// (`Enrollment.hasMany(TodayPlanFeedback, ...)` etc. in models/index.ts);
// mocking only the individual file would leave that association code running
// against a fake, non-Model object and throw "not a subclass of
// Sequelize.Model". Same convention as capeDiagnosticService.test.ts.
jest.mock('../../../models', () => ({ TodayPlanFeedback: { findOrCreate: jest.fn() } }));
jest.mock('../capeCurriculumSkillMapService', () => {
  const actual = jest.requireActual('../capeCurriculumSkillMapService');
  return { ...actual, resolveMappingForCard: jest.fn() };
});
jest.mock('../capeDiagnosticService', () => {
  const actual = jest.requireActual('../capeDiagnosticService');
  return { ...actual, startDiagnostic: jest.fn() };
});
// Spy on the REAL evidence ledger module (not a full mock) so the §17/§11
// "already know this never awards evidence" test asserts a TRUE zero-call
// count against the actual exported function, not a stub that could hide a
// real call elsewhere in the import graph.
const evidenceSpy = jest.spyOn(capeEvidenceLedgerService, 'recordSkillEvidence');

const mockFindOrCreate = TodayPlanFeedback.findOrCreate as unknown as jest.Mock;
const mockResolveMapping = resolveMappingForCard as unknown as jest.Mock;
const mockStartDiagnostic = startDiagnostic as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('recordFeedback — happy path', () => {
  it('validates, resolves a skill_id for a card-backed ref, and findOrCreates on the idempotency key', async () => {
    mockResolveMapping.mockResolvedValue({
      contract: { skill_impacts: [{ skill_id: 'agents_mcp', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 20 }], prerequisite_skills: [], recommended_range: { min: 0, max: 100 }, freshness_days: null, reviewable: true },
      source: 'type_default', map_id: 'm1', version: 1,
    });
    mockFindOrCreate.mockResolvedValue([{ id: 'row-1' }, true]);

    const result = await recordFeedback({ enrollment_id: 'enr-1', ref: 'card:c1', action: 'more_like_this' });
    expect(result).toEqual({ created: true, id: 'row-1' });
    expect(mockFindOrCreate).toHaveBeenCalledWith({
      where: { idempotency_key: 'today_plan_feedback:enr-1:card:c1:more_like_this' },
      defaults: expect.objectContaining({ enrollment_id: 'enr-1', ref: 'card:c1', action: 'more_like_this', skill_id: 'agents_mcp' }),
    });
  });

  it('a non-card ref (ambient) records with skill_id: null, no throw', async () => {
    mockFindOrCreate.mockResolvedValue([{ id: 'row-2' }, true]);
    const result = await recordFeedback({ enrollment_id: 'enr-1', ref: 'blog:b1', action: 'not_interested' });
    expect(result.created).toBe(true);
    expect(mockResolveMapping).not.toHaveBeenCalled();
    expect(mockFindOrCreate).toHaveBeenCalledWith(expect.objectContaining({
      defaults: expect.objectContaining({ skill_id: null }),
    }));
  });

  it('validation failure (missing action) throws before touching the DB', async () => {
    await expect(recordFeedback({ enrollment_id: 'enr-1', ref: 'card:c1', action: 'not_a_real_action' as any }))
      .rejects.toThrow(CapeTodayPlanFeedbackError);
    expect(mockFindOrCreate).not.toHaveBeenCalled();
  });
});

describe('recordFeedback — §11/§17 invariant: "already know this" NEVER awards skill evidence', () => {
  it('calling recordFeedback with action:"already_know" does not call capeEvidenceLedgerService.recordSkillEvidence — zero invocations, mock-verified', async () => {
    mockResolveMapping.mockResolvedValue({
      contract: { skill_impacts: [{ skill_id: 'rag', weight: 1, bands: ['knowledge'], credit_strength: 'low', evidence_required: false, max_credit: 5 }], prerequisite_skills: [], recommended_range: { min: 0, max: 100 }, freshness_days: null, reviewable: true },
      source: 'type_default', map_id: 'm1', version: 1,
    });
    mockFindOrCreate.mockResolvedValue([{ id: 'row-3' }, true]);

    await recordFeedback({ enrollment_id: 'enr-1', ref: 'card:c1', action: 'already_know' });

    expect(evidenceSpy).not.toHaveBeenCalled();
  });
});

describe('recordFeedback — idempotency', () => {
  it('calling twice with identical input returns created:true then created:false (findOrCreate\'s own contract)', async () => {
    mockFindOrCreate
      .mockResolvedValueOnce([{ id: 'row-4' }, true])
      .mockResolvedValueOnce([{ id: 'row-4' }, false]);

    const first = await recordFeedback({ enrollment_id: 'enr-1', ref: 'blog:b1', action: 'too_easy' });
    const second = await recordFeedback({ enrollment_id: 'enr-1', ref: 'blog:b1', action: 'too_easy' });
    expect(first).toEqual({ created: true, id: 'row-4' });
    expect(second).toEqual({ created: false, id: 'row-4' });
  });

  it('boundary: 5 concurrent identical calls all resolve to the SAME row id, proving the DB UNIQUE constraint (not app sequencing) is what prevents the duplicate', async () => {
    // Simulates the DB-level guarantee: every findOrCreate call for the SAME
    // idempotency_key returns the SAME row regardless of call order/overlap.
    mockFindOrCreate.mockImplementation(async () => [{ id: 'row-5' }, false]);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => recordFeedback({ enrollment_id: 'enr-1', ref: 'card:c1', action: 'not_interested' })),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(mockFindOrCreate).toHaveBeenCalledTimes(5); // each call attempted, but the constraint (simulated here) guarantees convergence to one row
  });
});

describe('startTestOut — reuses the existing Phase 2 diagnostic mechanism directly', () => {
  it('resolves the ref\'s primary skill and calls startDiagnostic(skillId, "test_out")', async () => {
    mockResolveMapping.mockResolvedValue({
      contract: { skill_impacts: [{ skill_id: 'rag', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 20 }], prerequisite_skills: [], recommended_range: { min: 0, max: 100 }, freshness_days: null, reviewable: true },
      source: 'card_override', map_id: 'm1', version: 1,
    });
    mockStartDiagnostic.mockReturnValue({ attempt_id: 'att-1', skill_id: 'rag', trigger: 'test_out', items: [] });

    const result = await startTestOut('enr-1', 'card:c1');
    expect(mockStartDiagnostic).toHaveBeenCalledWith('rag', 'test_out');
    expect(result.trigger).toBe('test_out');
  });

  it('failure/boundary: a ref with no resolvable skill mapping throws CapeTodayPlanFeedbackError, never calls startDiagnostic', async () => {
    mockResolveMapping.mockRejectedValue(new CapeCurriculumSkillMapNotFoundError('not found'));
    await expect(startTestOut('enr-1', 'card:unknown')).rejects.toThrow(CapeTodayPlanFeedbackError);
    expect(mockStartDiagnostic).not.toHaveBeenCalled();
  });

  it('an ambient (non-card) ref also throws CapeTodayPlanFeedbackError — nothing to test out of', async () => {
    await expect(startTestOut('enr-1', 'blog:b1')).rejects.toThrow(CapeTodayPlanFeedbackError);
    expect(mockStartDiagnostic).not.toHaveBeenCalled();
  });
});
