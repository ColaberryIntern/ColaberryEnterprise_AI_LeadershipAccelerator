/**
 * Curriculum Generation Engine Tests
 *
 * Tests governance analysis (pure function), skeleton validation,
 * and generation pipeline safety gates.
 *
 * analyzeGovernance is a pure function — no mocks needed for those tests.
 * Skeleton generation tests mock the LLM call.
 */

// ─── Mocks (must be before imports) ─────────────────────────────────

// Database
jest.mock('../../config/database', () => ({
  sequelize: { transaction: jest.fn((fn: any) => fn({ commit: jest.fn() })), define: jest.fn() },
}));

// Models — needed transitively by variableFlowService, diagnosticsService, etc.
jest.mock('../../models/CurriculumModule', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []), create: jest.fn() },
}));
jest.mock('../../models/CurriculumLesson', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []), create: jest.fn(), update: jest.fn(async () => [1]) },
}));
jest.mock('../../models/MiniSection', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []), findByPk: jest.fn(async () => null), create: jest.fn(), destroy: jest.fn() },
}));
jest.mock('../../models/VariableDefinition', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []), findOne: jest.fn(async () => null), create: jest.fn(), findOrCreate: jest.fn(async ({ defaults }: any) => [defaults, true]) },
}));
jest.mock('../../models/ReportingInsight', () => ({
  __esModule: true,
  default: { create: jest.fn() },
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

// Services
jest.mock('../../services/llmCallWrapper', () => ({
  callLLMWithAudit: jest.fn(),
}));

jest.mock('../../services/structureGenerationService', () => ({
  generateComprehensiveBlueprint: jest.fn(),
  applySectionBlueprint: jest.fn(),
  __esModule: true,
}));

// Mock diagnosticsService for approval post-commit check
jest.mock('../../services/diagnosticsService', () => ({
  runFullDiagnostics: jest.fn(async () => ({
    system_health_score: 95,
    summary: { total_variables: 10, missing_count: 0, timeline_violations: 0, orphaned_count: 0, undefined_count: 0 },
    issues: [],
    scanned_at: new Date().toISOString(),
  })),
}));

// Mock models index (for autoRepairService transitive)
jest.mock('../../models', () => ({
  PromptTemplate: { findByPk: jest.fn(async () => null) },
}));

// Mock qualityScoringService (transitive from autoRepairService)
jest.mock('../../services/qualityScoringService', () => ({
  scoreMiniSection: jest.fn(async () => ({ overall: 80 })),
}));

// Mock variableService (transitive from variableTraceService)
jest.mock('../../services/variableService', () => ({
  getAllVariables: jest.fn(async () => ({})),
}));

import {
  analyzeGovernance,
  generateCurriculumSkeleton,
  CurriculumSkeleton,
  CurriculumGenerationInput,
  LessonBlueprintPreview,
  GovernanceReport,
} from '../../services/curriculumGenerationService';
import { callLLMWithAudit } from '../../services/llmCallWrapper';
import { GeneratedBlueprint } from '../../services/structureGenerationService';

// ─── Test Data Builders ─────────────────────────────────────────────

const baseInput: CurriculumGenerationInput = {
  program_id: 'prog-1',
  cohort_id: 'cohort-1',
  program_name: 'Test Program',
  program_description: 'A test program for AI leadership',
  target_modules: 2,
  lessons_per_module: 2,
  variables: {
    industry: 'technology',
    company_name: 'TestCorp',
    role: 'CTO',
  },
};

function makeSkeleton(modules: { module_number: number; lessons: { lesson_number: number; title: string; temp_id: string }[] }[]): CurriculumSkeleton {
  return {
    generated_at: new Date().toISOString(),
    input: baseInput,
    modules: modules.map(m => ({
      temp_id: `mod-${m.module_number}`,
      module_number: m.module_number,
      title: `Module ${m.module_number}`,
      description: 'Test module',
      skill_area: 'strategy_trust',
      lessons: m.lessons.map(l => ({
        temp_id: l.temp_id,
        lesson_number: l.lesson_number,
        title: l.title,
        description: 'Test lesson',
        lesson_type: 'section' as const,
        estimated_minutes: 25,
        learning_goal: 'Test goal',
        structure_prompt: `Explore AI for {{industry}} at {{company_name}}`,
      })),
    })),
    total_lessons: modules.reduce((sum, m) => sum + m.lessons.length, 0),
    total_modules: modules.length,
  };
}

function makeBlueprint(produces: string[], consumes: string[], skillDomain = 'strategy_trust'): GeneratedBlueprint {
  return {
    mini_sections: [
      {
        type: 'executive_reality_check',
        student_label: 'Concept Snapshot',
        title: 'Test Section',
        description: consumes.map(c => `Using {{${c}}}`).join('. '),
        learning_goal: 'Test',
        section_prompt: `Skill domain: ${skillDomain}.`,
        skill_domain: skillDomain,
        variables: produces.map(p => ({ key: p, display_name: p, description: `var ${p}` })),
        artifact: null,
        knowledge_check_config: null,
      },
      { type: 'ai_strategy', student_label: 'AI Strategy', title: 'T2', description: '', learning_goal: '', section_prompt: '', skill_domain: skillDomain, variables: [], artifact: null, knowledge_check_config: null },
      { type: 'prompt_template', student_label: 'Prompt Template', title: 'T3', description: '', learning_goal: '', section_prompt: '', skill_domain: skillDomain, variables: [], artifact: null, knowledge_check_config: null },
      { type: 'implementation_task', student_label: 'Implementation Task', title: 'T4', description: '', learning_goal: '', section_prompt: '', skill_domain: skillDomain, variables: [], artifact: null, knowledge_check_config: null },
      { type: 'knowledge_check', student_label: 'Knowledge Check', title: 'T5', description: '', learning_goal: '', section_prompt: '', skill_domain: skillDomain, variables: [], artifact: null, knowledge_check_config: null },
    ],
    skill_domain: skillDomain,
  };
}

function makeBlueprintPreview(tempId: string, title: string, produces: string[], consumes: string[]): LessonBlueprintPreview {
  return {
    lesson_temp_id: tempId,
    lesson_title: title,
    blueprint: makeBlueprint(produces, consumes),
    variable_flow: { produces, consumes },
  };
}

function makeFailedBlueprintPreview(tempId: string, title: string): LessonBlueprintPreview {
  return {
    lesson_temp_id: tempId,
    lesson_title: title,
    blueprint: { mini_sections: [], skill_domain: 'unknown' },
    variable_flow: { produces: [], consumes: [] },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Curriculum Generation Engine', () => {

  describe('analyzeGovernance', () => {

    it('returns health=100 and can_approve=true for clean flow', () => {
      const skeleton = makeSkeleton([
        { module_number: 1, lessons: [{ lesson_number: 1, title: 'L1', temp_id: 'l1' }] },
        { module_number: 2, lessons: [{ lesson_number: 1, title: 'L2', temp_id: 'l2' }] },
      ]);
      const blueprints = [
        makeBlueprintPreview('l1', 'L1', ['ai_strategy_output'], []),
        makeBlueprintPreview('l2', 'L2', [], ['ai_strategy_output']),
      ];

      const report = analyzeGovernance(skeleton, blueprints);

      expect(report.health_score).toBe(100);
      expect(report.can_approve).toBe(true);
      expect(report.missing_variables).toEqual([]);
      expect(report.timeline_violations).toEqual([]);
      expect(report.block_reasons).toEqual([]);
      expect(report.risk_level).toBe('low');
    });

    it('detects missing variables and blocks approval', () => {
      const skeleton = makeSkeleton([
        { module_number: 1, lessons: [{ lesson_number: 1, title: 'L1', temp_id: 'l1' }] },
      ]);
      const blueprints = [
        makeBlueprintPreview('l1', 'L1', [], ['nonexistent_var', 'another_missing']),
      ];

      const report = analyzeGovernance(skeleton, blueprints);

      expect(report.missing_variables).toContain('nonexistent_var');
      expect(report.missing_variables).toContain('another_missing');
      expect(report.can_approve).toBe(false);
      expect(report.health_score).toBe(90); // 100 - 5*2
      expect(report.block_reasons.length).toBeGreaterThan(0);
    });

    it('detects timeline violations', () => {
      const skeleton = makeSkeleton([
        { module_number: 1, lessons: [{ lesson_number: 1, title: 'L1', temp_id: 'l1' }] },
        { module_number: 3, lessons: [{ lesson_number: 1, title: 'L2', temp_id: 'l2' }] },
      ]);
      // L1 consumes 'plan' but L2 produces it (later in order)
      const blueprints = [
        makeBlueprintPreview('l1', 'L1', [], ['plan']),
        makeBlueprintPreview('l2', 'L2', ['plan'], []),
      ];

      const report = analyzeGovernance(skeleton, blueprints);

      expect(report.timeline_violations).toContain('plan');
      expect(report.can_approve).toBe(false);
    });

    it('does not flag system variables as missing', () => {
      const skeleton = makeSkeleton([
        { module_number: 1, lessons: [{ lesson_number: 1, title: 'L1', temp_id: 'l1' }] },
      ]);
      // Consumes company_name and industry — both system vars
      const blueprints = [
        makeBlueprintPreview('l1', 'L1', [], ['company_name', 'industry', 'role']),
      ];

      const report = analyzeGovernance(skeleton, blueprints);

      expect(report.missing_variables).toEqual([]);
      expect(report.can_approve).toBe(true);
      expect(report.health_score).toBe(100);
    });

    it('blocks approval when health score < 70', () => {
      const skeleton = makeSkeleton([
        { module_number: 1, lessons: [{ lesson_number: 1, title: 'L1', temp_id: 'l1' }] },
      ]);
      // 7 missing variables = -35 points → health 65
      const manyMissing = Array.from({ length: 7 }, (_, i) => `missing_var_${i}`);
      const blueprints = [
        makeBlueprintPreview('l1', 'L1', [], manyMissing),
      ];

      const report = analyzeGovernance(skeleton, blueprints);

      expect(report.health_score).toBe(65); // 100 - 7*5
      expect(report.can_approve).toBe(false);
      expect(report.block_reasons).toEqual(
        expect.arrayContaining([expect.stringContaining('below minimum threshold')])
      );
    });

    it('reports orphaned variables as warnings (non-blocking)', () => {
      const skeleton = makeSkeleton([
        { module_number: 1, lessons: [{ lesson_number: 1, title: 'L1', temp_id: 'l1' }] },
      ]);
      // Produces orphan_var but nothing consumes it
      const blueprints = [
        makeBlueprintPreview('l1', 'L1', ['orphan_var'], []),
      ];

      const report = analyzeGovernance(skeleton, blueprints);

      expect(report.orphaned_variables).toContain('orphan_var');
      expect(report.warnings.length).toBeGreaterThan(0);
      // Orphaned is a warning, not a blocker (health = 100 - 3 = 97)
      expect(report.health_score).toBe(97);
      expect(report.can_approve).toBe(true);
    });

    it('classifies risk level correctly', () => {
      // health < 50 → high
      const skeleton = makeSkeleton([
        { module_number: 1, lessons: [{ lesson_number: 1, title: 'L1', temp_id: 'l1' }] },
      ]);
      // 11 missing = -55 → health 45
      const manyMissing = Array.from({ length: 11 }, (_, i) => `m_${i}`);
      const blueprints = [
        makeBlueprintPreview('l1', 'L1', [], manyMissing),
      ];

      const report = analyzeGovernance(skeleton, blueprints);

      expect(report.health_score).toBe(45);
      expect(report.risk_level).toBe('high');
    });

    it('lowers confidence score when blueprints fail', () => {
      const skeleton = makeSkeleton([
        { module_number: 1, lessons: [
          { lesson_number: 1, title: 'L1', temp_id: 'l1' },
          { lesson_number: 2, title: 'L2', temp_id: 'l2' },
        ]},
      ]);
      const blueprints = [
        makeBlueprintPreview('l1', 'L1', [], []),
        makeFailedBlueprintPreview('l2', 'L2'),
      ];

      const report = analyzeGovernance(skeleton, blueprints);

      expect(report.confidence_score).toBe(0.5); // 1 of 2 succeeded
      expect(report.can_approve).toBe(false); // failed blueprint blocks
      expect(report.block_reasons).toEqual(
        expect.arrayContaining([expect.stringContaining('failed blueprint')])
      );
    });

    it('does not flag input variables as missing', () => {
      const skeleton = makeSkeleton([
        { module_number: 1, lessons: [{ lesson_number: 1, title: 'L1', temp_id: 'l1' }] },
      ]);
      // input.variables has 'industry', 'company_name', 'role'
      // Plus a custom input variable we add
      skeleton.input.variables = { ...skeleton.input.variables, custom_goal: 'reduce costs' };
      const blueprints = [
        makeBlueprintPreview('l1', 'L1', [], ['custom_goal']),
      ];

      const report = analyzeGovernance(skeleton, blueprints);

      expect(report.missing_variables).toEqual([]);
      expect(report.can_approve).toBe(true);
    });
  });

  describe('generateCurriculumSkeleton', () => {

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('validates LLM output and returns correct structure', async () => {
      const mockResponse = {
        content: JSON.stringify({
          modules: [
            {
              module_number: 1, title: 'Module 1', description: 'Desc 1', skill_area: 'strategy_trust',
              lessons: [
                { lesson_number: 1, title: 'L1', description: 'D1', learning_goal: 'Analyze X', estimated_minutes: 25, structure_prompt: 'Explore AI transformation for {{industry}} executives' },
                { lesson_number: 2, title: 'L2', description: 'D2', learning_goal: 'Design Y', estimated_minutes: 30, structure_prompt: 'Build an AI strategy for {{company_name}} in {{industry}}' },
              ],
            },
            {
              module_number: 2, title: 'Module 2', description: 'Desc 2', skill_area: 'governance',
              lessons: [
                { lesson_number: 1, title: 'L3', description: 'D3', learning_goal: 'Evaluate Z', estimated_minutes: 25, structure_prompt: 'Assess governance frameworks for {{industry}} at {{company_name}}' },
                { lesson_number: 2, title: 'L4', description: 'D4', learning_goal: 'Build W', estimated_minutes: 30, structure_prompt: 'Implement governance controls for {{role}} leaders at {{company_name}}' },
              ],
            },
          ],
        }),
        usage: { prompt_tokens: 100, completion_tokens: 500, total_tokens: 600 },
        cacheHit: false,
      };

      (callLLMWithAudit as jest.Mock).mockResolvedValue(mockResponse);

      const skeleton = await generateCurriculumSkeleton(baseInput);

      expect(skeleton.total_modules).toBe(2);
      expect(skeleton.total_lessons).toBe(4);
      expect(skeleton.modules[0].skill_area).toBe('strategy_trust');
      expect(skeleton.modules[1].skill_area).toBe('governance');
      expect(skeleton.modules[0].lessons[0].structure_prompt).toContain('{{industry}}');
      expect(skeleton.modules[0].lessons[0].temp_id).toBeDefined();
    });

    it('rejects LLM response with wrong module count', async () => {
      const mockResponse = {
        content: JSON.stringify({
          modules: [
            {
              module_number: 1, title: 'Module 1', description: 'Desc', skill_area: 'governance',
              lessons: [
                { lesson_number: 1, title: 'L1', description: 'D1', learning_goal: 'G', estimated_minutes: 25, structure_prompt: 'A detailed prompt about testing' },
                { lesson_number: 2, title: 'L2', description: 'D2', learning_goal: 'G', estimated_minutes: 25, structure_prompt: 'Another detailed prompt here' },
              ],
            },
          ],
        }),
        usage: { prompt_tokens: 100, completion_tokens: 300, total_tokens: 400 },
        cacheHit: false,
      };

      (callLLMWithAudit as jest.Mock).mockResolvedValue(mockResponse);

      await expect(generateCurriculumSkeleton(baseInput)).rejects.toThrow('Expected 2 modules, got 1');
    });
  });
});
