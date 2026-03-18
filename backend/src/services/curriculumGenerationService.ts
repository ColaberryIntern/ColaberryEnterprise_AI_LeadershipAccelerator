/**
 * Governed Curriculum Generation Engine
 *
 * Two-phase orchestrator that builds full curriculum structures from variables:
 * Phase 1: LLM generates curriculum skeleton (modules + lesson stubs)
 * Phase 2: Existing generateComprehensiveBlueprint() generates per-lesson blueprints
 *
 * All generation returns in-memory preview objects — nothing touches the database
 * until approveCurriculumPreview() is called with explicit admin confirmation.
 */

import crypto from 'crypto';
import { sequelize } from '../config/database';
import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';
import ReportingInsight from '../models/ReportingInsight';
import { callLLMWithAudit } from './llmCallWrapper';
import {
  generateComprehensiveBlueprint,
  applySectionBlueprint,
  GeneratedBlueprint,
} from './structureGenerationService';
import { extractVariableRefs, SYSTEM_VARIABLE_KEYS } from './variableFlowService';
import { runFullDiagnostics, DiagnosticsResult } from './diagnosticsService';

// ─── Debug Logging ──────────────────────────────────────────────────

const DEBUG = process.env.DEBUG_CURRICULUM_GEN === 'true';
function debugLog(msg: string, data?: any) {
  if (DEBUG) console.log(`[CurriculumGen] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
}

const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

// ─── Types ──────────────────────────────────────────────────────────

export interface CurriculumGenerationInput {
  program_id: string;
  cohort_id: string;
  program_name: string;
  program_description: string;
  target_modules: number;
  lessons_per_module: number;
  variables: Record<string, string>;
  options?: {
    skill_areas?: string[];
    unlock_rule?: 'sequential' | 'manual';
  };
}

export interface SkeletonModule {
  temp_id: string;
  module_number: number;
  title: string;
  description: string;
  skill_area: string;
  lessons: SkeletonLesson[];
}

export interface SkeletonLesson {
  temp_id: string;
  lesson_number: number;
  title: string;
  description: string;
  lesson_type: 'section';
  estimated_minutes: number;
  learning_goal: string;
  structure_prompt: string;
}

export interface CurriculumSkeleton {
  generated_at: string;
  input: CurriculumGenerationInput;
  modules: SkeletonModule[];
  total_lessons: number;
  total_modules: number;
}

export interface LessonBlueprintPreview {
  lesson_temp_id: string;
  lesson_title: string;
  blueprint: GeneratedBlueprint;
  variable_flow: { produces: string[]; consumes: string[] };
}

export interface CurriculumPreview {
  skeleton: CurriculumSkeleton;
  blueprints: LessonBlueprintPreview[];
  governance: GovernanceReport;
  status: 'preview' | 'approved' | 'blocked' | 'failed';
}

export interface GovernanceReport {
  health_score: number;
  total_variables_produced: number;
  total_variables_consumed: number;
  missing_variables: string[];
  timeline_violations: string[];
  orphaned_variables: string[];
  can_approve: boolean;
  block_reasons: string[];
  warnings: string[];
  confidence_score: number;
  risk_level: 'low' | 'medium' | 'high';
}

export interface ApprovalResult {
  success: boolean;
  created_modules: { id: string; title: string }[];
  created_lessons: { id: string; title: string }[];
  created_mini_sections: number;
  created_variables: number;
  created_artifacts: number;
  governance_insight_id: string;
  diagnostics_after: DiagnosticsResult;
}

// ─── Scoring Constants (matching diagnosticsService.ts) ─────────────

const PENALTY = {
  missing: 5,
  timeline: 10,
  orphaned: 3,
};

// ─── Skeleton LLM Prompt ────────────────────────────────────────────

const VALID_SKILL_AREAS = [
  'strategy_trust',
  'governance',
  'requirements',
  'build_discipline',
  'executive_authority',
];

function buildSkeletonSystemPrompt(input: CurriculumGenerationInput): string {
  const skillAreas = input.options?.skill_areas?.length
    ? input.options.skill_areas
    : VALID_SKILL_AREAS;

  return `You are an expert curriculum designer for an enterprise AI leadership program targeting senior business executives (aged 35-60).

You will be given a program description and variables. Generate a structured curriculum skeleton.

Requirements:
- Generate exactly ${input.target_modules} modules
- Each module must have exactly ${input.lessons_per_module} lessons
- Each module must have a unique skill_area from this list: ${JSON.stringify(skillAreas)}
- Modules should progress from foundational to advanced
- Each lesson must include a structure_prompt that describes what the lesson covers
- Structure prompts MUST reference variables using {{variable_name}} syntax where relevant (e.g., {{industry}}, {{company_name}}, {{role}})
- Learning goals must start with action verbs (Analyze, Design, Build, Evaluate, Assess)
- Estimated minutes: 20-40 per lesson

Available variables for reference in structure_prompts:
${Object.entries(input.variables).map(([k, v]) => `- {{${k}}}: ${v}`).join('\n')}

Return ONLY valid JSON in this exact format:
{
  "modules": [
    {
      "module_number": 1,
      "title": "<module title>",
      "description": "<1-2 sentence module description>",
      "skill_area": "<one of the valid skill areas>",
      "lessons": [
        {
          "lesson_number": 1,
          "title": "<lesson title>",
          "description": "<1-2 sentence lesson description>",
          "learning_goal": "<measurable outcome starting with action verb>",
          "estimated_minutes": 25,
          "structure_prompt": "<detailed description for generating mini-sections, referencing {{variables}}>"
        }
      ]
    }
  ]
}

No markdown, no explanation — just the JSON object.`;
}

// ─── Phase 1: Skeleton Generation ───────────────────────────────────

export async function generateCurriculumSkeleton(
  input: CurriculumGenerationInput,
): Promise<CurriculumSkeleton> {
  debugLog('Generating skeleton', { program: input.program_name, modules: input.target_modules, lessons: input.lessons_per_module });

  const systemPrompt = buildSkeletonSystemPrompt(input);
  const userPrompt = `Program: ${input.program_name}\n\nDescription: ${input.program_description}\n\nTarget audience variables:\n${Object.entries(input.variables).map(([k, v]) => `${k}: ${v}`).join('\n')}`;

  const llmResult = await callLLMWithAudit({
    lessonId: 'curriculum-gen',
    generationType: 'admin_structure',
    step: 'generate_curriculum_skeleton',
    systemPrompt,
    userPrompt,
    model: MODEL,
    temperature: 0.7,
    maxTokens: 4000,
    responseFormat: { type: 'json_object' },
  });

  const parsed = JSON.parse(llmResult.content);
  const modules = parsed.modules;

  if (!Array.isArray(modules) || modules.length !== input.target_modules) {
    throw new Error(`Expected ${input.target_modules} modules, got ${Array.isArray(modules) ? modules.length : 0}`);
  }

  let totalLessons = 0;
  const skeletonModules: SkeletonModule[] = modules.map((mod: any, mi: number) => {
    const lessons = mod.lessons;
    if (!Array.isArray(lessons) || lessons.length !== input.lessons_per_module) {
      throw new Error(`Module ${mi + 1}: expected ${input.lessons_per_module} lessons, got ${Array.isArray(lessons) ? lessons.length : 0}`);
    }

    const skeletonLessons: SkeletonLesson[] = lessons.map((les: any) => {
      if (!les.structure_prompt || les.structure_prompt.trim().length < 10) {
        throw new Error(`Module ${mi + 1}, Lesson ${les.lesson_number}: structure_prompt is missing or too short`);
      }
      totalLessons++;
      return {
        temp_id: crypto.randomUUID(),
        lesson_number: les.lesson_number,
        title: les.title,
        description: les.description || '',
        lesson_type: 'section' as const,
        estimated_minutes: les.estimated_minutes || 25,
        learning_goal: les.learning_goal || '',
        structure_prompt: les.structure_prompt,
      };
    });

    return {
      temp_id: crypto.randomUUID(),
      module_number: mod.module_number || mi + 1,
      title: mod.title,
      description: mod.description || '',
      skill_area: VALID_SKILL_AREAS.includes(mod.skill_area) ? mod.skill_area : VALID_SKILL_AREAS[mi % VALID_SKILL_AREAS.length],
      lessons: skeletonLessons,
    };
  });

  const skeleton: CurriculumSkeleton = {
    generated_at: new Date().toISOString(),
    input,
    modules: skeletonModules,
    total_lessons: totalLessons,
    total_modules: skeletonModules.length,
  };

  debugLog('Skeleton generated', { modules: skeleton.total_modules, lessons: skeleton.total_lessons });
  return skeleton;
}

// ─── Phase 2: Blueprint Generation ──────────────────────────────────

export async function generateCurriculumBlueprints(
  skeleton: CurriculumSkeleton,
): Promise<LessonBlueprintPreview[]> {
  const blueprints: LessonBlueprintPreview[] = [];

  for (const mod of skeleton.modules) {
    for (const lesson of mod.lessons) {
      debugLog(`Generating blueprint for "${lesson.title}"`, { temp_id: lesson.temp_id });
      try {
        const blueprint = await generateComprehensiveBlueprint(
          lesson.structure_prompt,
          lesson.temp_id,
        );

        // Extract variable flow from blueprint
        const produces: string[] = [];
        const consumes = new Set<string>();

        for (const spec of blueprint.mini_sections) {
          for (const v of spec.variables || []) {
            produces.push(v.key);
          }
          // Extract consumed variables from section_prompt
          for (const ref of extractVariableRefs(spec.section_prompt || '')) {
            consumes.add(ref);
          }
          // Also check description for variable references
          for (const ref of extractVariableRefs(spec.description || '')) {
            consumes.add(ref);
          }
        }

        blueprints.push({
          lesson_temp_id: lesson.temp_id,
          lesson_title: lesson.title,
          blueprint,
          variable_flow: { produces, consumes: [...consumes] },
        });
      } catch (err: any) {
        debugLog(`Blueprint generation failed for "${lesson.title}": ${err.message}`);
        // Push a placeholder — governance will flag failed blueprints
        blueprints.push({
          lesson_temp_id: lesson.temp_id,
          lesson_title: lesson.title,
          blueprint: { mini_sections: [], skill_domain: 'unknown' },
          variable_flow: { produces: [], consumes: [] },
        });
      }
    }
  }

  debugLog('All blueprints generated', { total: blueprints.length, successful: blueprints.filter(b => b.blueprint.mini_sections.length > 0).length });
  return blueprints;
}

// ─── Governance Analysis (Pure Function) ────────────────────────────

export function analyzeGovernance(
  skeleton: CurriculumSkeleton,
  blueprints: LessonBlueprintPreview[],
): GovernanceReport {
  const systemVarSet = new Set(SYSTEM_VARIABLE_KEYS);
  // Also treat input variables as available (they come from user/system context)
  const inputVarSet = new Set(Object.keys(skeleton.input.variables));

  const allProduced = new Set<string>();
  const allConsumed = new Set<string>();
  const missing: string[] = [];
  const timelineViolations: string[] = [];
  const orphaned: string[] = [];
  const blockReasons: string[] = [];
  const warnings: string[] = [];

  // Build ordered list matching skeleton order
  const orderedBlueprints: { order: number; bp: LessonBlueprintPreview; lessonTitle: string }[] = [];
  for (const mod of skeleton.modules) {
    for (const lesson of mod.lessons) {
      const bp = blueprints.find(b => b.lesson_temp_id === lesson.temp_id);
      if (bp) {
        orderedBlueprints.push({
          order: mod.module_number * 1000 + lesson.lesson_number,
          bp,
          lessonTitle: lesson.title,
        });
      }
    }
  }
  orderedBlueprints.sort((a, b) => a.order - b.order);

  // Pass 1: Collect all productions with their order
  const productionOrder = new Map<string, number>();
  for (const { order, bp } of orderedBlueprints) {
    for (const key of bp.variable_flow.produces) {
      allProduced.add(key);
      if (!productionOrder.has(key)) {
        productionOrder.set(key, order);
      }
    }
  }

  // Pass 2: Check consumptions against production order
  for (const { order, bp } of orderedBlueprints) {
    for (const key of bp.variable_flow.consumes) {
      allConsumed.add(key);

      // Skip system and input variables
      if (systemVarSet.has(key) || inputVarSet.has(key)) continue;

      // Check if consumed before produced (timeline violation)
      if (productionOrder.has(key) && productionOrder.get(key)! > order) {
        if (!timelineViolations.includes(key)) {
          timelineViolations.push(key);
        }
      }
    }
  }

  // Identify missing: consumed but never produced and not system/input
  for (const key of allConsumed) {
    if (!systemVarSet.has(key) && !inputVarSet.has(key) && !allProduced.has(key)) {
      missing.push(key);
    }
  }

  // Identify orphaned: produced but never consumed
  for (const key of allProduced) {
    if (!allConsumed.has(key)) {
      orphaned.push(key);
    }
  }

  // Count failed blueprints
  const totalLessons = skeleton.total_lessons;
  const successfulBlueprints = blueprints.filter(b => b.blueprint.mini_sections.length > 0).length;
  const failedBlueprints = totalLessons - successfulBlueprints;
  const confidenceScore = totalLessons > 0 ? successfulBlueprints / totalLessons : 0;

  if (failedBlueprints > 0) {
    warnings.push(`${failedBlueprints} lesson blueprint(s) failed to generate`);
  }

  // Compute health score
  let healthScore = 100;
  healthScore -= missing.length * PENALTY.missing;
  healthScore -= timelineViolations.length * PENALTY.timeline;
  healthScore -= orphaned.length * PENALTY.orphaned;
  healthScore = Math.max(0, healthScore);

  // Determine if approval is allowed
  let canApprove = true;

  if (healthScore < 70) {
    canApprove = false;
    blockReasons.push(`Health score ${healthScore} is below minimum threshold of 70`);
  }

  if (missing.length > 0) {
    canApprove = false;
    blockReasons.push(`${missing.length} variable(s) consumed but never produced: ${missing.join(', ')}`);
  }

  if (timelineViolations.length > 0) {
    canApprove = false;
    blockReasons.push(`${timelineViolations.length} timeline violation(s): ${timelineViolations.join(', ')}`);
  }

  if (failedBlueprints > 0) {
    canApprove = false;
    blockReasons.push(`${failedBlueprints} lesson(s) failed blueprint generation`);
  }

  if (orphaned.length > 0) {
    warnings.push(`${orphaned.length} variable(s) produced but never consumed: ${orphaned.join(', ')}`);
  }

  // Risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (healthScore < 50) riskLevel = 'high';
  else if (healthScore < 70) riskLevel = 'medium';

  const report: GovernanceReport = {
    health_score: healthScore,
    total_variables_produced: allProduced.size,
    total_variables_consumed: allConsumed.size,
    missing_variables: missing,
    timeline_violations: timelineViolations,
    orphaned_variables: orphaned,
    can_approve: canApprove,
    block_reasons: blockReasons,
    warnings,
    confidence_score: confidenceScore,
    risk_level: riskLevel,
  };

  debugLog('Governance analysis', {
    health: healthScore,
    missing: missing.length,
    timeline: timelineViolations.length,
    orphaned: orphaned.length,
    canApprove,
  });

  return report;
}

// ─── Full Preview Pipeline ──────────────────────────────────────────

export async function generateCurriculumPreview(
  input: CurriculumGenerationInput,
): Promise<CurriculumPreview> {
  debugLog('Starting full curriculum preview generation');

  // Phase 1: Skeleton
  const skeleton = await generateCurriculumSkeleton(input);

  // Phase 2: Blueprints
  const blueprints = await generateCurriculumBlueprints(skeleton);

  // Governance gate
  const governance = analyzeGovernance(skeleton, blueprints);

  const status = governance.can_approve ? 'preview' : 'blocked';
  debugLog(`Preview complete — status: ${status}`);

  return { skeleton, blueprints, governance, status };
}

// ─── Approval (Persist) ─────────────────────────────────────────────

export async function approveCurriculumPreview(
  preview: CurriculumPreview,
): Promise<ApprovalResult> {
  if (preview.status !== 'preview') {
    throw new Error(`Cannot approve curriculum with status "${preview.status}". Must be "preview".`);
  }
  if (!preview.governance.can_approve) {
    throw new Error(`Governance check failed: ${preview.governance.block_reasons.join('; ')}`);
  }

  debugLog('Approving curriculum preview', { program: preview.skeleton.input.program_name });

  const createdModules: { id: string; title: string }[] = [];
  const createdLessons: { id: string; title: string }[] = [];
  let totalMiniSections = 0;
  let totalVariables = 0;
  let totalArtifacts = 0;
  let governanceInsightId = '';

  const { input } = preview.skeleton;
  const unlockRule = input.options?.unlock_rule || 'sequential';

  await sequelize.transaction(async (t) => {
    // 1. Create modules
    const moduleIdMap = new Map<string, string>(); // temp_id → real_id
    for (const mod of preview.skeleton.modules) {
      const moduleId = crypto.randomUUID();
      await CurriculumModule.create({
        id: moduleId,
        cohort_id: input.cohort_id,
        program_id: input.program_id,
        module_number: mod.module_number,
        title: mod.title,
        description: mod.description,
        skill_area: mod.skill_area,
        total_lessons: mod.lessons.length,
        unlock_rule: unlockRule,
      } as any, { transaction: t });
      moduleIdMap.set(mod.temp_id, moduleId);
      createdModules.push({ id: moduleId, title: mod.title });
    }

    // 2. Create lessons and apply blueprints
    for (const mod of preview.skeleton.modules) {
      const realModuleId = moduleIdMap.get(mod.temp_id)!;
      for (const lesson of mod.lessons) {
        const lessonId = crypto.randomUUID();
        await CurriculumLesson.create({
          id: lessonId,
          module_id: realModuleId,
          lesson_number: lesson.lesson_number,
          title: lesson.title,
          description: lesson.description,
          lesson_type: lesson.lesson_type,
          estimated_minutes: lesson.estimated_minutes,
          learning_goal: lesson.learning_goal,
          structure_prompt: lesson.structure_prompt,
          mandatory: true,
          sort_order: lesson.lesson_number,
        } as any, { transaction: t });
        createdLessons.push({ id: lessonId, title: lesson.title });

        // Find matching blueprint
        const bp = preview.blueprints.find(b => b.lesson_temp_id === lesson.temp_id);
        if (bp && bp.blueprint.mini_sections.length > 0) {
          const applyResult = await applySectionBlueprint(lessonId, bp.blueprint, t);
          totalMiniSections += applyResult.created_mini_sections.length;
          totalVariables += applyResult.created_variables.length;
          totalArtifacts += applyResult.created_artifacts.length;
        }
      }
    }

    // 3. Create governance insight
    const insightId = crypto.randomUUID();
    await ReportingInsight.create({
      id: insightId,
      insight_type: 'pattern',
      source_agent: 'curriculum_generation_engine',
      entity_type: 'curriculum',
      entity_id: input.program_id,
      title: `Curriculum Generated: ${input.program_name}`,
      narrative: `Generated ${createdModules.length} modules, ${createdLessons.length} lessons, ${totalMiniSections} mini-sections with health score ${preview.governance.health_score}.`,
      confidence: preview.governance.confidence_score,
      impact: 0.9,
      urgency: 0.3,
      data_strength: preview.governance.confidence_score,
      final_score: preview.governance.health_score / 100,
      evidence: {
        governance_report: preview.governance,
        skeleton_summary: {
          modules: createdModules.length,
          lessons: createdLessons.length,
          mini_sections: totalMiniSections,
          variables: totalVariables,
          artifacts: totalArtifacts,
        },
      },
      recommendations: preview.governance.warnings.length > 0
        ? { warnings: preview.governance.warnings }
        : undefined,
      status: 'new',
      alert_severity: 'info',
    } as any, { transaction: t });
    governanceInsightId = insightId;
  });

  debugLog('Curriculum approved and persisted', {
    modules: createdModules.length,
    lessons: createdLessons.length,
    miniSections: totalMiniSections,
    variables: totalVariables,
    artifacts: totalArtifacts,
  });

  // Post-commit: run full diagnostics
  let diagnosticsAfter: DiagnosticsResult;
  try {
    diagnosticsAfter = await runFullDiagnostics();
  } catch {
    diagnosticsAfter = {
      system_health_score: -1,
      summary: { total_variables: 0, missing_count: 0, timeline_violations: 0, orphaned_count: 0, undefined_count: 0 },
      issues: [],
      scanned_at: new Date().toISOString(),
    };
  }

  return {
    success: true,
    created_modules: createdModules,
    created_lessons: createdLessons,
    created_mini_sections: totalMiniSections,
    created_variables: totalVariables,
    created_artifacts: totalArtifacts,
    governance_insight_id: governanceInsightId,
    diagnostics_after: diagnosticsAfter,
  };
}
