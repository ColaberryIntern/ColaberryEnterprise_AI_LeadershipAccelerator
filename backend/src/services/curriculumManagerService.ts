/**
 * Curriculum Manager Service
 * Cross-entity consistency checker, dry-run builder, and cache rebuilder.
 * Used by admin to validate the orchestration engine's data integrity.
 */

import {
  CurriculumModule, CurriculumLesson, MiniSection, ArtifactDefinition,
  PromptTemplate, SectionConfig, VariableDefinition, ProgramBlueprint,
  LiveSession, SessionGate, VariableStore, SkillDefinition,
} from '../models';

export interface IntegrityIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface IntegrityReport {
  issues: IntegrityIssue[];
  summary: {
    total_issues: number;
    critical: number;
    warning: number;
    info: number;
  };
  counts: {
    modules: number;
    lessons: number;
    miniSections: number;
    artifacts: number;
    prompts: number;
    sectionConfigs: number;
    variableDefinitions: number;
    sessions: number;
    gates: number;
  };
}

export interface DryRunResult {
  lessonId: string;
  lessonTitle: string;
  wouldUseComposite: boolean;
  miniSectionCount: number;
  typeBreakdown: Record<string, number>;
  requiredVariables: string[];
  linkedArtifacts: { id: string; name: string; type: string }[];
  linkedSkills: string[];
  associatedSession: { id: string; title: string } | null;
  sectionConfigExists: boolean;
  warnings: string[];
}

/**
 * Run a full integrity check across all orchestration entities.
 */
