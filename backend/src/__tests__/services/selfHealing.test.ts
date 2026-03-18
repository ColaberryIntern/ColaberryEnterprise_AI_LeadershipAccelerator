/**
 * Self-Healing Service Tests
 *
 * Tests safety gates, status transitions, LLM prompt rewrite,
 * variable fix creation, and governance insight logging.
 */

// ─── Mocks (must be before imports) ─────────────────────────────────

const mockHealingPlanCreate = jest.fn(async (data: any) => ({
  id: 'plan-1',
  ...data,
  get: () => ({ id: 'plan-1', ...data }),
  update: jest.fn(async (updates: any) => {
    Object.assign(data, updates);
  }),
}));

const mockHealingPlanFindByPk = jest.fn();
const mockHealingPlanFindAll = jest.fn(async () => []);

jest.mock('../../models/HealingPlan', () => ({
  __esModule: true,
  default: {
    create: mockHealingPlanCreate,
    findByPk: mockHealingPlanFindByPk,
    findAll: mockHealingPlanFindAll,
  },
}));

const mockMiniSectionFindAll = jest.fn(async () => []);
const mockMiniSectionFindByPk = jest.fn(async () => null);
const mockMiniSectionUpdate = jest.fn(async () => [1]);

jest.mock('../../models/MiniSection', () => ({
  __esModule: true,
  default: {
    findAll: mockMiniSectionFindAll,
    findByPk: mockMiniSectionFindByPk,
    update: mockMiniSectionUpdate,
  },
}));

const mockVarDefFindOrCreate = jest.fn(async ({ defaults }: any) => [defaults, true]);

jest.mock('../../models/VariableDefinition', () => ({
  __esModule: true,
  default: {
    findOrCreate: mockVarDefFindOrCreate,
    findAll: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    create: jest.fn(),
  },
}));

const mockInsightCreate = jest.fn(async (data: any) => ({ id: 'insight-1', ...data }));

jest.mock('../../models/ReportingInsight', () => ({
  __esModule: true,
  default: { create: mockInsightCreate },
}));

jest.mock('../../config/database', () => ({
  sequelize: {
    transaction: jest.fn((fn: any) => fn({ commit: jest.fn() })),
    define: jest.fn(),
    query: jest.fn(async () => []),
  },
}));

// Model transitive mocks
jest.mock('../../models/CurriculumModule', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []) },
}));
jest.mock('../../models/CurriculumLesson', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []) },
}));
jest.mock('../../models/ArtifactDefinition', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));
jest.mock('../../models/SkillDefinition', () => ({
  __esModule: true,
  default: { findOne: jest.fn(async () => null), create: jest.fn(async (data: any) => data) },
}));
jest.mock('../../models/CurriculumTypeDefinition', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []) },
}));
jest.mock('../../models/SectionExecutionLog', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    update: jest.fn(),
    findByPk: jest.fn(async () => null),
    findAll: jest.fn(async () => []),
  },
}));
jest.mock('../../models', () => ({
  PromptTemplate: { findByPk: jest.fn(async () => null) },
  HealingPlan: {
    create: mockHealingPlanCreate,
    findByPk: mockHealingPlanFindByPk,
    findAll: mockHealingPlanFindAll,
  },
}));

// Service mocks
jest.mock('../../services/diagnosticsService', () => ({
  runFullDiagnostics: jest.fn(async () => ({
    system_health_score: 85,
    summary: { total_variables: 10, missing_count: 0, timeline_violations: 0, orphaned_count: 0, undefined_count: 0 },
    issues: [],
    scanned_at: new Date().toISOString(),
  })),
  getRuntimeInsights: jest.fn(async () => ({
    runtime_failure_rate: 5,
    avg_quality_score: 75,
    recent_failures: 2,
    runtime_health_penalty: 0,
  })),
}));

jest.mock('../../services/postExecutionAnalyticsService', () => ({
  getPromptStabilityReport: jest.fn(async () => []),
  getVariableFailureRates: jest.fn(async () => []),
  getDashboardMetrics: jest.fn(async () => ({
    overall: { total_executions: 100, success_rate: 80, avg_quality: 75, avg_latency_ms: 5000, failed_count: 10, failure_rate: 10 },
    variable_failures: [],
    unstable_prompts: [],
    trend: [],
  })),
  getSectionPerformance: jest.fn(async () => ({})),
}));

