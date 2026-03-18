/**
 * Post-Execution Intelligence Tests
 *
 * Tests capture logic, scoring, governance insight creation,
 * and analytics aggregation.
 */

// ─── Mocks (must be before imports) ─────────────────────────────────

const mockCreate = jest.fn(async (data: any) => ({ id: 'log-1', ...data, get: () => ({ id: 'log-1', ...data }) }));
const mockUpdate = jest.fn(async () => [1]);
const mockFindByPk = jest.fn(async () => null);

jest.mock('../../config/database', () => ({
  sequelize: {
    transaction: jest.fn((fn: any) => fn({ commit: jest.fn() })),
    define: jest.fn(),
    query: jest.fn(async () => []),
  },
}));

jest.mock('../../models/SectionExecutionLog', () => ({
  __esModule: true,
  default: {
    create: mockCreate,
    update: mockUpdate,
    findByPk: mockFindByPk,
    findAll: jest.fn(async () => []),
  },
}));

jest.mock('../../models/ReportingInsight', () => {
  const insightCreate = jest.fn(async (data: any) => ({ id: 'insight-1', ...data }));
  return {
    __esModule: true,
    default: { create: insightCreate },
    _insightCreate: insightCreate,
  };
});

// Models transitively imported by services
jest.mock('../../models/MiniSection', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []), findByPk: jest.fn(async () => null), create: jest.fn(), destroy: jest.fn() },
}));
jest.mock('../../models/VariableDefinition', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []), findOne: jest.fn(async () => null), create: jest.fn(), findOrCreate: jest.fn(async ({ defaults }: any) => [defaults, true]) },
}));
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
jest.mock('../../models', () => ({
  PromptTemplate: { findByPk: jest.fn(async () => null) },
}));

// Service mocks
jest.mock('../../services/llmCallWrapper', () => ({
  callLLMWithAudit: jest.fn(async () => ({
    content: JSON.stringify({ coherence_score: 85, goal_alignment_score: 78, quality_score: 82 }),
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    cacheHit: false,
  })),
}));

jest.mock('../../services/aiEventService', () => ({
  logAiEvent: jest.fn(async () => {}),
  logAgentActivity: jest.fn(async () => {}),
  emitAgentAlert: jest.fn(async () => {}),
}));

