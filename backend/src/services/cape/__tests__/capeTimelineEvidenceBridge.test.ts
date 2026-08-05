/**
 * capeTimelineEvidenceBridge — CAPE Phase 3 (T011) rewire tests. The bridge now
 * reads the card's STAMPED skill_mapping instead of the retired Phase 0-1
 * COMPETENCY_TO_SKILL placeholder. The single most important regression this suite
 * proves: a knowledge_check completion now writes non-zero, correctly-banded
 * evidence (the exact gap this whole phase exists to close).
 */
jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));
jest.mock('../capeCurriculumSkillMapService', () => ({
  resolveSkillMapping: jest.fn(),
}));
jest.mock('../capeEvidenceLedgerService', () => ({
  __esModule: true,
  recordSkillEvidence: jest.fn(),
  buildIdempotencyKey: {
    timeline: (e: string, c: string, s: string) => `timeline:${e}:${c}:${s}`,
  },
}));
jest.mock('../capeProficiencyService', () => ({
  __esModule: true,
  recomputeStudentArchitectureSkill: jest.fn(),
}));

import TimelineCard from '../../../models/TimelineCard';
import { resolveSkillMapping } from '../capeCurriculumSkillMapService';
import { recordSkillEvidence } from '../capeEvidenceLedgerService';
import { recomputeStudentArchitectureSkill } from '../capeProficiencyService';
import { expandContractToWrites, recordCapeEvidenceForCompletedCard } from '../capeTimelineEvidenceBridge';

const mockFindByPk = TimelineCard.findByPk as unknown as jest.Mock;
const mockResolve = resolveSkillMapping as unknown as jest.Mock;
const mockRecordEvidence = recordSkillEvidence as unknown as jest.Mock;
const mockRecompute = recomputeStudentArchitectureSkill as unknown as jest.Mock;

const KNOWLEDGE_CHECK_CONTRACT = {
  skill_impacts: [
    { skill_id: 'agents_mcp', weight: 0.25, bands: ['knowledge', 'judgment'], credit_strength: 'medium', evidence_required: true, max_credit: 1 },
    { skill_id: 'system_design', weight: 0.25, bands: ['knowledge', 'judgment'], credit_strength: 'medium', evidence_required: true, max_credit: 1 },
    { skill_id: 'eval_guardrails', weight: 0.25, bands: ['knowledge', 'judgment'], credit_strength: 'medium', evidence_required: true, max_credit: 1 },
    { skill_id: 'governance', weight: 0.25, bands: ['knowledge', 'judgment'], credit_strength: 'medium', evidence_required: true, max_credit: 1 },
  ],
  prerequisite_skills: [], recommended_range: { min: 20, max: 70 }, freshness_days: null, reviewable: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordEvidence.mockResolvedValue({ created: true, id: 'r1', band: 'knowledge', skill_id: 'agents_mcp' });
  mockRecompute.mockResolvedValue({});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('expandContractToWrites (pure)', () => {
  it('a single-band impact keeps the ORIGINAL 3-part idempotency key (backward compatible with Phase 0-1 evidence)', () => {
    const contract = { skill_impacts: [{ skill_id: 'prompting', weight: 1, bands: ['application'], credit_strength: 'medium', evidence_required: true, max_credit: 12 }] } as any;
    const writes = expandContractToWrites(contract, 'e1', 'c1', 1);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ skill_id: 'prompting', band: 'application', credit: 12, idempotency_key: 'timeline:e1:c1:prompting', mapping_version: 1 });
  });

  it('a multi-band impact writes one row per band — the first keeps the original key, subsequent bands get a :band suffix', () => {
    const contract = { skill_impacts: [{ skill_id: 'system_design', weight: 1, bands: ['application', 'judgment'], credit_strength: 'capstone', evidence_required: true, max_credit: 25 }] } as any;
    const writes = expandContractToWrites(contract, 'e1', 'c1', 2);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ band: 'application', credit: 25, idempotency_key: 'timeline:e1:c1:system_design' });
    expect(writes[1]).toMatchObject({ band: 'judgment', credit: 25, idempotency_key: 'timeline:e1:c1:system_design:judgment' });
  });

  it('an impact with max_credit:0 or an empty bands array produces no writes', () => {
    const contract = { skill_impacts: [
      { skill_id: 'prompting', weight: 1, bands: ['application'], credit_strength: 'none', evidence_required: false, max_credit: 0 },
      { skill_id: 'rag', weight: 1, bands: [], credit_strength: 'low', evidence_required: false, max_credit: 5 },
    ] } as any;
    expect(expandContractToWrites(contract, 'e1', 'c1', 1)).toEqual([]);
  });

  it('an explicit zero-credit contract (empty skill_impacts) produces no writes', () => {
    expect(expandContractToWrites({ skill_impacts: [] } as any, 'e1', 'c1', 1)).toEqual([]);
  });
});