jest.mock('../../services/variableFlowService', () => ({
  getVariableReconciliation: jest.fn(async () => ({ undefined_refs: [], orphaned_defs: [] })),
  getVariableFlowMap: jest.fn(async () => []),
  extractVariableRefs: jest.fn(() => []),
  SYSTEM_VARIABLE_KEYS: ['industry', 'company_name', 'role'],
  getSectionVariableFlow: jest.fn(async () => ({ available: [], required: [], produced: [], missing: [] })),
  validateSectionExecutionReadiness: jest.fn(async () => ({ isReady: true, missingVariables: [], timelineViolations: [], blocking: false })),
  syncVariableKeysFromPrompts: jest.fn(async () => []),
  propagateVariableKeysToLesson: jest.fn(async () => {}),
}));

jest.mock('../../services/llmCallWrapper', () => ({
  callLLMWithAudit: jest.fn(async () => ({
    content: JSON.stringify({
      improved_prompt: 'Improved prompt for AI leadership...',
      changes_explanation: 'Added structure and clarity.',
    }),
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    cacheHit: false,
  })),
}));

jest.mock('../../services/aiEventService', () => ({
  logAiEvent: jest.fn(async () => {}),
  logAgentActivity: jest.fn(async () => {}),
  emitAgentAlert: jest.fn(async () => {}),
}));

jest.mock('../../services/qualityScoringService', () => ({
  scoreMiniSection: jest.fn(async () => ({ overall: 80 })),
}));

jest.mock('../../services/variableService', () => ({
  getAllVariables: jest.fn(async () => ({})),
}));

jest.mock('../../services/structureGenerationService', () => ({
  generateComprehensiveBlueprint: jest.fn(),
  applySectionBlueprint: jest.fn(),
  __esModule: true,
}));

jest.mock('../../services/postExecutionRecommendationService', () => ({
  getRecommendations: jest.fn(async () => []),
}));

// ─── Imports ────────────────────────────────────────────────────────

import {
  generateHealingPlan,
  previewHealingPlan,
  applyHealingPlan,
  rejectHealingPlan,
} from '../../services/selfHealingService';
import { callLLMWithAudit } from '../../services/llmCallWrapper';
import { getPromptStabilityReport, getVariableFailureRates } from '../../services/postExecutionAnalyticsService';
import { getVariableReconciliation, getVariableFlowMap } from '../../services/variableFlowService';

// ─── Helpers ────────────────────────────────────────────────────────