jest.mock('../../services/diagnosticsService', () => ({
  runFullDiagnostics: jest.fn(async () => ({
    system_health_score: 95,
    summary: { total_variables: 10, missing_count: 0, timeline_violations: 0, orphaned_count: 0, undefined_count: 0 },
    issues: [],
    scanned_at: new Date().toISOString(),
  })),
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

import {
  captureExecution,
  scoreExecutionOutput,
  createGovernanceInsight,
  ExecutionCapturePayload,
} from '../../services/postExecutionIntelligenceService';
import { callLLMWithAudit } from '../../services/llmCallWrapper';

// ─── Test Helpers ───────────────────────────────────────────────────

function makePayload(overrides: Partial<ExecutionCapturePayload> = {}): ExecutionCapturePayload {
  return {
    enrollment_id: 'enr-1',
    lesson_id: 'lesson-1',
    resolved_prompt: 'Test prompt for AI leadership',
    variables_required: ['industry', 'company_name', 'role'],
    variables_provided: { industry: 'tech', company_name: 'Acme', role: 'CTO' },
    output_text: 'Generated content about AI strategy...',
    output_tokens: 500,
    latency_ms: 3200,
    cache_hit: false,
    model_used: 'gpt-4o-mini',
    lesson_learning_goal: 'Understand AI transformation strategies',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Post-Execution Intelligence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('captureExecution', () => {
    it('logs successful execution with correct status', async () => {
      await captureExecution(makePayload());

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const call = mockCreate.mock.calls[0][0];
      expect(call.execution_status).toBe('success');
      expect(call.enrollment_id).toBe('enr-1');
      expect(call.lesson_id).toBe('lesson-1');
      expect(call.variables_missing_runtime).toEqual([]);
      expect(call.latency_ms).toBe(3200);
      expect(call.cache_hit).toBe(false);
    });

    it('detects missing variables and sets status to partial', async () => {
      await captureExecution(makePayload({
        variables_required: ['industry', 'company_name', 'budget', 'team_size'],
        variables_provided: { industry: 'tech', company_name: 'Acme' },
      }));

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const call = mockCreate.mock.calls[0][0];
      expect(call.execution_status).toBe('partial');
      expect(call.variables_missing_runtime).toEqual(['budget', 'team_size']);
    });

    it('captures failed execution with error message', async () => {
      await captureExecution(makePayload({
        error_message: 'LLM timeout after 30s',
        output_text: '',
      }));

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const call = mockCreate.mock.calls[0][0];
      expect(call.execution_status).toBe('failed');
      expect(call.error_message).toBe('LLM timeout after 30s');
    });
  });

  describe('scoreExecutionOutput', () => {
    it('calls LLM and updates log with parsed scores', async () => {
      await scoreExecutionOutput('log-1', 'Some AI content output', 'Learn AI strategy');

      expect(callLLMWithAudit).toHaveBeenCalledTimes(1);
      const llmCall = (callLLMWithAudit as jest.Mock).mock.calls[0][0];
      expect(llmCall.generationType).toBe('admin_simulation');
      expect(llmCall.step).toBe('post_execution_scoring');
      expect(llmCall.maxTokens).toBe(400);
      expect(llmCall.temperature).toBe(0);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const updates = (mockUpdate as any).mock.calls[0][0];
      expect(updates.quality_score).toBe(82);
      expect(updates.coherence_score).toBe(85);
      expect(updates.goal_alignment_score).toBe(78);
    });
  });

  describe('createGovernanceInsight', () => {
    it('creates critical insight for execution failure', async () => {
      const ReportingInsight = require('../../models/ReportingInsight');
      const insightCreate = ReportingInsight._insightCreate;

      await createGovernanceInsight(
        {
          id: 'log-1',
          enrollment_id: 'enr-1',
          lesson_id: 'lesson-1',
          section_id: null,
          mini_section_id: null,
          prompt_template: null,
          resolved_prompt: 'test',
          variables_required: [],
          variables_provided: {},
          variables_missing_runtime: [],
          output_text: '',
          output_tokens: 0,
          latency_ms: 5000,
          execution_status: 'failed',
          error_message: 'Connection timeout',
          quality_score: null,
          coherence_score: null,
          goal_alignment_score: null,
          model_used: 'gpt-4o-mini',
          cache_hit: false,
        },
        'failure',
      );

      expect(insightCreate).toHaveBeenCalledTimes(1);
      const call = insightCreate.mock.calls[0][0];
      expect(call.insight_type).toBe('risk');
      expect(call.source_agent).toBe('post-execution-intelligence');
      expect(call.entity_type).toBe('curriculum');
      expect(call.alert_severity).toBe('critical');
      expect(call.urgency).toBe(0.8);
    });

    it('creates warning insight for low quality output', async () => {
      const ReportingInsight = require('../../models/ReportingInsight');
      const insightCreate = ReportingInsight._insightCreate;

      await createGovernanceInsight(
        {
          id: 'log-2',
          enrollment_id: 'enr-1',
          lesson_id: 'lesson-2',
          section_id: null,
          mini_section_id: null,
          prompt_template: null,
          resolved_prompt: 'test',
          variables_required: ['industry'],
          variables_provided: { industry: 'tech' },
          variables_missing_runtime: [],
          output_text: 'Poor content',
          output_tokens: 50,
          latency_ms: 2000,
          execution_status: 'success',
          error_message: null,
          quality_score: 35,
          coherence_score: 40,
          goal_alignment_score: 30,
          model_used: 'gpt-4o-mini',
          cache_hit: false,
        },
        'low_quality',
      );

      expect(insightCreate).toHaveBeenCalledTimes(1);
      const call = insightCreate.mock.calls[0][0];
      expect(call.insight_type).toBe('anomaly');
      expect(call.alert_severity).toBe('warning');
      expect(call.urgency).toBe(0.5);
      expect(call.title).toContain('35');
    });
  });

  describe('getRecommendations', () => {
    it('generates variable_fix recommendations for high failure rates', async () => {
      // Mock the analytics service to return variable failures
      jest.doMock('../../services/postExecutionAnalyticsService', () => ({
        getVariableFailureRates: jest.fn(async () => [
          { variable_key: 'budget', times_missing: 50, failure_rate: 55 },
          { variable_key: 'team_size', times_missing: 10, failure_rate: 12 },
        ]),
        getPromptStabilityReport: jest.fn(async () => []),
        getDashboardMetrics: jest.fn(async () => ({
          overall: { total_executions: 100, success_rate: 80, avg_quality: 75, avg_latency_ms: 5000, failed_count: 10, failure_rate: 10 },
          variable_failures: [],
          unstable_prompts: [],
          trend: [],
        })),
      }));

      // Need fresh import after mock override
      const { getRecommendations } = require('../../services/postExecutionRecommendationService');
      const recs = await getRecommendations();

      const budgetRec = recs.find((r: any) => r.type === 'variable_fix' && r.evidence.variable_key === 'budget');
      expect(budgetRec).toBeDefined();
      expect(budgetRec.severity).toBe('high');
      expect(budgetRec.title).toContain('55%');

      // team_size at 12% should NOT be included (below 20% threshold)
      const teamRec = recs.find((r: any) => r.evidence?.variable_key === 'team_size');
      expect(teamRec).toBeUndefined();
    });
  });
});
