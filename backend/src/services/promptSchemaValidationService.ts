/**
 * Validates LLM-generated V2 content against the expected JSON schema.
 * Checks structure, required fields, types, and content quality.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sections: {
    concept_snapshot: boolean;
    ai_strategy: boolean;
    prompt_template: boolean;
    implementation_task: boolean;
    knowledge_checks: boolean;
  };
}

export function validateV2Output(content: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sections = {
    concept_snapshot: false,
    ai_strategy: false,
    prompt_template: false,
    implementation_task: false,
    knowledge_checks: false,
  };

  if (!content || typeof content !== 'object') {
    errors.push('Content is not a valid JSON object');
    return { valid: false, errors, warnings, sections };
  }

  // Concept Snapshot
  if (content.concept_snapshot) {
    const cs = content.concept_snapshot;
    sections.concept_snapshot = true;
    if (!cs.title || typeof cs.title !== 'string') errors.push('concept_snapshot.title is required (string)');
    if (!cs.definition || typeof cs.definition !== 'string') errors.push('concept_snapshot.definition is required (string)');
    if (!cs.why_it_matters || typeof cs.why_it_matters !== 'string') errors.push('concept_snapshot.why_it_matters is required (string)');
    if (!cs.visual_metaphor || typeof cs.visual_metaphor !== 'string') warnings.push('concept_snapshot.visual_metaphor is missing');
    if (cs.definition && cs.definition.length < 20) warnings.push('concept_snapshot.definition seems too short');
  } else {
    warnings.push('concept_snapshot section is missing');
  }

  // AI Strategy
  if (content.ai_strategy) {
    const ai = content.ai_strategy;
    sections.ai_strategy = true;
    if (!ai.description || typeof ai.description !== 'string') errors.push('ai_strategy.description is required (string)');
    if (!Array.isArray(ai.when_to_use_ai) || ai.when_to_use_ai.length === 0) errors.push('ai_strategy.when_to_use_ai must be a non-empty array');
    if (!Array.isArray(ai.human_responsibilities) || ai.human_responsibilities.length === 0) errors.push('ai_strategy.human_responsibilities must be a non-empty array');
    if (!ai.suggested_prompt || typeof ai.suggested_prompt !== 'string') warnings.push('ai_strategy.suggested_prompt is missing');
  } else {
    warnings.push('ai_strategy section is missing');
  }

  // Prompt Template
  if (content.prompt_template) {
    const pt = content.prompt_template;
    sections.prompt_template = true;
    if (!pt.template || typeof pt.template !== 'string') errors.push('prompt_template.template is required (string)');
    if (!Array.isArray(pt.placeholders)) warnings.push('prompt_template.placeholders should be an array');
    if (pt.template && pt.placeholders && Array.isArray(pt.placeholders)) {
      // Check for unresolved placeholders
      const templatePlaceholders = pt.template.match(/\{\{(\w+)\}\}/g) || [];
      const definedNames = new Set(pt.placeholders.map((p: any) => p.name));
      for (const ph of templatePlaceholders) {
        const name = ph.replace(/\{\{|\}\}/g, '');
        if (!definedNames.has(name) && !['company_name', 'industry', 'role'].includes(name)) {
          warnings.push(`Placeholder {{${name}}} in template not defined in placeholders array`);
        }
      }
    }
    if (!pt.expected_output_shape) warnings.push('prompt_template.expected_output_shape is missing');
  } else {
    warnings.push('prompt_template section is missing');
  }

  // Implementation Task
  if (content.implementation_task) {
    const it = content.implementation_task;
    sections.implementation_task = true;
    if (!it.title || typeof it.title !== 'string') errors.push('implementation_task.title is required (string)');
    if (!it.description || typeof it.description !== 'string') errors.push('implementation_task.description is required (string)');
    if (!it.deliverable || typeof it.deliverable !== 'string') errors.push('implementation_task.deliverable is required (string)');
    if (!Array.isArray(it.requirements) || it.requirements.length === 0) warnings.push('implementation_task.requirements should be a non-empty array');
    if (!Array.isArray(it.required_artifacts)) warnings.push('implementation_task.required_artifacts should be an array');
    if (it.required_artifacts && Array.isArray(it.required_artifacts)) {
      for (let i = 0; i < it.required_artifacts.length; i++) {
        const art = it.required_artifacts[i];
        if (!art.name) errors.push(`implementation_task.required_artifacts[${i}].name is required`);
        if (!art.file_types || !Array.isArray(art.file_types)) warnings.push(`implementation_task.required_artifacts[${i}].file_types should be an array`);
      }
    }
  } else {
    warnings.push('implementation_task section is missing');
  }

  // Knowledge Checks
  if (content.knowledge_checks) {
    const kc = content.knowledge_checks;
    if (typeof kc === 'object' && !Array.isArray(kc)) {
      // V2 format: grouped by section type
      sections.knowledge_checks = true;
      for (const [section, checks] of Object.entries(kc)) {
        if (!Array.isArray(checks)) continue;
        for (let i = 0; i < (checks as any[]).length; i++) {
          const check = (checks as any[])[i];
          if (!check.question) errors.push(`knowledge_checks.${section}[${i}].question is required`);
          if (!Array.isArray(check.options) || check.options.length < 2) errors.push(`knowledge_checks.${section}[${i}].options must have at least 2 options`);
          if (!check.explanation) warnings.push(`knowledge_checks.${section}[${i}].explanation is missing`);
        }
      }
    } else if (Array.isArray(kc)) {
      // Flat array format
      sections.knowledge_checks = true;
      for (let i = 0; i < kc.length; i++) {
        if (!kc[i].question) errors.push(`knowledge_checks[${i}].question is required`);
        if (!Array.isArray(kc[i].options) || kc[i].options.length < 2) errors.push(`knowledge_checks[${i}].options must have at least 2 options`);
      }
    }
  } else {
    warnings.push('knowledge_checks section is missing');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sections,
  };
}
