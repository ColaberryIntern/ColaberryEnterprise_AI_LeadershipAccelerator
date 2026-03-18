/**
 * Variable Flow Service Tests
 *
 * Tests extraction, section flow, timeline violations, strict availability,
 * deduplication, and reconciliation.
 *
 * Uses mocked Sequelize models — no database dependency.
 */

// ─── Mock data stores ──────────────────────────────────────────────

const mockModules: any[] = [];
const mockLessons: any[] = [];
const mockMiniSections: any[] = [];
const mockVarDefs: any[] = [];

jest.mock('../../models/CurriculumModule', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => {
      return [...mockModules].sort((a, b) => a.module_number - b.module_number);
    }),
  },
}));

jest.mock('../../models/CurriculumLesson', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => {
      return [...mockLessons].sort((a, b) => a.lesson_number - b.lesson_number);
    }),
    update: jest.fn(async () => [1]),
  },
}));

jest.mock('../../models/MiniSection', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async ({ where }: any) => {
      const lessonIds = Array.isArray(where.lesson_id) ? where.lesson_id : [where.lesson_id];
      return mockMiniSections
        .filter(ms => lessonIds.includes(ms.lesson_id) && ms.is_active !== false)
        .sort((a, b) => a.mini_section_order - b.mini_section_order);
    }),
    findByPk: jest.fn(async (id: string) => {
      return mockMiniSections.find(ms => ms.id === id) || null;
    }),
  },
}));

jest.mock('../../models/VariableDefinition', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async ({ where }: any) => {
      return mockVarDefs.filter(v => where?.is_active === undefined || v.is_active === where.is_active);
    }),
    findOrCreate: jest.fn(async ({ where, defaults }: any) => {
      const existing = mockVarDefs.find(v => v.variable_key === where.variable_key);
      if (existing) return [existing, false];
      const newDef = { ...defaults, variable_key: where.variable_key };
      mockVarDefs.push(newDef);
      return [newDef, true];
    }),
  },
}));

// ─── Imports (after mocks) ─────────────────────────────────────────

import {
  extractVariableRefs,
  getSectionVariableFlow,
  getVariableFlowMap,
  getVariableReconciliation,
  SYSTEM_VARIABLE_KEYS,
} from '../../services/variableFlowService';

// ─── Helpers ───────────────────────────────────────────────────────

function resetAll() {
  mockModules.length = 0;
  mockLessons.length = 0;
  mockMiniSections.length = 0;
  mockVarDefs.length = 0;
  jest.clearAllMocks();
}

function addModule(id: string, moduleNumber: number) {
  mockModules.push({ id, module_number: moduleNumber });
}

function addLesson(id: string, moduleId: string, lessonNumber: number, title: string, sectionVarKeys: string[] = []) {
  mockLessons.push({
    id,
    module_id: moduleId,
    lesson_number: lessonNumber,
    title,
    section_variable_keys: sectionVarKeys,
  });
}

function addMiniSection(
  id: string,
  lessonId: string,
  order: number,
  title: string,
  opts: {
    associated_variable_keys?: string[];
    creates_variable_keys?: string[];
    concept_prompt_user?: string;
    build_prompt_user?: string;
    [key: string]: any;
  } = {},
) {
  mockMiniSections.push({
    id,
    lesson_id: lessonId,
    mini_section_order: order,
    title,
    is_active: true,
    associated_variable_keys: opts.associated_variable_keys || [],
    creates_variable_keys: opts.creates_variable_keys || [],
    concept_prompt_system: opts.concept_prompt_system || null,
    concept_prompt_user: opts.concept_prompt_user || null,
    build_prompt_system: opts.build_prompt_system || null,
    build_prompt_user: opts.build_prompt_user || null,
    mentor_prompt_system: opts.mentor_prompt_system || null,
    mentor_prompt_user: opts.mentor_prompt_user || null,
    kc_prompt_system: opts.kc_prompt_system || null,
    kc_prompt_user: opts.kc_prompt_user || null,
    reflection_prompt_system: opts.reflection_prompt_system || null,
    reflection_prompt_user: opts.reflection_prompt_user || null,
  });
}

