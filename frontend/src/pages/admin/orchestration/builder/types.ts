// Shared TypeScript interfaces for the Mini-Section Builder

export type MiniSectionType = 'executive_reality_check' | 'ai_strategy' | 'prompt_template' | 'implementation_task' | 'knowledge_check';

export interface MiniSection {
  id: string;
  lesson_id: string;
  mini_section_type: MiniSectionType;
  mini_section_order: number;
  title: string;
  description: string;
  concept_prompt_template_id: string;
  build_prompt_template_id: string;
  mentor_prompt_template_id: string;
  associated_skill_ids: string[];
  associated_variable_keys: string[];
  associated_artifact_ids: string[];
  creates_variable_keys: string[];
  creates_artifact_ids: string[];
  knowledge_check_config: { enabled: boolean; question_count: number; pass_score: number } | null;
  completion_weight: number;
  is_active: boolean;
  settings_json?: Record<string, any>;
  conceptPrompt?: { id: string; name: string };
  buildPrompt?: { id: string; name: string };
  mentorPrompt?: { id: string; name: string };
}

export interface Module { id: string; module_number: number; title: string; lessons: Lesson[] }
export interface Lesson { id: string; lesson_number: number; title: string }
export interface PromptOption { id: string; name: string; prompt_type?: string }
export interface SkillOption { id: string; skill_id: string; name: string; layer_id: string; domain_id: string }
export interface VariableOption { id: string; variable_key: string; display_name: string; data_type: string; scope: string; source_type?: string }
export interface ArtifactOption { id: string; name: string; artifact_type: string; produces_variable_keys?: string[] }

export interface DryRunResult {
  lessonTitle?: string;
  miniSectionCount?: number;
  typeBreakdown?: Record<string, number>;
  warnings?: string[];
  requiredVariables?: string[];
  linkedSkills?: string[];
  validationByMiniSection?: Record<string, {
    warnings: string[];
    errors: string[];
    promptsResolved: boolean;
    variablesResolved: boolean;
    skillsMapped: boolean;
    artifactsLinked: boolean;
  }>;
}

export interface PromptBody {
  system_prompt: string;
  user_prompt_template: string;
}

export interface VariableMapData {
  created: { key: string; miniSectionTitle: string; order: number }[];
  referenced: { key: string; miniSectionTitle: string; order: number; definitionExists: boolean }[];
  warnings: string[];
}

export const TYPE_OPTIONS: { value: MiniSectionType; label: string; badge: string; studentLabel: string; description: string }[] = [
  { value: 'executive_reality_check', label: 'Executive Reality Check', badge: 'bg-primary', studentLabel: 'Concept Snapshot', description: 'Contextual analysis using student variables. Cannot create variables or artifacts.' },
  { value: 'ai_strategy', label: 'AI Strategy', badge: 'bg-info', studentLabel: 'AI Strategy', description: 'Strategic AI frameworks and decision logic. Cannot create variables or artifacts.' },
  { value: 'prompt_template', label: 'Prompt Template', badge: 'bg-success', studentLabel: 'Prompt Template', description: 'Structured output + variable creation engine. The ONLY type that can create variables.' },
  { value: 'implementation_task', label: 'Implementation Task', badge: 'bg-warning text-dark', studentLabel: 'Implementation Task', description: 'Artifact production. The ONLY type that can create artifacts.' },
  { value: 'knowledge_check', label: 'Knowledge Check', badge: 'bg-secondary', studentLabel: 'Knowledge Check', description: 'Assessment mapped to skills. Influences gating and skill scores.' },
];

export const TYPE_STUDENT_LABEL: Record<string, string> = {
  executive_reality_check: 'Concept Snapshot',
  ai_strategy: 'AI Strategy',
  prompt_template: 'Prompt Template',
  implementation_task: 'Implementation Task',
  knowledge_check: 'Knowledge Check',
};

export const TYPE_BADGE_MAP: Record<string, { badge: string; label: string }> = {
  executive_reality_check: { badge: 'bg-primary', label: 'Concept Snapshot' },
  ai_strategy: { badge: 'bg-info', label: 'AI Strategy' },
  prompt_template: { badge: 'bg-success', label: 'Prompt Template' },
  implementation_task: { badge: 'bg-warning text-dark', label: 'Impl. Task' },
  knowledge_check: { badge: 'bg-secondary', label: 'Knowledge Check' },
};

export const TYPE_ICONS: Record<string, string> = {
  executive_reality_check: 'bi-lightbulb',
  ai_strategy: 'bi-diagram-3',
  prompt_template: 'bi-code-square',
  implementation_task: 'bi-clipboard-check',
  knowledge_check: 'bi-question-circle',
};

/** Extract {{placeholder}} patterns from a template string */
export function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

/** Compute which variables are available at a given order position */
export function computeAvailableVars(
  miniSections: MiniSection[],
  currentOrder: number,
  systemVarKeys: string[]
): Set<string> {
  const available = new Set(systemVarKeys);
  for (const ms of miniSections) {
    if (ms.mini_section_order < currentOrder) {
      (ms.creates_variable_keys || []).forEach(k => available.add(k));
    }
  }
  return available;
}
