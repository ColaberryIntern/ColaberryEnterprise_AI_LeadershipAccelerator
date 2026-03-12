/**
 * Prompt Validation Service
 * Validates composite prompts before execution — catches missing variables,
 * unresolved placeholders, and broken template references.
 */

import { CurriculumLesson, MiniSection, PromptTemplate, SectionConfig, ArtifactDefinition } from '../models';
import VariableDefinition from '../models/VariableDefinition';
import * as variableService from './variableService';
import { getTypeRules } from './miniSectionTypeValidationService';

export interface PromptValidationResult {
  valid: boolean;
  lessonId: string;
  enrollmentId: string;
  miniSectionCount: number;
  missingVariables: string[];
  unresolvedPlaceholders: string[];
  templateErrors: { templateId: string; templateName: string; error: string }[];
  warnings: string[];
}

export interface PromptPreviewResult {
  systemPrompt: string;
  userPrompt: string;
  warnings: string[];
  resolvedVariables: Record<string, string>;
  unresolvedPlaceholders: string[];
}

/**
 * Extract all {{variable}} placeholders from a template string.
 */
function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

/**
 * Validate a composite prompt for a given lesson and enrollment.
 * Checks all template references, variable availability, and placeholder resolution.
 */
export async function validateCompositePrompt(
  lessonId: string,
  enrollmentId: string
): Promise<PromptValidationResult> {
  const result: PromptValidationResult = {
    valid: true,
    lessonId,
    enrollmentId,
    miniSectionCount: 0,
    missingVariables: [],
    unresolvedPlaceholders: [],
    templateErrors: [],
    warnings: [],
  };

  // Get lesson
  const lesson = await CurriculumLesson.findByPk(lessonId);
  if (!lesson) {
    result.valid = false;
    result.templateErrors.push({ templateId: '', templateName: '', error: `Lesson ${lessonId} not found` });
    return result;
  }

  // Get all variables for enrollment
  const allVars = await variableService.getAllVariables(enrollmentId);
  const availableKeys = new Set(Object.keys(allVars));

  // Get mini-sections
  const miniSections = await MiniSection.findAll({
    where: { lesson_id: lessonId, is_active: true },
    include: [
      { model: PromptTemplate, as: 'conceptPrompt' },
      { model: PromptTemplate, as: 'buildPrompt' },
      { model: PromptTemplate, as: 'mentorPrompt' },
    ],
    order: [['mini_section_order', 'ASC']],
  });

  result.miniSectionCount = miniSections.length;

  if (miniSections.length === 0) {
    result.warnings.push('No mini-sections found — will use V2 fallback path');
    return result;
  }

  // Check each mini-section's templates
  const allNeededVars = new Set<string>();

  for (const ms of miniSections) {
    const promptTypes = [
      { alias: 'conceptPrompt', prompt: (ms as any).conceptPrompt },
      { alias: 'buildPrompt', prompt: (ms as any).buildPrompt },
      { alias: 'mentorPrompt', prompt: (ms as any).mentorPrompt },
    ];

    for (const { alias, prompt } of promptTypes) {
      if (!prompt) continue;

      // Validate template exists and has content
      if (!prompt.user_prompt_template && !prompt.system_prompt_template) {
        result.templateErrors.push({
          templateId: prompt.id,
          templateName: prompt.name || alias,
          error: `Template has no prompt content (mini-section "${ms.title}", ${alias})`,
        });
        result.valid = false;
        continue;
      }

      // Extract placeholders from templates
      const templates = [
        prompt.user_prompt_template || '',
        prompt.system_prompt_template || '',
      ];

      for (const tmpl of templates) {
        const placeholders = extractPlaceholders(tmpl);
        for (const ph of placeholders) {
          allNeededVars.add(ph);
          if (!availableKeys.has(ph)) {
            result.unresolvedPlaceholders.push(`{{${ph}}} in template "${prompt.name || prompt.id}" (mini-section "${ms.title}")`);
          }
        }
      }
    }

    // Check associated_variable_keys
    if (ms.associated_variable_keys?.length) {
      for (const key of ms.associated_variable_keys) {
        allNeededVars.add(key);
      }
    }
  }

  // Check section config mentor prompt
  try {
    const sectionConfig = await SectionConfig.findOne({
      where: { lesson_id: lessonId },
      include: [{ model: PromptTemplate, as: 'mentorPrompt' }],
    });
    const mentorPrompt = (sectionConfig as any)?.mentorPrompt;
    if (mentorPrompt?.user_prompt_template) {
      const placeholders = extractPlaceholders(mentorPrompt.user_prompt_template);
      for (const ph of placeholders) {
        allNeededVars.add(ph);
        if (!availableKeys.has(ph)) {
          result.unresolvedPlaceholders.push(`{{${ph}}} in mentor prompt "${mentorPrompt.name || mentorPrompt.id}"`);
        }
      }
    }
  } catch { /* non-critical */ }

  // Check linked artifacts
  try {
    const artifacts = await ArtifactDefinition.findAll({ where: { lesson_id: lessonId } });
    if (artifacts.length === 0) {
      result.warnings.push('No artifact definitions linked to this lesson');
    }
  } catch { /* non-critical */ }

  // Determine missing variables (needed but not available)
  for (const key of allNeededVars) {
    if (!availableKeys.has(key)) {
      result.missingVariables.push(key);
    }
  }

  // Type-specific constraint validation
  const typeRules = await getTypeRules();
  for (const ms of miniSections) {
    const type = ms.mini_section_type;
    if (!type) {
      result.warnings.push(`Mini-section "${ms.title}" has no type assigned`);
      continue;
    }

    const rules = typeRules[type as keyof typeof typeRules];
    if (!rules) continue;

    if (!rules.canCreateVariables && ms.creates_variable_keys?.length) {
      result.warnings.push(`Mini-section "${ms.title}" (${type}) has creates_variable_keys but type cannot create variables`);
    }
    if (!rules.canCreateArtifacts && ms.creates_artifact_ids?.length) {
      result.warnings.push(`Mini-section "${ms.title}" (${type}) has creates_artifact_ids but type cannot create artifacts`);
    }

    // Validate creates references exist
    if (ms.creates_variable_keys?.length) {
      const defs = await VariableDefinition.findAll({ where: { variable_key: ms.creates_variable_keys }, attributes: ['variable_key'] });
      const found = new Set(defs.map(d => d.variable_key));
      for (const k of ms.creates_variable_keys) {
        if (!found.has(k)) result.warnings.push(`Mini-section "${ms.title}" creates variable "${k}" but no VariableDefinition exists`);
      }
    }
    if (ms.creates_artifact_ids?.length) {
      const defs = await ArtifactDefinition.findAll({ where: { id: ms.creates_artifact_ids }, attributes: ['id'] });
      const found = new Set(defs.map(d => d.id));
      for (const id of ms.creates_artifact_ids) {
        if (!found.has(id)) result.warnings.push(`Mini-section "${ms.title}" creates artifact "${id}" but no ArtifactDefinition exists`);
      }
    }
  }

  // Curriculum order validation: check variable creation ordering
  const createdVarsByOrder = new Map<number, string[]>();
  for (const ms of miniSections) {
    if (ms.mini_section_type === 'prompt_template' && ms.creates_variable_keys?.length) {
      createdVarsByOrder.set(ms.mini_section_order, ms.creates_variable_keys);
    }
  }
  for (const ms of miniSections) {
    if (!ms.associated_variable_keys?.length) continue;
    for (const key of ms.associated_variable_keys) {
      // Check if this variable is created by a later mini-section
      for (const [order, keys] of createdVarsByOrder) {
        if (order > ms.mini_section_order && keys.includes(key)) {
          result.warnings.push(`Variable "${key}" used by "${ms.title}" (order ${ms.mini_section_order}) is created at order ${order} — dependency ordering issue`);
        }
      }
    }
  }

  // Deduplicate
  result.missingVariables = [...new Set(result.missingVariables)];
  result.unresolvedPlaceholders = [...new Set(result.unresolvedPlaceholders)];

  if (result.missingVariables.length > 0 || result.templateErrors.length > 0) {
    result.valid = false;
  }

  return result;
}