function addVarDef(key: string, displayName?: string, sourceType = 'user_input', scope = 'program') {
  mockVarDefs.push({
    id: `def-${key}`,
    variable_key: key,
    display_name: displayName || key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    data_type: 'text',
    scope,
    source_type: sourceType,
    optional: true,
    is_active: true,
    sort_order: 0,
  });
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('variableFlowService', () => {
  beforeEach(resetAll);

  // ── TC1: extractVariableRefs basics ───────────────────────────────

  describe('extractVariableRefs', () => {
    test('extracts simple variable reference', () => {
      expect(extractVariableRefs('{{company_name}}')).toEqual(['company_name']);
    });

    test('tolerates whitespace inside braces', () => {
      expect(extractVariableRefs('{{ company_name }}')).toEqual(['company_name']);
      expect(extractVariableRefs('{{  company_name  }}')).toEqual(['company_name']);
    });

    test('filters out structure_* keys', () => {
      expect(extractVariableRefs('{{structure_foo}}')).toEqual([]);
      expect(extractVariableRefs('{{structure_overview}}')).toEqual([]);
    });

    test('deduplicates repeated references', () => {
      expect(extractVariableRefs('{{a}} and {{b}} and {{a}}')).toEqual(['a', 'b']);
    });

    test('returns empty array for no variables', () => {
      expect(extractVariableRefs('no vars here')).toEqual([]);
    });

    test('returns empty array for empty/null input', () => {
      expect(extractVariableRefs('')).toEqual([]);
      expect(extractVariableRefs(null as any)).toEqual([]);
      expect(extractVariableRefs(undefined as any)).toEqual([]);
    });

    test('extracts multiple different variables', () => {
      const result = extractVariableRefs('Hello {{first_name}}, your company {{company_name}} in {{industry}}');
      expect(result).toEqual(expect.arrayContaining(['first_name', 'company_name', 'industry']));
      expect(result.length).toBe(3);
    });
  });

  // ── TC2: Missing Variable Injection ───────────────────────────────

  describe('getSectionVariableFlow — missing variables', () => {
    test('detects missing variables not available from prior sections', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1');
      addLesson('lesson-2', 'mod-1', 2, 'Section 2');

      // Section 1 ms1 creates company_name
      addMiniSection('ms-1', 'lesson-1', 1, 'Intro', {
        creates_variable_keys: ['company_name'],
      });

      // Section 2 ms1 references company_name (available) + budget (NOT available)
      addMiniSection('ms-2', 'lesson-2', 1, 'Deep Dive', {
        concept_prompt_user: 'For {{company_name}}, plan a {{budget}} allocation',
      });

      addVarDef('company_name');
      addVarDef('budget');

      const flow = await getSectionVariableFlow('lesson-2');

      // company_name should be available (from Section 1)
      expect(flow.available.some(a => a.key === 'company_name')).toBe(true);

      // budget should be missing
      expect(flow.missing.some(m => m.key === 'budget')).toBe(true);

      // company_name should NOT be missing
      expect(flow.missing.some(m => m.key === 'company_name')).toBe(false);
    });

    test('system variables are always available and never missing', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1');

      addMiniSection('ms-1', 'lesson-1', 1, 'Intro', {
        concept_prompt_user: 'Company: {{company_name}}, Industry: {{industry}}',
      });

      const flow = await getSectionVariableFlow('lesson-1');

      // System variables should be in available
      expect(flow.available.some(a => a.key === 'company_name')).toBe(true);
      expect(flow.available.some(a => a.key === 'industry')).toBe(true);

      // Should NOT be in missing
      expect(flow.missing.length).toBe(0);
    });
  });

  // ── TC3: Timeline Violation ───────────────────────────────────────

  describe('getVariableFlowMap — timeline violations', () => {
    test('flags timeline violation when consumed before produced', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1'); // order 1001
      addLesson('lesson-2', 'mod-1', 2, 'Section 2'); // order 1002

      // Section 1 consumes "plan" (but nobody has produced it yet)
      addMiniSection('ms-1', 'lesson-1', 1, 'Consumer', {
        concept_prompt_user: 'Execute the {{plan}}',
      });

      // Section 2 produces "plan"
      addMiniSection('ms-2', 'lesson-2', 1, 'Producer', {
        creates_variable_keys: ['plan'],
      });

      addVarDef('plan');

      const flowMap = await getVariableFlowMap();
      const planEntry = flowMap.find(e => e.variable_key === 'plan');

      expect(planEntry).toBeDefined();
      expect(planEntry!.timeline_violation).toBe(true);
    });

    test('no violation when produced before consumed', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1');
      addLesson('lesson-2', 'mod-1', 2, 'Section 2');

      // Section 1 produces "plan"
      addMiniSection('ms-1', 'lesson-1', 1, 'Producer', {
        creates_variable_keys: ['plan'],
      });

      // Section 2 consumes "plan"
      addMiniSection('ms-2', 'lesson-2', 1, 'Consumer', {
        concept_prompt_user: 'Execute the {{plan}}',
      });

      addVarDef('plan');

      const flowMap = await getVariableFlowMap();
      const planEntry = flowMap.find(e => e.variable_key === 'plan');

      expect(planEntry).toBeDefined();
      expect(planEntry!.timeline_violation).toBe(false);
    });
  });

  // ── TC4: Strict Availability (no future leaks) ────────────────────

  describe('getSectionVariableFlow — strict availability', () => {
    test('variables from later sections are NOT available in earlier sections', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1');
      addLesson('lesson-2', 'mod-1', 2, 'Section 2');
      addLesson('lesson-3', 'mod-1', 3, 'Section 3');

      // Section 2 produces "foo"
      addMiniSection('ms-1', 'lesson-2', 1, 'Producer', {
        creates_variable_keys: ['foo'],
      });

      // Section 1 and Section 3 reference "foo"
      addMiniSection('ms-2', 'lesson-1', 1, 'Early Consumer', {
        concept_prompt_user: 'Use {{foo}}',
      });
      addMiniSection('ms-3', 'lesson-3', 1, 'Late Consumer', {
        concept_prompt_user: 'Use {{foo}}',
      });

      addVarDef('foo');

      // Section 1 should NOT have "foo" available (produced in Section 2 which is AFTER)
      const flow1 = await getSectionVariableFlow('lesson-1');
      expect(flow1.available.some(a => a.key === 'foo')).toBe(false);
      expect(flow1.missing.some(m => m.key === 'foo')).toBe(true);

      // Section 3 SHOULD have "foo" available (produced in Section 2 which is BEFORE)
      const flow3 = await getSectionVariableFlow('lesson-3');
      expect(flow3.available.some(a => a.key === 'foo')).toBe(true);
      expect(flow3.missing.some(m => m.key === 'foo')).toBe(false);
    });

    test('within-lesson: variable produced by later mini-section is missing for earlier consumer', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1');

      // ms1 (order 1) consumes "plan", ms2 (order 2) creates "plan"
      addMiniSection('ms-1', 'lesson-1', 1, 'Consumer First', {
        concept_prompt_user: 'Execute {{plan}}',
      });
      addMiniSection('ms-2', 'lesson-1', 2, 'Producer Second', {
        creates_variable_keys: ['plan'],
      });

      addVarDef('plan');

      const flow = await getSectionVariableFlow('lesson-1');
      // "plan" is produced AFTER it's consumed within the lesson — should be missing
      expect(flow.missing.some(m => m.key === 'plan')).toBe(true);
    });

    test('within-lesson: variable produced by earlier mini-section is NOT missing', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1');

      // ms1 (order 1) creates "plan", ms2 (order 2) consumes "plan"
      addMiniSection('ms-1', 'lesson-1', 1, 'Producer First', {
        creates_variable_keys: ['plan'],
      });
      addMiniSection('ms-2', 'lesson-1', 2, 'Consumer Second', {
        concept_prompt_user: 'Execute {{plan}}',
      });

      addVarDef('plan');

      const flow = await getSectionVariableFlow('lesson-1');
      // "plan" is produced BEFORE consumed — should NOT be missing
      expect(flow.missing.some(m => m.key === 'plan')).toBe(false);
    });
  });

  // ── TC5: Auto Extraction + Deduplication ──────────────────────────

  describe('extractVariableRefs — deduplication', () => {
    test('repeated variable in template yields single entry', () => {
      const result = extractVariableRefs(
        '{{test_var}} is important. Remember {{test_var}}. Again: {{test_var}}'
      );
      expect(result).toEqual(['test_var']);
    });

    test('mixed structure and non-structure keys', () => {
      const result = extractVariableRefs(
        '{{company_name}} with {{structure_overview}} and {{budget}}'
      );
      expect(result).toEqual(expect.arrayContaining(['company_name', 'budget']));
      expect(result).not.toContain('structure_overview');
      expect(result.length).toBe(2);
    });
  });

  // ── TC6: Reconciliation ───────────────────────────────────────────

  describe('getVariableReconciliation', () => {
    test('detects undefined references (ghost variables)', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1');

      // Prompt references ghost_var but no VariableDefinition exists
      addMiniSection('ms-1', 'lesson-1', 1, 'Ghost User', {
        concept_prompt_user: 'Use {{ghost_var}} in your plan',
      });

      // No addVarDef('ghost_var') — it's undefined

      const recon = await getVariableReconciliation();
      expect(recon.undefined_refs.some(r => r.key === 'ghost_var')).toBe(true);
      expect(recon.undefined_refs.find(r => r.key === 'ghost_var')!.used_in_sections).toContain('Section 1');
    });

    test('detects orphaned definitions (defined but never referenced)', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1');

      // No mini-sections reference anything
      addMiniSection('ms-1', 'lesson-1', 1, 'Empty', {});

      // But we have a definition for "lonely_var"
      addVarDef('lonely_var', 'Lonely Variable');

      const recon = await getVariableReconciliation();
      expect(recon.orphaned_defs.some(d => d.key === 'lonely_var')).toBe(true);
    });

    test('system variables are not flagged as undefined', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1');

      // Reference a system variable without a VariableDefinition row
      addMiniSection('ms-1', 'lesson-1', 1, 'System User', {
        concept_prompt_user: 'Your company is {{company_name}}',
      });

      const recon = await getVariableReconciliation();
      // company_name is a system var — should NOT be in undefined_refs
      expect(recon.undefined_refs.some(r => r.key === 'company_name')).toBe(false);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    test('non-existent lesson returns empty flow', async () => {
      addModule('mod-1', 1);
      // No lessons at all

      const flow = await getSectionVariableFlow('nonexistent-id');
      expect(flow.lesson_id).toBe('nonexistent-id');
      expect(flow.available).toEqual([]);
      expect(flow.required).toEqual([]);
      expect(flow.produced).toEqual([]);
      expect(flow.missing).toEqual([]);
    });

    test('variable only defined but never produced or consumed', async () => {
      addModule('mod-1', 1);
      addLesson('lesson-1', 'mod-1', 1, 'Section 1');
      addMiniSection('ms-1', 'lesson-1', 1, 'Empty', {});

      addVarDef('orphan_key', 'Orphan Key');

      const flowMap = await getVariableFlowMap();
      const entry = flowMap.find(e => e.variable_key === 'orphan_key');
      expect(entry).toBeDefined();
      expect(entry!.produced_in).toEqual([]);
      expect(entry!.consumed_in).toEqual([]);
      expect(entry!.timeline_violation).toBe(false);
    });
  });
});
