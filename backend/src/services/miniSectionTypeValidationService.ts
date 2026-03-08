/**
 * Mini-Section Type Validation Service
 * Enforces type-specific permission rules and curriculum order constraints.
 */

import type { MiniSectionType, MiniSectionAttributes } from '../models/MiniSection';
import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';
import ArtifactDefinition from '../models/ArtifactDefinition';

export interface TypeValidationResult {
  valid: boolean;
  errors: string[];
}

const TYPE_RULES: Record<MiniSectionType, { canCreateVariables: boolean; canCreateArtifacts: boolean }> = {
  executive_reality_check: { canCreateVariables: false, canCreateArtifacts: false },
  ai_strategy:             { canCreateVariables: false, canCreateArtifacts: false },
  prompt_template:         { canCreateVariables: true,  canCreateArtifacts: false },
  implementation_task:     { canCreateVariables: false, canCreateArtifacts: true  },
  knowledge_check:         { canCreateVariables: false, canCreateArtifacts: false },
};

const VALID_TYPES: MiniSectionType[] = [
  'executive_reality_check', 'ai_strategy', 'prompt_template', 'implementation_task', 'knowledge_check',
];

export function getTypeRules() {
  return TYPE_RULES;
}

/**
 * Validate mini-section type constraints.
 * Checks that creates_variable_keys / creates_artifact_ids are only set on permitted types,
 * and that referenced definitions actually exist.
 */
export async function validateMiniSectionType(data: Partial<MiniSectionAttributes>): Promise<TypeValidationResult> {
  const errors: string[] = [];
  const type = data.mini_section_type;

  if (!type) {
    errors.push('mini_section_type is required');
    return { valid: false, errors };
  }

  if (!VALID_TYPES.includes(type)) {
    errors.push(`Invalid mini_section_type: ${type}. Must be one of: ${VALID_TYPES.join(', ')}`);
    return { valid: false, errors };
  }

  const rules = TYPE_RULES[type];

  // Check creates_variable_keys permission
  const createsVarKeys = data.creates_variable_keys;
  if (createsVarKeys && createsVarKeys.length > 0) {
    if (!rules.canCreateVariables) {
      errors.push(`Type "${type}" cannot create variables. Only "prompt_template" can set creates_variable_keys.`);
    } else {
      // Validate keys exist in VariableDefinition
      const existing = await VariableDefinition.findAll({
        where: { variable_key: createsVarKeys },
        attributes: ['variable_key'],
      });
      const existingKeys = new Set(existing.map(v => v.variable_key));
      for (const key of createsVarKeys) {
        if (!existingKeys.has(key)) {
          errors.push(`Variable definition not found for key "${key}". Register it in Variable Definitions first.`);
        }
      }
      // Check for duplicates within the array
      const seen = new Set<string>();
      for (const key of createsVarKeys) {
        if (seen.has(key)) {
          errors.push(`Duplicate creates_variable_keys entry: "${key}"`);
        }
        seen.add(key);
      }
    }
  }

  // Check creates_artifact_ids permission
  const createsArtIds = data.creates_artifact_ids;
  if (createsArtIds && createsArtIds.length > 0) {
    if (!rules.canCreateArtifacts) {
      errors.push(`Type "${type}" cannot create artifacts. Only "implementation_task" can set creates_artifact_ids.`);
    } else {
      // Validate IDs exist in ArtifactDefinition
      const existing = await ArtifactDefinition.findAll({
        where: { id: createsArtIds },
        attributes: ['id'],
      });
      const existingIds = new Set(existing.map(a => a.id));
      for (const id of createsArtIds) {
        if (!existingIds.has(id)) {
          errors.push(`Artifact definition not found for ID "${id}".`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate curriculum order: ensure no variable is referenced before it's created.
 * Walks all mini-sections in the lesson in order, tracking which variables become available.
 */
export async function validateCurriculumOrder(
  lessonId: string,
  currentOrder: number,
  associatedVariableKeys?: string[],
  excludeId?: string
): Promise<TypeValidationResult> {
  const errors: string[] = [];
  if (!associatedVariableKeys || associatedVariableKeys.length === 0) {
    return { valid: true, errors };
  }

  // Get all mini-sections for this lesson in order
  const allMiniSections = await MiniSection.findAll({
    where: { lesson_id: lessonId },
    order: [['mini_section_order', 'ASC']],
    attributes: ['id', 'mini_section_type', 'mini_section_order', 'creates_variable_keys'],
  });

  // Build set of variables available at the current position
  // Start with system/admin variables (always available)
  const systemVars = await VariableDefinition.findAll({
    where: { source_type: ['system', 'admin'] },
    attributes: ['variable_key'],
  });
  const availableKeys = new Set(systemVars.map(v => v.variable_key));

  // Walk mini-sections in order, accumulating created variables
  for (const ms of allMiniSections) {
    // Skip the mini-section being validated (it might be an update)
    if (excludeId && ms.id === excludeId) continue;

    // Only accumulate variables from mini-sections BEFORE the current position
    if (ms.mini_section_order >= currentOrder) break;

    if (ms.mini_section_type === 'prompt_template' && ms.creates_variable_keys?.length) {
      for (const key of ms.creates_variable_keys) {
        availableKeys.add(key);
      }
    }
  }

  // Check that all referenced variables are available
  for (const key of associatedVariableKeys) {
    if (!availableKeys.has(key)) {
      // Check if it's created by a LATER mini-section
      const laterCreator = allMiniSections.find(
        ms => ms.mini_section_order > currentOrder &&
              ms.creates_variable_keys?.includes(key) &&
              ms.id !== excludeId
      );
      if (laterCreator) {
        errors.push(`Variable "${key}" is created by mini-section at order ${laterCreator.mini_section_order}, but referenced at order ${currentOrder}. Move the creator before this mini-section.`);
      }
      // Not an error if the variable simply isn't created by any mini-section —
      // it may come from user input, LLM output, or prior lessons
    }
  }

  return { valid: errors.length === 0, errors };
}