export async function runIntegrityCheck(): Promise<IntegrityReport> {
  const issues: IntegrityIssue[] = [];

  // Load all entities
  const [modules, lessons, miniSections, artifacts, prompts, sectionConfigs, varDefs, sessions, gates] = await Promise.all([
    CurriculumModule.findAll(),
    CurriculumLesson.findAll(),
    MiniSection.findAll(),
    ArtifactDefinition.findAll(),
    PromptTemplate.findAll(),
    SectionConfig.findAll(),
    VariableDefinition.findAll(),
    LiveSession.findAll(),
    SessionGate.findAll(),
  ]);

  const moduleIds = new Set(modules.map(m => m.id));
  const lessonIds = new Set(lessons.map(l => l.id));
  const promptIds = new Set(prompts.map(p => p.id));
  const sessionIds = new Set(sessions.map(s => s.id));
  const artifactIds = new Set(artifacts.map(a => a.id));

  // 1. Orphan mini-sections (lesson_id doesn't exist)
  for (const ms of miniSections) {
    if (!lessonIds.has(ms.lesson_id)) {
      issues.push({
        severity: 'critical',
        category: 'orphan_mini_section',
        message: `MiniSection "${ms.title}" (${ms.id}) references non-existent lesson ${ms.lesson_id}`,
        entityType: 'MiniSection',
        entityId: ms.id,
      });
    }
  }

  // 2. Orphan artifacts (session_id doesn't exist)
  for (const art of artifacts) {
    if (art.session_id && !sessionIds.has(art.session_id)) {
      issues.push({
        severity: 'critical',
        category: 'orphan_artifact',
        message: `ArtifactDefinition "${art.name}" (${art.id}) references non-existent session ${art.session_id}`,
        entityType: 'ArtifactDefinition',
        entityId: art.id,
      });
    }
    if (art.lesson_id && !lessonIds.has(art.lesson_id)) {
      issues.push({
        severity: 'warning',
        category: 'orphan_artifact_lesson',
        message: `ArtifactDefinition "${art.name}" (${art.id}) references non-existent lesson ${art.lesson_id}`,
        entityType: 'ArtifactDefinition',
        entityId: art.id,
      });
    }
  }

  // 3. Broken prompt references in mini-sections
  for (const ms of miniSections) {
    if (ms.concept_prompt_template_id && !promptIds.has(ms.concept_prompt_template_id)) {
      issues.push({
        severity: 'critical',
        category: 'broken_prompt_ref',
        message: `MiniSection "${ms.title}" concept prompt ${ms.concept_prompt_template_id} not found`,
        entityType: 'MiniSection',
        entityId: ms.id,
      });
    }
    if (ms.build_prompt_template_id && !promptIds.has(ms.build_prompt_template_id)) {
      issues.push({
        severity: 'critical',
        category: 'broken_prompt_ref',
        message: `MiniSection "${ms.title}" build prompt ${ms.build_prompt_template_id} not found`,
        entityType: 'MiniSection',
        entityId: ms.id,
      });
    }
    if (ms.mentor_prompt_template_id && !promptIds.has(ms.mentor_prompt_template_id)) {
      issues.push({
        severity: 'critical',
        category: 'broken_prompt_ref',
        message: `MiniSection "${ms.title}" mentor prompt ${ms.mentor_prompt_template_id} not found`,
        entityType: 'MiniSection',
        entityId: ms.id,
      });
    }
  }

  // 4. Broken prompt references in section configs
  for (const sc of sectionConfigs) {
    if (sc.suggested_prompt_id && !promptIds.has(sc.suggested_prompt_id)) {
      issues.push({
        severity: 'warning',
        category: 'broken_prompt_ref',
        message: `SectionConfig ${sc.id} suggested prompt ${sc.suggested_prompt_id} not found`,
        entityType: 'SectionConfig',
        entityId: sc.id,
      });
    }
    if (sc.mentor_prompt_id && !promptIds.has(sc.mentor_prompt_id)) {
      issues.push({
        severity: 'warning',
        category: 'broken_prompt_ref',
        message: `SectionConfig ${sc.id} mentor prompt ${sc.mentor_prompt_id} not found`,
        entityType: 'SectionConfig',
        entityId: sc.id,
      });
    }
  }

  // 5. Broken prompt references in artifact definitions
  for (const art of artifacts) {
    if (art.auto_generate_prompt_id && !promptIds.has(art.auto_generate_prompt_id)) {
      issues.push({
        severity: 'warning',
        category: 'broken_prompt_ref',
        message: `ArtifactDefinition "${art.name}" auto-generate prompt ${art.auto_generate_prompt_id} not found`,
        entityType: 'ArtifactDefinition',
        entityId: art.id,
      });
    }
    if (art.instruction_prompt_id && !promptIds.has(art.instruction_prompt_id)) {
      issues.push({
        severity: 'warning',
        category: 'broken_prompt_ref',
        message: `ArtifactDefinition "${art.name}" instruction prompt ${art.instruction_prompt_id} not found`,
        entityType: 'ArtifactDefinition',
        entityId: art.id,
      });
    }
  }

  // 6. Lessons with missing session associations (have session_id but session doesn't exist)
  for (const lesson of lessons) {
    if (lesson.associated_session_id && !sessionIds.has(lesson.associated_session_id)) {
      issues.push({
        severity: 'warning',
        category: 'missing_session_association',
        message: `Lesson "${lesson.title}" references non-existent session ${lesson.associated_session_id}`,
        entityType: 'CurriculumLesson',
        entityId: lesson.id,
      });
    }
  }

  // 7. Session gates referencing non-existent entities
  for (const gate of gates) {
    if (gate.module_id && !moduleIds.has(gate.module_id)) {
      issues.push({
        severity: 'critical',
        category: 'broken_gate',
        message: `SessionGate ${gate.id} references non-existent module ${gate.module_id}`,
        entityType: 'SessionGate',
        entityId: gate.id,
      });
    }
    if (gate.lesson_id && !lessonIds.has(gate.lesson_id)) {
      issues.push({
        severity: 'critical',
        category: 'broken_gate',
        message: `SessionGate ${gate.id} references non-existent lesson ${gate.lesson_id}`,
        entityType: 'SessionGate',
        entityId: gate.id,
      });
    }
    if (gate.artifact_definition_id && !artifactIds.has(gate.artifact_definition_id)) {
      issues.push({
        severity: 'critical',
        category: 'broken_gate',
        message: `SessionGate ${gate.id} references non-existent artifact ${gate.artifact_definition_id}`,
        entityType: 'SessionGate',
        entityId: gate.id,
      });
    }
  }

  // 8. Lessons without module (orphan)
  for (const lesson of lessons) {
    if (!moduleIds.has(lesson.module_id)) {
      issues.push({
        severity: 'critical',
        category: 'orphan_lesson',
        message: `Lesson "${lesson.title}" (${lesson.id}) references non-existent module ${lesson.module_id}`,
        entityType: 'CurriculumLesson',
        entityId: lesson.id,
      });
    }
  }

  // 9. Unused variable definitions (no VariableStore entries exist for key)
  const usedVariableKeys = await VariableStore.findAll({
    attributes: ['variable_key'],
    group: ['variable_key'],
  });
  const usedKeys = new Set(usedVariableKeys.map((v: any) => v.variable_key));
  for (const vd of varDefs) {
    if (!usedKeys.has(vd.variable_key)) {
      issues.push({
        severity: 'info',
        category: 'unused_variable_definition',
        message: `Variable definition "${vd.display_name}" (key: ${vd.variable_key}) has no stored values`,
        entityType: 'VariableDefinition',
        entityId: vd.id,
      });
    }
  }

  // 10. Mini-section type constraint violations
  const validTypes = ['executive_reality_check', 'ai_strategy', 'prompt_template', 'implementation_task', 'knowledge_check'];
  const typeRules: Record<string, { canCreateVariables: boolean; canCreateArtifacts: boolean }> = {
    executive_reality_check: { canCreateVariables: false, canCreateArtifacts: false },
    ai_strategy:             { canCreateVariables: false, canCreateArtifacts: false },
    prompt_template:         { canCreateVariables: true,  canCreateArtifacts: false },
    implementation_task:     { canCreateVariables: false, canCreateArtifacts: true  },
    knowledge_check:         { canCreateVariables: false, canCreateArtifacts: false },
  };

  const varDefKeys = new Set(varDefs.map(v => v.variable_key));
  const allArtifactIds = new Set(artifacts.map(a => a.id));

  for (const ms of miniSections) {
    const type = (ms as any).mini_section_type;
    if (!type) {
      issues.push({ severity: 'warning', category: 'missing_type', message: `Mini-section "${ms.title}" (${ms.id}) has no type assigned`, entityType: 'MiniSection', entityId: ms.id });
      continue;
    }
    if (!validTypes.includes(type)) {
      issues.push({ severity: 'critical', category: 'invalid_type', message: `Mini-section "${ms.title}" has invalid type "${type}"`, entityType: 'MiniSection', entityId: ms.id });
      continue;
    }
    const rules = typeRules[type];
    const createsVars = (ms as any).creates_variable_keys as string[] | undefined;
    const createsArts = (ms as any).creates_artifact_ids as string[] | undefined;
    if (!rules.canCreateVariables && createsVars?.length) {
      issues.push({ severity: 'critical', category: 'type_constraint_violation', message: `Mini-section "${ms.title}" (${type}) has creates_variable_keys but type cannot create variables`, entityType: 'MiniSection', entityId: ms.id });
    }
    if (!rules.canCreateArtifacts && createsArts?.length) {
      issues.push({ severity: 'critical', category: 'type_constraint_violation', message: `Mini-section "${ms.title}" (${type}) has creates_artifact_ids but type cannot create artifacts`, entityType: 'MiniSection', entityId: ms.id });
    }
    // Orphaned creates references
    if (createsVars?.length) {
      for (const key of createsVars) {
        if (!varDefKeys.has(key)) {
          issues.push({ severity: 'warning', category: 'orphan_creates_variable', message: `Mini-section "${ms.title}" creates variable "${key}" but no VariableDefinition exists`, entityType: 'MiniSection', entityId: ms.id });
        }
      }
    }
    if (createsArts?.length) {
      for (const id of createsArts) {
        if (!allArtifactIds.has(id)) {
          issues.push({ severity: 'warning', category: 'orphan_creates_artifact', message: `Mini-section "${ms.title}" creates artifact "${id}" but no ArtifactDefinition exists`, entityType: 'MiniSection', entityId: ms.id });
        }
      }
    }
  }

  // 11. Curriculum order violations (variable referenced before created)
  const lessonMiniSections = new Map<string, typeof miniSections>();
  for (const ms of miniSections) {
    const arr = lessonMiniSections.get(ms.lesson_id) || [];
    arr.push(ms);
    lessonMiniSections.set(ms.lesson_id, arr);
  }
  for (const [, lessonMs] of lessonMiniSections) {
    const sorted = lessonMs.sort((a, b) => a.mini_section_order - b.mini_section_order);
    const createdByOrder = new Map<string, number>();
    for (const ms of sorted) {
      if ((ms as any).mini_section_type === 'prompt_template') {
        const keys = (ms as any).creates_variable_keys as string[] | undefined;
        if (keys) for (const k of keys) createdByOrder.set(k, ms.mini_section_order);
      }
    }
    for (const ms of sorted) {
      if (!ms.associated_variable_keys?.length) continue;
      for (const key of ms.associated_variable_keys) {
        const createdAt = createdByOrder.get(key);
        if (createdAt !== undefined && createdAt > ms.mini_section_order) {
          issues.push({ severity: 'warning', category: 'curriculum_order_violation', message: `Variable "${key}" used at order ${ms.mini_section_order} but created at order ${createdAt}`, entityType: 'MiniSection', entityId: ms.id });
        }
      }
    }
  }

  // Build summary
  const summary = {
    total_issues: issues.length,
    critical: issues.filter(i => i.severity === 'critical').length,
    warning: issues.filter(i => i.severity === 'warning').length,
    info: issues.filter(i => i.severity === 'info').length,
  };

  return {
    issues,
    summary,
    counts: {
      modules: modules.length,
      lessons: lessons.length,
      miniSections: miniSections.length,
      artifacts: artifacts.length,
      prompts: prompts.length,
      sectionConfigs: sectionConfigs.length,
      variableDefinitions: varDefs.length,
      sessions: sessions.length,
      gates: gates.length,
    },
  };
}