/**
 * Dry-run a composite prompt: resolve all templates and return the assembled prompt
 * without sending to LLM.
 */
export async function dryRunCompositePrompt(
  lessonId: string,
  enrollmentId: string
): Promise<PromptPreviewResult> {
  const result: PromptPreviewResult = {
    systemPrompt: '',
    userPrompt: '',
    warnings: [],
    resolvedVariables: {},
    unresolvedPlaceholders: [],
  };

  const lesson = await CurriculumLesson.findByPk(lessonId);
  if (!lesson) {
    result.warnings.push(`Lesson ${lessonId} not found`);
    return result;
  }

  // Get all variables
  const allVars = await variableService.getAllVariables(enrollmentId);
  result.resolvedVariables = allVars;

  // Get mini-sections
  const miniSections = await MiniSection.findAll({
    where: { lesson_id: lessonId, is_active: true },
    include: [
      { model: PromptTemplate, as: 'conceptPrompt' },
      { model: PromptTemplate, as: 'buildPrompt' },
      { model: PromptTemplate, as: 'mentorPrompt' },
    ],
    order: [['mini_section_order', 'ASC']],
  });

  if (miniSections.length === 0) {
    result.warnings.push('No mini-sections — would use V2 fallback path');
    result.systemPrompt = '[V2 System Prompt]';
    result.userPrompt = `LESSON: ${lesson.title}\nDESCRIPTION: ${lesson.description}`;
    return result;
  }

  // Build the composite prompt (same logic as contentGenerationService but without LLM call)
  const parts: string[] = [];

  parts.push('=== SECTION BLUEPRINT ===');
  parts.push(`Section: ${lesson.title}`);
  parts.push(`Description: ${lesson.description}`);
  if (lesson.learning_goal) parts.push(`Learning Goal: ${lesson.learning_goal}`);
  parts.push('');

  parts.push('=== MINI-SECTIONS ===');
  for (const ms of miniSections) {
    parts.push(`\n--- Sub-Section ${ms.mini_section_order}: ${ms.title} ---`);
    if (ms.description) parts.push(`Description: ${ms.description}`);

    const conceptPrompt = (ms as any).conceptPrompt;
    if (conceptPrompt?.user_prompt_template) {
      const resolved = resolveInline(conceptPrompt.user_prompt_template, allVars);
      parts.push(`Concept Prompt: ${resolved.text}`);
      result.unresolvedPlaceholders.push(...resolved.unresolved);
    }

    const buildPrompt = (ms as any).buildPrompt;
    if (buildPrompt?.user_prompt_template) {
      const resolved = resolveInline(buildPrompt.user_prompt_template, allVars);
      parts.push(`Build Prompt: ${resolved.text}`);
      result.unresolvedPlaceholders.push(...resolved.unresolved);
    }
  }

  parts.push('\n=== LEARNER CONTEXT ===');
  parts.push(`Variables: ${Object.keys(allVars).length} available`);

  result.systemPrompt = '[V2 System Prompt - 7-Layer Composite]';
  result.userPrompt = parts.join('\n');
  result.unresolvedPlaceholders = [...new Set(result.unresolvedPlaceholders)];

  return result;
}

/**
 * Resolve template inline and track unresolved placeholders.
 */
function resolveInline(template: string, vars: Record<string, string>): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];
  let resolved = template;
  for (const [key, value] of Object.entries(vars)) {
    resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  // Find remaining unresolved
  const remaining = resolved.match(/\{\{(\w+)\}\}/g) || [];
  for (const m of remaining) {
    unresolved.push(m.replace(/\{\{|\}\}/g, ''));
  }
  return { text: resolved, unresolved };
}
