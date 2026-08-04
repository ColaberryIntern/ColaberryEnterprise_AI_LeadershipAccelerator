import { getLearnerState, findSkillState, CapeLearnerStateError } from '../capeLearnerStateService';
import { getLearnerSkillProfile } from '../capeProficiencyService';
import OnboardingProfile from '../../../models/OnboardingProfile';
import DiagnosticAttempt from '../../../models/DiagnosticAttempt';

jest.mock('../capeProficiencyService', () => ({ getLearnerSkillProfile: jest.fn() }));
jest.mock('../../../models/OnboardingProfile', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/DiagnosticAttempt', () => ({ __esModule: true, default: { findOne: jest.fn() } }));

const mockGetProfile = getLearnerSkillProfile as unknown as jest.Mock;
const mockOnboardingFindOne = OnboardingProfile.findOne as unknown as jest.Mock;
const mockDiagnosticFindOne = DiagnosticAttempt.findOne as unknown as jest.Mock;

function skillEntry(overrides: Record<string, any> = {}) {
  return {
    skill_id: 'agents_mcp', name: 'Agents & MCP', axis_order: 5,
    placement: 0, claim: 0, knowledge: 0, application: 0, judgment: 0,
    proficiency: 0, confidence: 0, next_review_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnboardingFindOne.mockResolvedValue(null);
  mockDiagnosticFindOne.mockResolvedValue(null);
});

describe('getLearnerState — happy path', () => {
  it('composes skill profile + resume goal/role/industry + diagnostic outcome into one snapshot', async () => {
    mockGetProfile.mockResolvedValue({
      skills: [skillEntry({ knowledge: 40, application: 10, judgment: 0 })],
      overall_placement: 12, overall_proficiency: 8, weights_version: 1,
    });
    mockOnboardingFindOne.mockResolvedValue({
      extracted: { role: 'Solutions Engineer', industry: 'Financial Services', goals: 'Become an AI Architect' },
      resume_version: 2,
    });
    mockDiagnosticFindOne.mockResolvedValue({ outcome: 'confirmed' });

    const state = await getLearnerState('enr-1');

    expect(state.enrollment_id).toBe('enr-1');
    expect(state.role).toBe('Solutions Engineer');
    expect(state.industry).toBe('Financial Services');
    expect(state.goal).toBe('Become an AI Architect');
    expect(state.has_resume).toBe(true);
    expect(state.recent_failure).toBe(false);
    expect(state.skills[0].evidence_balance_ratio).toBe(4); // 40 knowledge / 10 application
    expect(state.learner_state_version).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('flags recent_failure true only when the MOST RECENT diagnostic attempt outcome is not_confirmed', async () => {
    mockGetProfile.mockResolvedValue({ skills: [], overall_placement: 0, overall_proficiency: 0, weights_version: null });
    mockDiagnosticFindOne.mockResolvedValue({ outcome: 'not_confirmed' });
    const state = await getLearnerState('enr-2');
    expect(state.recent_failure).toBe(true);
  });
});

describe('getLearnerState — boundary: brand-new learner, zero evidence, no resume (design doc §5/§15)', () => {
  it('produces a valid neutral LearnerState, not a throw', async () => {
    mockGetProfile.mockResolvedValue({ skills: [], overall_placement: 0, overall_proficiency: 0, weights_version: null });
    const state = await getLearnerState('enr-new');
    expect(state.skills).toEqual([]);
    expect(state.goal).toBeNull();
    expect(state.role).toBeNull();
    expect(state.industry).toBeNull();
    expect(state.has_resume).toBe(false);
    expect(state.recent_failure).toBe(false);
  });
});

describe('getLearnerState — failure path', () => {
  it('surfaces a typed CapeLearnerStateError (not a bare catch/swallow) when the skill ledger read fails', async () => {
    mockGetProfile.mockRejectedValue(new Error('DB connection lost'));
    await expect(getLearnerState('enr-3')).rejects.toBeInstanceOf(CapeLearnerStateError);
  });

  it('degrades goal/role/industry to null (fail-soft) rather than throwing when onboarding lookup errors, per Assumption 1', async () => {
    mockGetProfile.mockResolvedValue({ skills: [], overall_placement: 0, overall_proficiency: 0, weights_version: null });
    mockOnboardingFindOne.mockRejectedValue(new Error('timeout'));
    const state = await getLearnerState('enr-4');
    expect(state.goal).toBeNull();
    expect(state.has_resume).toBe(false);
  });

  it('degrades recent_failure to false (fail-soft) rather than throwing when diagnostic lookup errors, per Assumption 5', async () => {
    mockGetProfile.mockResolvedValue({ skills: [], overall_placement: 0, overall_proficiency: 0, weights_version: null });
    mockDiagnosticFindOne.mockRejectedValue(new Error('timeout'));
    const state = await getLearnerState('enr-5');
    expect(state.recent_failure).toBe(false);
  });
});

describe('evidence_balance_ratio — boundary cases', () => {
  it('caps at 5 when application+judgment is zero but knowledge is non-zero (all-consumption, no-build learner)', async () => {
    mockGetProfile.mockResolvedValue({
      skills: [skillEntry({ knowledge: 90, application: 0, judgment: 0 })],
      overall_placement: 0, overall_proficiency: 0, weights_version: null,
    });
    const state = await getLearnerState('enr-6');
    expect(state.skills[0].evidence_balance_ratio).toBe(5);
  });

  it('is 0 when the skill has neither knowledge nor application/judgment evidence', async () => {
    mockGetProfile.mockResolvedValue({
      skills: [skillEntry({ knowledge: 0, application: 0, judgment: 0 })],
      overall_placement: 0, overall_proficiency: 0, weights_version: null,
    });
    const state = await getLearnerState('enr-7');
    expect(state.skills[0].evidence_balance_ratio).toBe(0);
  });
});

describe('findSkillState', () => {
  it('returns the matching skill state by id', async () => {
    mockGetProfile.mockResolvedValue({
      skills: [skillEntry({ skill_id: 'rag' }), skillEntry({ skill_id: 'vectors' })],
      overall_placement: 0, overall_proficiency: 0, weights_version: null,
    });
    const state = await getLearnerState('enr-8');
    expect(findSkillState(state, 'vectors')?.skill_id).toBe('vectors');
    expect(findSkillState(state, 'unknown_skill')).toBeUndefined();
  });
});