describe('recordCapeEvidenceForCompletedCard', () => {
  it('THE PHASE 0-1 GAP REGRESSION: a stamped knowledge_check completion now writes non-zero evidence across the correct 4-skill split', async () => {
    mockFindByPk.mockResolvedValue({
      id: 'card-1', type: 'knowledge_check', week: 4,
      skill_mapping: KNOWLEDGE_CHECK_CONTRACT, skill_mapping_version: 1,
    });
    await recordCapeEvidenceForCompletedCard('e1', { id: 'card-1', type: 'knowledge_check' });
    // 4 skills x 2 bands (knowledge + judgment) each = 8 evidence rows.
    expect(mockRecordEvidence).toHaveBeenCalledTimes(8);
    const skillIds = [...new Set(mockRecordEvidence.mock.calls.map((c) => c[0].skill_id))].sort();
    expect(skillIds).toEqual(['agents_mcp', 'eval_guardrails', 'governance', 'system_design']);
    for (const call of mockRecordEvidence.mock.calls) {
      expect(call[0].credit).toBeGreaterThan(0);
      expect(['knowledge', 'judgment']).toContain(call[0].band);
      expect(call[0].mapping_version).toBe(1);
    }
    // Every skill gets both bands written (one row each).
    for (const skillId of skillIds) {
      const bandsForSkill = mockRecordEvidence.mock.calls.filter((c) => c[0].skill_id === skillId).map((c) => c[0].band);
      expect(bandsForSkill.sort()).toEqual(['judgment', 'knowledge']);
    }
    // resolveSkillMapping (the live fallback) must NOT have been called — the card was already stamped.
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('happy path: recomputes each touched skill exactly once, even when a skill appears via multiple bands', async () => {
    mockFindByPk.mockResolvedValue({
      id: 'card-1', type: 'project_task', week: 6,
      skill_mapping: { skill_impacts: [{ skill_id: 'system_design', weight: 1, bands: ['application', 'judgment'], credit_strength: 'capstone', evidence_required: true, max_credit: 25 }] },
      skill_mapping_version: 3,
    });
    await recordCapeEvidenceForCompletedCard('e1', { id: 'card-1', type: 'project_task' });
    expect(mockRecordEvidence).toHaveBeenCalledTimes(2); // 2 bands, same skill
    expect(mockRecompute).toHaveBeenCalledTimes(1); // recomputed once, not twice, for system_design
  });

  it('zero-credit type: a stamped system-group card (empty skill_impacts) writes zero evidence rows and never recomputes', async () => {
    mockFindByPk.mockResolvedValue({ id: 'card-2', type: 'milestone', week: null, skill_mapping: { skill_impacts: [] }, skill_mapping_version: 1 });
    await recordCapeEvidenceForCompletedCard('e1', { id: 'card-2', type: 'milestone' });
    expect(mockRecordEvidence).not.toHaveBeenCalled();
    expect(mockRecompute).not.toHaveBeenCalled();
  });

  it('defensive fallback: an UNSTAMPED card (skill_mapping null) resolves LIVE and logs the fallback event', async () => {
    mockFindByPk.mockResolvedValue({ id: 'card-3', type: 'knowledge_check', week: 4, skill_mapping: null, skill_mapping_version: null });
    mockResolve.mockResolvedValue({ contract: KNOWLEDGE_CHECK_CONTRACT, source: 'type_default', map_id: 'm1', version: 1 });
    await recordCapeEvidenceForCompletedCard('e1', { id: 'card-3', type: 'knowledge_check' });
    expect(mockResolve).toHaveBeenCalledWith({ cardId: 'card-3', typeSlug: 'knowledge_check', weekNumber: 4 });
    expect(mockRecordEvidence).toHaveBeenCalledTimes(8); // 4 skills x 2 bands each
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('cape_evidence_bridge_unstamped_card_fallback'));
  });

  it('boundary: a card deleted between completion and this read is a silent no-op, not a crash', async () => {
    mockFindByPk.mockResolvedValue(null);
    await expect(recordCapeEvidenceForCompletedCard('e1', { id: 'gone', type: 'knowledge_check' })).resolves.toBeUndefined();
    expect(mockRecordEvidence).not.toHaveBeenCalled();
  });

  it('failure path: a ledger write failure is caught and logged, never thrown', async () => {
    mockFindByPk.mockResolvedValue({ id: 'card-1', type: 'knowledge_check', week: 4, skill_mapping: KNOWLEDGE_CHECK_CONTRACT, skill_mapping_version: 1 });
    mockRecordEvidence.mockRejectedValue(new Error('db unavailable'));
    await expect(recordCapeEvidenceForCompletedCard('e1', { id: 'card-1', type: 'knowledge_check' })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('idempotency: calling twice for the same enrollment+card issues the same idempotency keys both times', async () => {
    mockFindByPk.mockResolvedValue({ id: 'card-1', type: 'knowledge_check', week: 4, skill_mapping: KNOWLEDGE_CHECK_CONTRACT, skill_mapping_version: 1 });
    await recordCapeEvidenceForCompletedCard('e1', { id: 'card-1', type: 'knowledge_check' });
    await recordCapeEvidenceForCompletedCard('e1', { id: 'card-1', type: 'knowledge_check' });
    const half = mockRecordEvidence.mock.calls.length / 2;
    const keysCallOne = mockRecordEvidence.mock.calls.slice(0, half).map((c) => c[0].idempotency_key);
    const keysCallTwo = mockRecordEvidence.mock.calls.slice(half).map((c) => c[0].idempotency_key);
    expect(keysCallOne).toEqual(keysCallTwo);
  });
});
