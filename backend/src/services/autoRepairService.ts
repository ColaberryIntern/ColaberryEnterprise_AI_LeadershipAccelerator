import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';
import {
  getVariableFlowMap,
  getVariableReconciliation,
  VariableFlowEntry,
} from './variableFlowService';
const { v4: uuidv4 } = require('uuid');

// ─── Debug Logging ──────────────────────────────────────────────────

const DEBUG = process.env.DEBUG_CONTROL_TOWER === 'true';
function debugLog(msg: string, data?: any) {
  if (DEBUG) console.log(`[ControlTower:Repair] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
}

// ─── Types ──────────────────────────────────────────────────────────

export interface RepairFix {
  action: string;
  field: string;
  oldValue: any;
  newValue: any;
}

export interface RepairResult {
  miniSectionId: string;
  appliedFixes: RepairFix[];
  skippedFixes: { action: string; reason: string }[];
  previousScore: number;
  newQualityScore: number;
}

export interface RepairAction {
  action_type: string;
  variable_key?: string;
  target_id?: string;
  target_label: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
  downstream_sections: string[];
  blocked: boolean;
  block_reason?: string;
}

export interface RepairPlan {
  generated_at: string;
  overall_risk_level: 'low' | 'medium' | 'high';
  impact_summary: {
    total_actions: number;
    safe_actions: number;
    blocked_actions: number;
    affected_sections: number;
    affected_variables: number;
  };
  actions: RepairAction[];
}

// ─── Safe Repair Rules ──────────────────────────────────────────────

const SAFE_REPAIR_RULES = {
  allowed: [
    'create_variable_definition',
    'normalize_casing',
    'add_placeholder_prompt',
    'add_placeholder_learning_goal',
    'set_default_kc_config',
    'remove_orphan_refs',
  ],
  blocked: [
    'fix_timeline_order',
    'delete_variable',
    'reorder_sections',
    'change_variable_meaning',
    'remove_variable_used_downstream',
  ],
};

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

// ─── Control Tower: Program-Level Repair Plan ───────────────────────

function computeDownstreamSections(variableKey: string, flowMap: VariableFlowEntry[]): string[] {
  const entry = flowMap.find(e => e.variable_key === variableKey);
  if (!entry) return [];
  return entry.consumed_in.map(c => c.lesson_title);
}

function computeRiskLevel(downstreamCount: number): 'low' | 'medium' | 'high' {
  if (downstreamCount > 6) return 'high';
  if (downstreamCount > 3) return 'medium';
  return 'low';
}

function isBlocked(actionType: string): { blocked: boolean; reason?: string } {
  if (SAFE_REPAIR_RULES.blocked.includes(actionType)) {
    return { blocked: true, reason: `Action "${actionType}" is blocked by safe repair rules` };
  }
  return { blocked: false };
}

export async function generateRepairPlan(): Promise<RepairPlan> {
  const actions: RepairAction[] = [];
  const affectedSections = new Set<string>();
  const affectedVariables = new Set<string>();

  // 1. Get flow map for impact analysis
  const flowMap = await getVariableFlowMap();

  // 2. Get reconciliation for undefined + orphaned
  const recon = await getVariableReconciliation();

  // Undefined references → create_variable_definition
  for (const ref of recon.undefined_refs) {
    const downstream = computeDownstreamSections(ref.key, flowMap);
    for (const s of ref.used_in_sections) affectedSections.add(s);
    affectedVariables.add(ref.key);

    actions.push({
      action_type: 'create_variable_definition',
      variable_key: ref.key,
      target_label: ref.key,
      description: `Create VariableDefinition for "${ref.key}" (referenced in ${ref.used_in_sections.join(', ')})`,
      risk_level: computeRiskLevel(downstream.length),
      downstream_sections: downstream,
      blocked: false,
    });
  }

  // Orphaned definitions → flag for review (not auto-delete)
  for (const orphan of recon.orphaned_defs) {
    const downstream = computeDownstreamSections(orphan.key, flowMap);
    affectedVariables.add(orphan.key);

    actions.push({
      action_type: 'remove_orphaned_definition',
      variable_key: orphan.key,
      target_label: orphan.display_name,
      description: `"${orphan.key}" (${orphan.display_name}) is defined but never referenced — review for removal`,
      risk_level: 'low',
      downstream_sections: downstream,
      blocked: false,
    });
  }

  // Timeline violations → structural fix needed (blocked)
  for (const entry of flowMap) {
    if (entry.timeline_violation) {
      const consumed = entry.consumed_in.map(c => c.lesson_title);
      for (const s of consumed) affectedSections.add(s);
      affectedVariables.add(entry.variable_key);

      const blockCheck = isBlocked('fix_timeline_order');
      actions.push({
        action_type: 'fix_timeline_order',
        variable_key: entry.variable_key,
        target_label: entry.variable_key,
        description: `"${entry.variable_key}" consumed before produced — requires section reordering`,
        risk_level: 'high',
        downstream_sections: consumed,
        blocked: blockCheck.blocked,
        block_reason: blockCheck.reason,
      });
    }
  }

  // 3. Get mini-section-level dry run for additional actions
  const dryRunResults = await autoRepairAll(true);
  for (const result of dryRunResults.results) {
    for (const fix of result.appliedFixes) {
      const blockCheck = isBlocked(fix.action);
      const downstream = fix.action === 'create_variable_definition' && fix.newValue
        ? computeDownstreamSections(fix.newValue, flowMap)
        : [];

      if (fix.newValue) affectedVariables.add(typeof fix.newValue === 'string' ? fix.newValue : fix.field);

      actions.push({
        action_type: fix.action,
        variable_key: typeof fix.newValue === 'string' ? fix.newValue : undefined,
        target_id: result.miniSectionId,
        target_label: `Mini-section ${result.miniSectionId.slice(0, 8)}`,
        description: `${fix.action}: ${fix.field} → ${typeof fix.newValue === 'string' ? fix.newValue.slice(0, 60) : JSON.stringify(fix.newValue).slice(0, 60)}`,
        risk_level: computeRiskLevel(downstream.length),
        downstream_sections: downstream,
        blocked: blockCheck.blocked,
        block_reason: blockCheck.reason,
      });
    }
  }

  // Deduplicate create_variable_definition actions by variable_key
  const seen = new Set<string>();
  const dedupedActions: RepairAction[] = [];
  for (const action of actions) {
    const dedupeKey = `${action.action_type}:${action.variable_key || action.target_id || ''}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      dedupedActions.push(action);
    }
  }

  // Compute overall risk level
  const nonBlockedActions = dedupedActions.filter(a => !a.blocked);
  let overallRisk: 'low' | 'medium' | 'high' = 'low';
  if (nonBlockedActions.some(a => a.risk_level === 'high')) overallRisk = 'high';
  else if (nonBlockedActions.some(a => a.risk_level === 'medium')) overallRisk = 'medium';

  const plan: RepairPlan = {
    generated_at: new Date().toISOString(),
    overall_risk_level: overallRisk,
    impact_summary: {
      total_actions: dedupedActions.length,
      safe_actions: dedupedActions.filter(a => !a.blocked).length,
      blocked_actions: dedupedActions.filter(a => a.blocked).length,
      affected_sections: affectedSections.size,
      affected_variables: affectedVariables.size,
    },
    actions: dedupedActions,
  };

  debugLog('Repair plan generated', {
    total: plan.impact_summary.total_actions,
    safe: plan.impact_summary.safe_actions,
    blocked: plan.impact_summary.blocked_actions,
  });

  return plan;
}

export async function previewRepairPlan(): Promise<{ plan: RepairPlan; dryRunResults: RepairResult[] }> {
  const plan = await generateRepairPlan();
  const dryRunResults = await autoRepairAll(true);
  return { plan, dryRunResults: dryRunResults.results };
}