function makePlanInstance(overrides: any = {}) {
  const data = {
    id: 'plan-1',
    status: 'draft',
    overall_risk_level: 'low',
    source_diagnostics: {},
    actions: [],
    governance_insight_id: null,
    rejection_reason: null,
    applied_action_ids: null,
    created_at: new Date(),
    applied_at: null,
    updated_at: new Date(),
    ...overrides,
  };
  return {
    ...data,
    get: (opts?: any) => ({ ...data }),
    update: jest.fn(async (updates: any) => {
      Object.assign(data, updates);
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Self-Healing Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Safety: blocked actions cannot be applied', () => {
    it('skips flow_adjustment actions during apply', async () => {
      const plan = makePlanInstance({
        status: 'preview',
        actions: [
          {
            id: 'act-1',
            action_type: 'flow_adjustment',
            target_id: 'budget',
            target_label: '{{budget}} timeline',
            description: 'Timeline violation',
            risk_level: 'high',
            blocked: true,
            block_reason: 'Requires structural change',
            status: 'pending',
            evidence: {},
          },
        ],
      });

      mockHealingPlanFindByPk.mockResolvedValueOnce(plan);

      const result = await applyHealingPlan('plan-1', ['act-1']);
      const skippedAction = result.actions.find((a: any) => a.id === 'act-1');
      expect(skippedAction!.status).toBe('skipped');
      expect(mockMiniSectionUpdate).not.toHaveBeenCalled();
      expect(mockVarDefFindOrCreate).not.toHaveBeenCalled();
    });
  });

  describe('Safety: prompt_rewrite thresholds', () => {
    it('does NOT generate prompt_rewrite when quality above threshold', async () => {
      (getPromptStabilityReport as jest.Mock).mockResolvedValueOnce([
        { lesson_id: 'l-1', lesson_title: 'Test Lesson', total_executions: 10, failure_rate: 5, avg_quality_score: 60, is_unstable: true },
      ]);

      const result = await generateHealingPlan();
      const promptActions = result.actions.filter((a: any) => a.action_type === 'prompt_rewrite');
      expect(promptActions).toHaveLength(0);
    });

    it('does NOT generate prompt_rewrite when executions below minimum', async () => {
      (getPromptStabilityReport as jest.Mock).mockResolvedValueOnce([
        { lesson_id: 'l-1', lesson_title: 'Test Lesson', total_executions: 2, failure_rate: 50, avg_quality_score: 30, is_unstable: true },
      ]);

      const result = await generateHealingPlan();
      const promptActions = result.actions.filter((a: any) => a.action_type === 'prompt_rewrite');
      expect(promptActions).toHaveLength(0);
    });

    it('generates prompt_rewrite when both thresholds met', async () => {
      (getPromptStabilityReport as jest.Mock).mockResolvedValueOnce([
        { lesson_id: 'l-1', lesson_title: 'Test Lesson', total_executions: 5, failure_rate: 40, avg_quality_score: 30, is_unstable: true },
      ]);

      mockMiniSectionFindAll.mockResolvedValueOnce([
        { id: 'ms-1', title: 'Reality Check', concept_prompt_user: 'Analyze AI impact on {{industry}}', lesson_id: 'l-1', is_active: true, settings_json: {} },
      ] as any);

      const result = await generateHealingPlan();
      const promptActions = result.actions.filter((a: any) => a.action_type === 'prompt_rewrite');
      expect(promptActions.length).toBeGreaterThan(0);
      expect(promptActions[0].before_value).toBe('Analyze AI impact on {{industry}}');
      expect(promptActions[0].risk_level).toBe('low');
      expect(promptActions[0].blocked).toBe(false);
    });
  });

  describe('Safety: variable_fix thresholds', () => {
    it('does NOT generate variable_fix when failure rate below 20%', async () => {
      (getVariableFailureRates as jest.Mock).mockResolvedValueOnce([
        { variable_key: 'budget', times_missing: 5, failure_rate: 15 },
      ]);
      (getVariableReconciliation as jest.Mock).mockResolvedValueOnce({
        undefined_refs: [{ key: 'budget', used_in_sections: ['Lesson 1'] }],
        orphaned_defs: [],
      });

      const result = await generateHealingPlan();
      const varActions = result.actions.filter((a: any) => a.action_type === 'variable_fix');
      expect(varActions).toHaveLength(0);
    });

    it('generates variable_fix when failure rate above 20%', async () => {
      (getVariableFailureRates as jest.Mock).mockResolvedValueOnce([
        { variable_key: 'budget', times_missing: 30, failure_rate: 25 },
      ]);
      (getVariableReconciliation as jest.Mock).mockResolvedValueOnce({
        undefined_refs: [{ key: 'budget', used_in_sections: ['Lesson 1'] }],
        orphaned_defs: [],
      });

      const result = await generateHealingPlan();
      const varActions = result.actions.filter((a: any) => a.action_type === 'variable_fix');
      expect(varActions).toHaveLength(1);
      expect(varActions[0].target_label).toBe('{{budget}}');
      expect(varActions[0].after_value.key).toBe('budget');
    });
  });

  describe('Prompt rewrite calls LLM correctly', () => {
    it('uses correct LLM parameters during preview', async () => {
      const plan = makePlanInstance({
        status: 'draft',
        actions: [
          {
            id: 'act-1',
            action_type: 'prompt_rewrite',
            target_id: 'ms-1',
            target_label: 'Reality Check → concept prompt user',
            prompt_field: 'concept_prompt_user',
            description: 'Rewrite',
            risk_level: 'low',
            blocked: false,
            status: 'pending',
            before_value: 'Original prompt text',
            after_value: null,
            evidence: { avg_quality_score: 30, failure_rate: 40, total_executions: 10, lesson_title: 'Test' },
          },
        ],
      });

      mockHealingPlanFindByPk.mockResolvedValueOnce(plan);
      mockMiniSectionFindByPk.mockResolvedValueOnce({
        id: 'ms-1',
        settings_json: { learning_goal: 'Understand AI strategy' },
      } as any);

      await previewHealingPlan('plan-1');

      expect(callLLMWithAudit).toHaveBeenCalledTimes(1);
      const llmCall = (callLLMWithAudit as jest.Mock).mock.calls[0][0];
      expect(llmCall.generationType).toBe('admin_simulation');
      expect(llmCall.step).toBe('self_healing_prompt_rewrite');
      expect(llmCall.model).toBe('gpt-4o-mini');
      expect(llmCall.temperature).toBe(0.3);
      expect(llmCall.maxTokens).toBe(2000);
    });
  });

  describe('Variable fix creates definition on apply', () => {
    it('calls VariableDefinition.findOrCreate with correct defaults', async () => {
      const plan = makePlanInstance({
        status: 'preview',
        actions: [
          {
            id: 'act-1',
            action_type: 'variable_fix',
            target_id: 'budget',
            target_label: '{{budget}}',
            description: 'Create missing definition',
            risk_level: 'low',
            blocked: false,
            status: 'pending',
            before_value: null,
            after_value: {
              key: 'budget',
              display_name: 'Budget',
              data_type: 'text',
              scope: 'program',
              source_type: 'llm_output',
            },
            evidence: { failure_rate: 30, times_missing: 20 },
          },
        ],
      });

      mockHealingPlanFindByPk.mockResolvedValueOnce(plan);

      await applyHealingPlan('plan-1', ['act-1']);

      expect(mockVarDefFindOrCreate).toHaveBeenCalledTimes(1);
      const call = mockVarDefFindOrCreate.mock.calls[0][0];
      expect(call.where.variable_key).toBe('budget');
      expect(call.defaults.display_name).toBe('Budget');
      expect(call.defaults.scope).toBe('program');
    });
  });

  describe('Governance insight created on apply', () => {
    it('creates ReportingInsight with correct source_agent', async () => {
      const plan = makePlanInstance({
        status: 'preview',
        actions: [
          {
            id: 'act-1',
            action_type: 'variable_fix',
            target_id: 'budget',
            target_label: '{{budget}}',
            description: 'Fix',
            risk_level: 'low',
            blocked: false,
            status: 'pending',
            before_value: null,
            after_value: { key: 'budget', display_name: 'Budget', data_type: 'text', scope: 'program', source_type: 'llm_output' },
            evidence: {},
          },
        ],
      });

      mockHealingPlanFindByPk.mockResolvedValueOnce(plan);

      await applyHealingPlan('plan-1', ['act-1']);

      expect(mockInsightCreate).toHaveBeenCalledTimes(1);
      const insight = mockInsightCreate.mock.calls[0][0];
      expect(insight.source_agent).toBe('self-healing-engine');
      expect(insight.entity_type).toBe('curriculum');
      expect(insight.insight_type).toBe('pattern');
      expect(insight.alert_severity).toBe('info');
    });
  });

  describe('Plan status transitions', () => {
    it('transitions draft → preview via previewHealingPlan', async () => {
      const plan = makePlanInstance({ status: 'draft', actions: [] });
      mockHealingPlanFindByPk.mockResolvedValueOnce(plan);

      const result = await previewHealingPlan('plan-1');
      expect(result.status).toBe('preview');
    });

    it('transitions preview → applied when all actions applied', async () => {
      const plan = makePlanInstance({
        status: 'preview',
        actions: [
          {
            id: 'act-1',
            action_type: 'variable_fix',
            target_id: 'x',
            target_label: '{{x}}',
            description: 'Fix',
            risk_level: 'low',
            blocked: false,
            status: 'pending',
            before_value: null,
            after_value: { key: 'x', display_name: 'X', data_type: 'text', scope: 'program', source_type: 'llm_output' },
            evidence: {},
          },
        ],
      });

      mockHealingPlanFindByPk.mockResolvedValueOnce(plan);

      const result = await applyHealingPlan('plan-1', ['act-1']);
      expect(result.status).toBe('applied');
    });

    it('transitions draft → rejected via rejectHealingPlan', async () => {
      const plan = makePlanInstance({ status: 'draft', actions: [
        { id: 'act-1', action_type: 'variable_fix', status: 'pending', blocked: false, evidence: {} },
      ] });
      mockHealingPlanFindByPk.mockResolvedValueOnce(plan);

      const result = await rejectHealingPlan('plan-1', 'Not needed');
      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toBe('Not needed');
      expect(result.actions[0].status).toBe('rejected');
    });

    it('throws when trying to preview a non-draft plan', async () => {
      const plan = makePlanInstance({ status: 'applied', actions: [] });
      mockHealingPlanFindByPk.mockResolvedValueOnce(plan);

      await expect(previewHealingPlan('plan-1')).rejects.toThrow("Plan must be in 'draft' status to preview");
    });

    it('throws when trying to apply a non-preview plan', async () => {
      const plan = makePlanInstance({ status: 'draft', actions: [] });
      mockHealingPlanFindByPk.mockResolvedValueOnce(plan);

      await expect(applyHealingPlan('plan-1', [])).rejects.toThrow("Plan must be in 'preview' status to apply");
    });
  });

  describe('Max actions enforced', () => {
    it('caps actions at MAX_ACTIONS_PER_PLAN (10)', async () => {
      // Generate 15 unstable lessons with mini-sections
      const unstableLessons = Array.from({ length: 15 }, (_, i) => ({
        lesson_id: `l-${i}`,
        lesson_title: `Lesson ${i}`,
        total_executions: 10,
        failure_rate: 50,
        avg_quality_score: 25,
        is_unstable: true,
      }));

      (getPromptStabilityReport as jest.Mock).mockResolvedValueOnce(unstableLessons);

      // Each lesson has one mini-section with a prompt
      mockMiniSectionFindAll.mockImplementation(async () => [
        { id: `ms-${Math.random()}`, title: 'Section', concept_prompt_user: 'Some prompt', lesson_id: 'l-x', is_active: true, settings_json: {} },
      ] as any);

      const result = await generateHealingPlan();
      expect(result.actions.length).toBeLessThanOrEqual(10);
    });
  });
});