/**
 * Dry-run a section build — returns metadata about what the composite prompt
 * would include, without actually generating content.
 */
export async function dryRunSectionBuild(lessonId: string): Promise<DryRunResult> {
  const lesson = await CurriculumLesson.findByPk(lessonId);
  if (!lesson) {
    throw new Error(`Lesson ${lessonId} not found`);
  }

  const warnings: string[] = [];

  // Get mini-sections
  const miniSections = await MiniSection.findAll({
    where: { lesson_id: lessonId, is_active: true },
    order: [['mini_section_order', 'ASC']],
  });

  const wouldUseComposite = miniSections.length > 0;

  // Collect required variables
  const requiredVariables = new Set<string>();
  for (const ms of miniSections) {
    if (ms.associated_variable_keys?.length) {
      for (const key of ms.associated_variable_keys) {
        requiredVariables.add(key);
      }
    }
  }

  // Get linked artifacts
  const artifacts = await ArtifactDefinition.findAll({ where: { lesson_id: lessonId } });
  const linkedArtifacts = artifacts.map(a => ({
    id: a.id,
    name: a.name,
    type: a.artifact_type,
  }));

  // Collect linked skills from mini-sections and resolve names
  const skillIdSet = new Set<string>();
  for (const ms of miniSections) {
    if (ms.associated_skill_ids?.length) {
      for (const skillId of ms.associated_skill_ids) {
        skillIdSet.add(skillId);
      }
    }
  }
  let linkedSkills: string[] = [];
  if (skillIdSet.size > 0) {
    const skills = await SkillDefinition.findAll({
      where: { id: [...skillIdSet] },
      attributes: ['id', 'name'],
    });
    const skillNameMap = new Map(skills.map((s: any) => [s.id, s.name]));
    linkedSkills = [...skillIdSet].map(id => skillNameMap.get(id) || id);
  }

  // Check associated session
  let associatedSession: { id: string; title: string } | null = null;
  if (lesson.associated_session_id) {
    const session = await LiveSession.findByPk(lesson.associated_session_id);
    if (session) {
      associatedSession = { id: session.id, title: session.title };
    } else {
      warnings.push(`Associated session ${lesson.associated_session_id} not found`);
    }
  }

  // Check section config
  const sectionConfig = await SectionConfig.findOne({ where: { lesson_id: lessonId } });

  if (!wouldUseComposite) {
    warnings.push('No active mini-sections — will use V2 fallback prompt path');
  }

  // Build type breakdown
  const typeBreakdown: Record<string, number> = {};
  for (const ms of miniSections) {
    const type = (ms as any).mini_section_type || 'untyped';
    typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
  }

  return {
    lessonId,
    lessonTitle: lesson.title,
    wouldUseComposite,
    miniSectionCount: miniSections.length,
    typeBreakdown,
    requiredVariables: [...requiredVariables],
    linkedArtifacts,
    linkedSkills,
    associatedSession,
    sectionConfigExists: !!sectionConfig,
    warnings,
  };
}

