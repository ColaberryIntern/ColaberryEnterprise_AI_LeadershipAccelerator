import { MiniSection, SkillDefinition, ArtifactDefinition, VariableDefinition } from '../models';

export interface SyncReport {
  warnings: string[];
  missingVariables: string[];
  missingArtifacts: string[];
  missingSkills: string[];
  createdVariables: { key: string; miniSectionTitle: string; order: number }[];
  referencedVariables: { key: string; miniSectionTitle: string; order: number; definitionExists: boolean }[];
  orderViolations: string[];
}

/**
 * Run synchronization checks after a mini-section save.
 * Validates that all referenced entities exist and variable ordering is correct.
 */
export async function syncAfterSave(lessonId: string): Promise<SyncReport> {
  const miniSections = await MiniSection.findAll({
    where: { lesson_id: lessonId, is_active: true },
    order: [['mini_section_order', 'ASC']],
  });

  const warnings: string[] = [];
  const missingVariables: string[] = [];
  const missingArtifacts: string[] = [];
  const missingSkills: string[] = [];
  const createdVariables: SyncReport['createdVariables'] = [];
  const referencedVariables: SyncReport['referencedVariables'] = [];
  const orderViolations: string[] = [];

  // Collect all referenced entity IDs
  const allSkillIds = new Set<string>();
  const allVarKeys = new Set<string>();
  const allCreatedVarKeys = new Set<string>();
  const allArtifactIds = new Set<string>();

  for (const ms of miniSections) {
    for (const sid of ms.associated_skill_ids || []) allSkillIds.add(sid);
    for (const vk of ms.associated_variable_keys || []) allVarKeys.add(vk);
    for (const vk of ms.creates_variable_keys || []) allCreatedVarKeys.add(vk);
    for (const aid of ms.creates_artifact_ids || []) allArtifactIds.add(aid);

    // Track created variables with source info
    for (const vk of ms.creates_variable_keys || []) {
      createdVariables.push({ key: vk, miniSectionTitle: ms.title, order: ms.mini_section_order });
    }

    // Track referenced variables with source info
    for (const vk of ms.associated_variable_keys || []) {
      referencedVariables.push({ key: vk, miniSectionTitle: ms.title, order: ms.mini_section_order, definitionExists: false });
    }
  }

  // Validate skills exist
  if (allSkillIds.size > 0) {
    const existingSkills = await SkillDefinition.findAll({
      where: { skill_id: Array.from(allSkillIds) },
      attributes: ['skill_id'],
    });
    const existingSet = new Set(existingSkills.map(s => s.skill_id));
    for (const sid of allSkillIds) {
      if (!existingSet.has(sid)) {
        missingSkills.push(sid);
        warnings.push(`Skill "${sid}" referenced but not found in SkillDefinition`);
      }
    }
  }

  // Validate variable definitions exist
  if (allVarKeys.size > 0 || allCreatedVarKeys.size > 0) {
    const allKeys = new Set([...allVarKeys, ...allCreatedVarKeys]);
    const existingVars = await VariableDefinition.findAll({
      where: { variable_key: Array.from(allKeys) },
      attributes: ['variable_key'],
    });
    const existingSet = new Set(existingVars.map(v => v.variable_key));

    // Update referenced variables with definition status
    for (const rv of referencedVariables) {
      rv.definitionExists = existingSet.has(rv.key);
    }

    for (const vk of allVarKeys) {
      if (!existingSet.has(vk) && !allCreatedVarKeys.has(vk)) {
        missingVariables.push(vk);
        warnings.push(`Variable "${vk}" referenced but no VariableDefinition exists`);
      }
    }
    for (const vk of allCreatedVarKeys) {
      if (!existingSet.has(vk)) {
        missingVariables.push(vk);
        warnings.push(`Variable "${vk}" created by mini-section but no VariableDefinition exists — consider creating one`);
      }
    }
  }

  // Validate artifact definitions exist
  if (allArtifactIds.size > 0) {
    const existingArtifacts = await ArtifactDefinition.findAll({
      where: { id: Array.from(allArtifactIds) },
      attributes: ['id'],
    });
    const existingSet = new Set(existingArtifacts.map(a => a.id));
    for (const aid of allArtifactIds) {
      if (!existingSet.has(aid)) {
        missingArtifacts.push(aid);
        warnings.push(`Artifact "${aid}" referenced but not found in ArtifactDefinition`);
      }
    }
  }

  // Check variable ordering: variables should be created before they are referenced
  const createdVarMap = new Map<string, number>(); // key → earliest creation order
  for (const cv of createdVariables) {
    const existing = createdVarMap.get(cv.key);
    if (!existing || cv.order < existing) {
      createdVarMap.set(cv.key, cv.order);
    }
  }

  for (const rv of referencedVariables) {
    const creationOrder = createdVarMap.get(rv.key);
    if (creationOrder !== undefined && rv.order <= creationOrder) {
      const violation = `Variable "${rv.key}" is used in mini-section "${rv.miniSectionTitle}" (order ${rv.order}) but created at order ${creationOrder}`;
      orderViolations.push(violation);
      warnings.push(violation);
    }
  }

  return {
    warnings,
    missingVariables: [...new Set(missingVariables)],
    missingArtifacts: [...new Set(missingArtifacts)],
    missingSkills: [...new Set(missingSkills)],
    createdVariables,
    referencedVariables,
    orderViolations,
  };
}

/**
 * Get variable map for a lesson — used by the Variable Inspector panel.
 */
export async function getVariableMap(lessonId: string): Promise<{
  created: { key: string; miniSectionTitle: string; order: number }[];
  referenced: { key: string; miniSectionTitle: string; order: number; definitionExists: boolean }[];
  warnings: string[];
}> {
  const report = await syncAfterSave(lessonId);
  return {
    created: report.createdVariables,
    referenced: report.referencedVariables,
    warnings: report.warnings,
  };
}
