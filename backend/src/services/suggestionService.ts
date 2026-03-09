import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';

interface Suggestion {
  id: string;
  miniSectionId: string;
  category: 'prompt' | 'variable' | 'skill' | 'artifact' | 'validation' | 'testing';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  autoFixable: boolean;
  fixAction?: string;
  fixParams?: Record<string, any>;
  targetSection?: string;
}

const DEFAULT_PROMPTS: Record<string, string> = {
  executive_reality_check: 'Analyze {{industry}} trends and their impact on {{company_name}}. Consider the current {{ai_maturity_level}} AI maturity level and identify key opportunities for {{role}} leadership.',
  ai_strategy: 'Develop an AI strategy for {{company_name}} in the {{industry}} sector. Consider current maturity level {{ai_maturity_level}} and focus on {{identified_use_case}}.',
  prompt_template: 'Create a structured analysis of {{topic}} for {{company_name}} in {{industry}}. As a {{role}}, focus on practical applications and ROI considerations.',
  implementation_task: 'Build a practical deliverable for {{company_name}} that demonstrates {{topic}} application in {{industry}}. Include evaluation criteria and expected outcomes.',
  knowledge_check: 'Assess understanding of {{topic}} with scenario-based questions relevant to {{industry}} professionals at the {{role}} level.',
};

export async function getSuggestions(miniSectionId: string): Promise<Suggestion[]> {
  const ms = await MiniSection.findByPk(miniSectionId);
  if (!ms) throw new Error('Mini-section not found');

  const suggestions: Suggestion[] = [];
  const type = ms.mini_section_type;

  // Prompt suggestions
  const promptFields: { field: string; label: string }[] = [
    { field: 'concept_prompt_user', label: 'concept user prompt' },
    { field: 'build_prompt_user', label: 'build user prompt' },
    { field: 'mentor_prompt_user', label: 'mentor user prompt' },
    { field: 'kc_prompt_user', label: 'KC user prompt' },
    { field: 'reflection_prompt_user', label: 'reflection user prompt' },
  ];

  for (const pf of promptFields) {
    const value = (ms as any)[pf.field] as string;
    if (!value) {
      suggestions.push({
        id: `prompt-missing-${pf.field}-${miniSectionId}`,
        miniSectionId,
        category: 'prompt',
        severity: 'warning',
        description: `Missing ${pf.label}`,
        autoFixable: true,
        fixAction: 'add_placeholder_prompt',
        fixParams: { field: pf.field, template: DEFAULT_PROMPTS[type] || 'Configure this prompt for your use case.' },
        targetSection: 'prompts',
      });
    } else if (value.length < 50) {
      suggestions.push({
        id: `prompt-short-${pf.field}-${miniSectionId}`,
        miniSectionId,
        category: 'prompt',
        severity: 'info',
        description: `${pf.label} is only ${value.length} chars — expand for better generation quality`,
        autoFixable: false,
        targetSection: 'prompts',
      });
    }
  }

  // Variable suggestions
  const referenced = ms.associated_variable_keys || [];
  if (referenced.length > 0) {
    const defs = await VariableDefinition.findAll({ where: { variable_key: referenced } });
    const defKeys = new Set(defs.map(d => d.variable_key));
    for (const key of referenced) {
      if (!defKeys.has(key)) {
        suggestions.push({
          id: `var-undefined-${key}-${miniSectionId}`,
          miniSectionId,
          category: 'variable',
          severity: 'warning',
          description: `Variable "${key}" is referenced but not defined`,
          autoFixable: true,
          fixAction: 'create_variable_definition',
          fixParams: { key, displayName: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), dataType: 'text', sourceType: 'llm_output' },
          targetSection: 'variables',
        });
      }
    }
  }

  // Skill suggestions
  if (type === 'knowledge_check' && (!ms.associated_skill_ids || ms.associated_skill_ids.length === 0)) {
    suggestions.push({
      id: `skill-missing-kc-${miniSectionId}`,
      miniSectionId,
      category: 'skill',
      severity: 'critical',
      description: 'Knowledge check has no skills mapped — score cannot be attributed',
      autoFixable: false,
      targetSection: 'skills',
    });
  } else if (!ms.associated_skill_ids || ms.associated_skill_ids.length === 0) {
    suggestions.push({
      id: `skill-empty-${miniSectionId}`,
      miniSectionId,
      category: 'skill',
      severity: 'info',
      description: 'No skills mapped (optional for this type)',
      autoFixable: false,
      targetSection: 'skills',
    });
  }

  // Artifact suggestions
  if (type === 'implementation_task' && (!ms.creates_artifact_ids || ms.creates_artifact_ids.length === 0)) {
    suggestions.push({
      id: `artifact-missing-impl-${miniSectionId}`,
      miniSectionId,
      category: 'artifact',
      severity: 'warning',
      description: 'Implementation task has no artifacts linked',
      autoFixable: false,
      targetSection: 'artifacts',
    });
  }

  // Validation suggestions
  if (!ms.description) {
    suggestions.push({
      id: `validation-desc-${miniSectionId}`,
      miniSectionId,
      category: 'validation',
      severity: 'info',
      description: 'Add a description for better context',
      autoFixable: false,
      targetSection: 'core',
    });
  }

  const settingsJson = ms.settings_json || {};
  if (!settingsJson.learning_goal) {
    suggestions.push({
      id: `validation-goal-${miniSectionId}`,
      miniSectionId,
      category: 'validation',
      severity: 'warning',
      description: 'Missing learning goal',
      autoFixable: true,
      fixAction: 'add_placeholder_learning_goal',
      fixParams: { goal: `Understand and apply ${ms.title || 'this concept'} in a real-world business context.` },
      targetSection: 'core',
    });
  }

  // KC config
  if (type === 'knowledge_check' && !ms.knowledge_check_config?.enabled) {
    suggestions.push({
      id: `kc-config-${miniSectionId}`,
      miniSectionId,
      category: 'testing',
      severity: 'warning',
      description: 'Knowledge check config not enabled',
      autoFixable: true,
      fixAction: 'set_default_kc_config',
      fixParams: { config: { enabled: true, question_count: 3, pass_score: 70 } },
      targetSection: 'kc',
    });
  }

  return suggestions;
}
