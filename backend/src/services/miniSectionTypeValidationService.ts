/**
 * Mini-Section Type Validation Service
 * Enforces type-specific permission rules and curriculum order constraints.
 * Now loads rules dynamically from CurriculumTypeDefinition table.
 */

import type { MiniSectionAttributes } from '../models/MiniSection';
import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';
import ArtifactDefinition from '../models/ArtifactDefinition';
import CurriculumTypeDefinition from '../models/CurriculumTypeDefinition';

export interface TypeValidationResult {
  valid: boolean;
  errors: string[];
}

// In-memory cache for type rules (refreshed every 60s)
let _typeRulesCache: Record<string, { canCreateVariables: boolean; canCreateArtifacts: boolean }> | null = null;
let _typeRulesCacheTs = 0;
const CACHE_TTL_MS = 60_000;

// Fallback rules for the 5 system types (used if DB not yet seeded)
const FALLBACK_RULES: Record<string, { canCreateVariables: boolean; canCreateArtifacts: boolean }> = {
  executive_reality_check: { canCreateVariables: false, canCreateArtifacts: false },
  ai_strategy:             { canCreateVariables: false, canCreateArtifacts: false },
  prompt_template:         { canCreateVariables: true,  canCreateArtifacts: false },
  implementation_task:     { canCreateVariables: false, canCreateArtifacts: true  },
  knowledge_check:         { canCreateVariables: false, canCreateArtifacts: false },
};

async function loadTypeRules(): Promise<Record<string, { canCreateVariables: boolean; canCreateArtifacts: boolean }>> {
  if (_typeRulesCache && Date.now() - _typeRulesCacheTs < CACHE_TTL_MS) {
    return _typeRulesCache;
  }
  try {
    const types = await CurriculumTypeDefinition.findAll({
      where: { is_active: true },
      attributes: ['slug', 'can_create_variables', 'can_create_artifacts'],
    });
    const rules: Record<string, { canCreateVariables: boolean; canCreateArtifacts: boolean }> = {};
    for (const t of types) {
      rules[t.slug] = {
        canCreateVariables: t.can_create_variables,
        canCreateArtifacts: t.can_create_artifacts,
      };
    }
    _typeRulesCache = rules;
    _typeRulesCacheTs = Date.now();
    return rules;
  } catch {
    // DB not ready yet — use fallback
    return FALLBACK_RULES;
  }
}

export async function getTypeRules() {
  return loadTypeRules();
}

/** Clear the cache (useful after type CRUD operations) */
export function invalidateTypeRulesCache() {
  _typeRulesCache = null;
  _typeRulesCacheTs = 0;
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

  const rules = await loadTypeRules();
  const validTypes = Object.keys(rules);

  if (!validTypes.includes(type)) {
    errors.push(`Invalid mini_section_type: ${type}. Must be one of: ${validTypes.join(', ')}`);
    return { valid: false, errors };
  }

  const typeRule = rules[type];

  // Check creates_variable_keys permission
  const createsVarKeys = data.creates_variable_keys;
  if (createsVarKeys && createsVarKeys.length > 0) {
    if (!typeRule.canCreateVariables) {
      errors.push(`Type "${type}" cannot create variables.`);
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
    if (!typeRule.canCreateArtifacts) {
      errors.push(`Type "${type}" cannot create artifacts.`);
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

  // Load type rules to know which types can create variables
  const rules = await loadTypeRules();
  const varCreatorTypes = new Set(
    Object.entries(rules).filter(([, r]) => r.canCreateVariables).map(([slug]) => slug)
  );

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

    if (varCreatorTypes.has(ms.mini_section_type) && ms.creates_variable_keys?.length) {
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
    }
  }

  return { valid: errors.length === 0, errors };
}
