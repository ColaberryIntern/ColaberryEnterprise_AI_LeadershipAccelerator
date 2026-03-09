import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';
const { v4: uuidv4 } = require('uuid');

interface RepairFix {
  action: string;
  field: string;
  oldValue: any;
  newValue: any;
}

interface RepairResult {
  miniSectionId: string;
  appliedFixes: RepairFix[];
  skippedFixes: { action: string; reason: string }[];
  previousScore: number;
  newQualityScore: number;
}

const DEFAULT_PROMPTS: Record<string, string> = {
  executive_reality_check: 'Analyze {{industry}} trends and their impact on {{company_name}}. Consider the current {{ai_maturity_level}} AI maturity level and identify key opportunities for {{role}} leadership.',
  ai_strategy: 'Develop an AI strategy for {{company_name}} in the {{industry}} sector. Consider current maturity level {{ai_maturity_level}} and focus on {{identified_use_case}}.',
  prompt_template: 'Create a structured analysis for {{company_name}} in {{industry}}. As a {{role}}, focus on practical applications and ROI considerations.',
  implementation_task: 'Build a practical deliverable for {{company_name}} that demonstrates application in {{industry}}. Include evaluation criteria and expected outcomes.',
  knowledge_check: 'Assess understanding with scenario-based questions relevant to {{industry}} professionals at the {{role}} level.',
};

export async function autoRepairMiniSection(id: string, dryRun = false): Promise<RepairResult> {
  const ms = await MiniSection.findByPk(id);
  if (!ms) throw new Error('Mini-section not found');

  const previousScore = ms.quality_score || 0;
  const applied: RepairFix[] = [];
  const skipped: { action: string; reason: string }[] = [];
  const updates: Record<string, any> = {};

  const type = ms.mini_section_type;

  // 1. Add placeholder prompts (only fills null fields)
  const promptFields = ['concept_prompt_user', 'build_prompt_user', 'mentor_prompt_user', 'kc_prompt_user', 'reflection_prompt_user'];
  for (const field of promptFields) {
    const current = (ms as any)[field];
    if (!current) {
      const template = DEFAULT_PROMPTS[type] || 'Configure this prompt for your use case.';
      updates[field] = template;
      applied.push({ action: 'add_placeholder_prompt', field, oldValue: null, newValue: template });
    }
  }

  // 2. Create variable definitions for undefined referenced vars
  const referenced = ms.associated_variable_keys || [];
  if (referenced.length > 0) {
    const defs = await VariableDefinition.findAll({ where: { variable_key: referenced } });
    const defKeys = new Set(defs.map(d => d.variable_key));
    for (const key of referenced) {
      if (!defKeys.has(key)) {
        if (!dryRun) {
          await VariableDefinition.findOrCreate({
            where: { variable_key: key },
            defaults: {
              id: uuidv4(),
              display_name: key.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
              data_type: 'text',
              scope: 'program',
              source_type: 'llm_output',
              is_active: true,
              sort_order: 999,
            } as any,
          });
        }
        applied.push({ action: 'create_variable_definition', field: 'variable_definitions', oldValue: null, newValue: key });
      }
    }
  }

  // 3. Normalize variable key casing
  const created = ms.creates_variable_keys || [];
  const normalizedCreated = created.map(k => k.toLowerCase().trim());
  const normalizedReferenced = referenced.map(k => k.toLowerCase().trim());
  if (JSON.stringify(created) !== JSON.stringify(normalizedCreated)) {
    updates.creates_variable_keys = normalizedCreated;
    applied.push({ action: 'normalize_casing', field: 'creates_variable_keys', oldValue: created, newValue: normalizedCreated });
  }
  if (JSON.stringify(referenced) !== JSON.stringify(normalizedReferenced)) {
    updates.associated_variable_keys = normalizedReferenced;
    applied.push({ action: 'normalize_casing', field: 'associated_variable_keys', oldValue: referenced, newValue: normalizedReferenced });
  }

  // 4. Set default KC config
  if (type === 'knowledge_check' && !ms.knowledge_check_config?.enabled) {
    const defaultConfig = { enabled: true, question_count: 3, pass_score: 70 };
    updates.knowledge_check_config = defaultConfig;
    applied.push({ action: 'set_default_kc_config', field: 'knowledge_check_config', oldValue: ms.knowledge_check_config, newValue: defaultConfig });
  }

  // 5. Add placeholder learning goal
  const settingsJson = ms.settings_json || {};
  if (!settingsJson.learning_goal) {
    const goal = `Understand and apply ${ms.title || 'this concept'} in a real-world business context.`;
    updates.settings_json = { ...settingsJson, learning_goal: goal };
    applied.push({ action: 'add_placeholder_learning_goal', field: 'settings_json.learning_goal', oldValue: null, newValue: goal });
  }

  // 6. Remove orphan FK references
  const { PromptTemplate } = await import('../models');
  for (const fkField of ['concept_prompt_template_id', 'build_prompt_template_id', 'mentor_prompt_template_id']) {
    const fkValue = (ms as any)[fkField];
    if (fkValue) {
      const exists = await PromptTemplate.findByPk(fkValue);
      if (!exists) {
        updates[fkField] = null;
        applied.push({ action: 'remove_orphan_refs', field: fkField, oldValue: fkValue, newValue: null });
      }
    }
  }

  // Apply updates
  if (!dryRun && Object.keys(updates).length > 0) {
    // Set prompt_source based on what we now have
    if (updates.concept_prompt_user || updates.build_prompt_user || updates.mentor_prompt_user) {
      updates.prompt_source = 'inline';
    }
    await ms.update(updates);
  }

  // Re-score
  let newScore = previousScore;
  if (!dryRun) {
    const { scoreMiniSection } = await import('./qualityScoringService');
    const result = await scoreMiniSection(id);
    newScore = result.overall;
  }

  return {
    miniSectionId: id,
    appliedFixes: applied,
    skippedFixes: skipped,
    previousScore,
    newQualityScore: newScore,
  };
}

export async function autoRepairLesson(lessonId: string, dryRun = false): Promise<RepairResult[]> {
  const miniSections = await MiniSection.findAll({ where: { lesson_id: lessonId, is_active: true } });
  const results: RepairResult[] = [];
  for (const ms of miniSections) {
    results.push(await autoRepairMiniSection(ms.id, dryRun));
  }
  return results;
}

export async function autoRepairAll(dryRun = false): Promise<{ total: number; repaired: number; results: RepairResult[] }> {
  const all = await MiniSection.findAll({ where: { is_active: true } });
  const results: RepairResult[] = [];
  let repaired = 0;
  for (const ms of all) {
    const result = await autoRepairMiniSection(ms.id, dryRun);
    if (result.appliedFixes.length > 0) repaired++;
    results.push(result);
  }
  return { total: all.length, repaired, results };
}
