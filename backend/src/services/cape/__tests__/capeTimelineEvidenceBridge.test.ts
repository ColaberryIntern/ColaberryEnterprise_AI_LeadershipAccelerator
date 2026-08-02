import { recordSkillEvidence } from '../capeEvidenceLedgerService';
import { recomputeStudentArchitectureSkill } from '../capeProficiencyService';
import { defaultSkillImpactForType, recordCapeEvidenceForCompletedCard } from '../capeTimelineEvidenceBridge';

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

const mockRecordEvidence = recordSkillEvidence as unknown as jest.Mock;
const mockRecompute = recomputeStudentArchitectureSkill as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordEvidence.mockResolvedValue({ created: true, id: 'r1', band: 'application', skill_id: 'agents_mcp' });
  mockRecompute.mockResolvedValue({});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('defaultSkillImpactForType', () => {
  it('happy path: an evidence_required type (prompt_lab) maps to application-band credit on a mapped skill', () => {
    const impacts = defaultSkillImpactForType('prompt_lab');
    expect(impacts.length).toBeGreaterThan(0);
    expect(impacts.every((i) => i.band === 'application')).toBe(true);
    expect(impacts.some((i) => i.skill_id === 'prompting')).toBe(true);
  });

  it('happy path: an ai_evaluation, non-evidence_required type with a mapped competency (reflection) maps to knowledge-band credit', () => {
    const impacts = defaultSkillImpactForType('reflection');
    expect(impacts.length).toBeGreaterThan(0);
    expect(impacts.every((i) => i.band === 'knowledge')).toBe(true);
    expect(impacts.some((i) => i.skill_id === 'governance')).toBe(true); // leadership -> governance
  });

  it('documented gap: knowledge_check has NO competencies in the type registry today, so this Phase 0-1 placeholder ' +
     'writes zero evidence for it — real credit for checks/quizzes is Phase 3 (curriculum_skill_maps), not a silent bug here', () => {
    expect(defaultSkillImpactForType('knowledge_check')).toEqual([]);
  });

  it('boundary: a system/gamification type (milestone) has zero competencies and produces zero impacts', () => {
    expect(defaultSkillImpactForType('milestone')).toEqual([]);
  });

  it('boundary: an unknown type slug produces zero impacts (fail-safe, not fail-loud, in this bridge)', () => {
    expect(defaultSkillImpactForType('not_a_real_type')).toEqual([]);
  });

  it('credit is distributed across resolved skills so weights still total the tier credit (not per-skill duplication)', () => {
    // architect_mindset maps to systems_thinking/architecture/decision_making/tradeoffs/ai_governance
    // -> system_design + governance after the inverse map + dedup
    const impacts = defaultSkillImpactForType('architect_mindset');
    const total = impacts.reduce((s, i) => s + i.credit, 0);
    expect(total).toBeCloseTo(12, 1); // evidence_required tier total, split across resolved skills
  });
});

describe('recordCapeEvidenceForCompletedCard', () => {
  it('happy path: writes evidence for a mapped type and recomputes each touched skill exactly once', async () => {
    await recordCapeEvidenceForCompletedCard('e1', { id: 'card-1', type: 'prompt_lab' });
    expect(mockRecordEvidence).toHaveBeenCalled();
    expect(mockRecompute).toHaveBeenCalled();
    // no duplicate recompute calls for the same skill
    const skillArgs = mockRecompute.mock.calls.map((c) => c[1]);
    expect(new Set(skillArgs).size).toBe(skillArgs.length);
  });

  it('happy path: an unmapped/system type writes zero evidence rows and never recomputes', async () => {
    await recordCapeEvidenceForCompletedCard('e1', { id: 'card-2', type: 'milestone' });
    expect(mockRecordEvidence).not.toHaveBeenCalled();
    expect(mockRecompute).not.toHaveBeenCalled();
  });

  it('failure path: a ledger write failure is caught and logged, never thrown', async () => {
    mockRecordEvidence.mockRejectedValue(new Error('db unavailable'));
    await expect(recordCapeEvidenceForCompletedCard('e1', { id: 'card-1', type: 'prompt_lab' })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('idempotency: calling twice for the same enrollment+card issues the same idempotency key both times (findOrCreate at the ledger layer prevents duplication)', async () => {
    await recordCapeEvidenceForCompletedCard('e1', { id: 'card-1', type: 'prompt_lab' });
    await recordCapeEvidenceForCompletedCard('e1', { id: 'card-1', type: 'prompt_lab' });
    const keysCallOne = mockRecordEvidence.mock.calls.slice(0, mockRecordEvidence.mock.calls.length / 2).map((c) => c[0].idempotency_key);
    const keysCallTwo = mockRecordEvidence.mock.calls.slice(mockRecordEvidence.mock.calls.length / 2).map((c) => c[0].idempotency_key);
    expect(keysCallOne).toEqual(keysCallTwo);
  });
});