/**
 * Final validation: combines quality scoring, diagnostics, and AI readiness
 * into a single pass/fail determination for deployment readiness.
 */
export async function runFinalValidation(lessonId: string): Promise<{
  passed: boolean;
  qualityCheck: { passed: boolean; average: number; belowThreshold: string[] };
  diagnosticCheck: { passed: boolean; failures: number; warnings: number };
  readinessCheck: { passed: boolean; score: number; blockers: string[] };
  summary: string;
}> {
  // Quality scoring
  const { scoreLessonMiniSections } = await import('./qualityScoringService');
  const qualityResult = await scoreLessonMiniSections(lessonId);
  const belowThreshold = qualityResult.scores
    .filter(s => s.overall < 60)
    .map(s => `${s.miniSectionId} (${s.overall})`);
  const qualityPassed = qualityResult.average >= 60 && belowThreshold.length === 0;

  // Diagnostics
  const { extensiveCheckLesson } = await import('./extensiveCheckService');
  const diagnostics = await extensiveCheckLesson(lessonId);
  const failures = diagnostics.filter(d => d.overallStatus === 'fail').length;
  const warnings = diagnostics.filter(d => d.overallStatus === 'warning').length;
  const diagnosticPassed = failures === 0;

  // AI Readiness
  const { checkAIReadiness } = await import('./aiReadinessService');
  const readiness = await checkAIReadiness(lessonId);
  const readinessPassed = readiness.readinessScore >= 80;

  const passed = qualityPassed && diagnosticPassed && readinessPassed;

  const parts: string[] = [];
  if (!qualityPassed) parts.push(`Quality: avg ${qualityResult.average}, ${belowThreshold.length} below threshold`);
  if (!diagnosticPassed) parts.push(`Diagnostics: ${failures} failure(s)`);
  if (!readinessPassed) parts.push(`Readiness: ${readiness.readinessScore}% (need 80%)`);

  return {
    passed,
    qualityCheck: { passed: qualityPassed, average: qualityResult.average, belowThreshold },
    diagnosticCheck: { passed: diagnosticPassed, failures, warnings },
    readinessCheck: { passed: readinessPassed, score: readiness.readinessScore, blockers: readiness.blockers },
    summary: passed ? 'All checks passed — ready for deployment' : `Blocked: ${parts.join('; ')}`,
  };
}
