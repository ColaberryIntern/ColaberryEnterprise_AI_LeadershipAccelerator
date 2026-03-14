// Shared TypeScript interfaces for the Mini-Section Builder

// Dynamic curriculum types — stored in curriculum_type_definitions table.
// These are the built-in system types; custom types use arbitrary slugs.
export type MiniSectionType = string;

// Type definition from the API (curriculum_type_definitions table)
export interface TypeDefinition {
  id: string;
  slug: string;
  label: string;
  student_label: string;
  description: string;
  icon: string;
  badge_class: string;
  can_create_variables: boolean;
  can_create_artifacts: boolean;
  applicable_prompt_pairs: string[];
  default_prompts: Record<string, { system: string; user: string }>;
  is_system: boolean;
  is_active: boolean;
  display_order: number;
}

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
  // Inline prompt fields
  concept_prompt_system?: string;
  concept_prompt_user?: string;
  build_prompt_system?: string;
  build_prompt_user?: string;
  mentor_prompt_system?: string;
  mentor_prompt_user?: string;
  kc_prompt_system?: string;
  kc_prompt_user?: string;
  reflection_prompt_system?: string;
  reflection_prompt_user?: string;
  prompt_source?: 'inline' | 'template' | 'hybrid';
  // Quality tracking
  quality_score?: number;
  quality_details?: QualityBreakdown;
  last_validated_at?: string;
  // Existing fields
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

// Quality scoring interfaces
export interface QualityCategory {
  name: string;
  score: number;
  maxScore: number;
  details: string[];
}

export interface QualityBreakdown {
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  categories: QualityCategory[];
}

// Suggestion engine interfaces
export interface Suggestion {
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

// Diagnostic report interfaces
export interface DiagnosticCheck {
  label: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}

export interface DiagnosticCategory {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  details: DiagnosticCheck[];
}

export interface DiagnosticReport {
  miniSectionId: string;
  timestamp: string;
  overallStatus: 'pass' | 'warning' | 'fail';
  categories: DiagnosticCategory[];
  score: number;
}

// Auto-repair interfaces
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

// Backfill interfaces
export interface BackfillResult {
  backfilled: number;
  alreadyHadInline: number;
  brokenReferences: { miniSectionId: string; field: string; templateId: string }[];
  incomplete: { miniSectionId: string; missingPrompts: string[] }[];
}

// Deep Reconciliation
export interface ReconciliationReport {
  timestamp: string;
  duration_ms: number;
  prompts: { generated: number; skipped: number; byType: Record<string, number> };
  skills: { mapped: number; skipped: number };
  variables: { mapped: number; skipped: number };
  artifacts: { created: number; linked: number; skipped: number };
  quality: { scored: number; avgBefore: number; avgAfter: number };
  issues: { category: string; detail: string }[];
  total: number;
}

// Preview confidence
export interface PreviewConfidenceResult {
  valid: boolean;
  confidence: number;
  unresolvedPlaceholders: string[];
  missingVariables: string[];
  warnings: string[];
}

// AI readiness
export interface AIReadinessStage {
  ready: boolean;
  issues: string[];
}

export interface AIReadinessResult {
  lessonId: string;
  readinessScore: number;
  stages: {
    promptExecution: AIReadinessStage;
    artifactCreation: AIReadinessStage;
    knowledgeScoring: AIReadinessStage;
    skillUpdates: AIReadinessStage;
    variableFlow: AIReadinessStage;
  };
  blockers: string[];
  recommendations: string[];
}

// Prompt type mapping for inline editors
export const PROMPT_PAIRS: { key: string; systemField: keyof MiniSection; userField: keyof MiniSection; fkField: keyof MiniSection; label: string; applicableTypes: MiniSectionType[] }[] = [
  { key: 'concept', systemField: 'concept_prompt_system', userField: 'concept_prompt_user', fkField: 'concept_prompt_template_id', label: 'Concept Prompt', applicableTypes: ['executive_reality_check', 'ai_strategy', 'prompt_template'] },
  { key: 'build', systemField: 'build_prompt_system', userField: 'build_prompt_user', fkField: 'build_prompt_template_id', label: 'Build Prompt', applicableTypes: ['prompt_template', 'implementation_task'] },
  { key: 'mentor', systemField: 'mentor_prompt_system', userField: 'mentor_prompt_user', fkField: 'mentor_prompt_template_id', label: 'Mentor Prompt', applicableTypes: ['executive_reality_check', 'ai_strategy', 'prompt_template', 'implementation_task', 'knowledge_check'] },
  { key: 'kc', systemField: 'kc_prompt_system', userField: 'kc_prompt_user', fkField: 'concept_prompt_template_id', label: 'Knowledge Check Prompt', applicableTypes: ['knowledge_check'] },
  { key: 'reflection', systemField: 'reflection_prompt_system', userField: 'reflection_prompt_user', fkField: 'concept_prompt_template_id', label: 'Reflection Prompt', applicableTypes: ['knowledge_check'] },
];

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

/** Build dynamic type maps from API-loaded type definitions */
export function buildTypeOptions(defs: TypeDefinition[]): typeof TYPE_OPTIONS {
  return defs.map(d => ({
    value: d.slug,
    label: d.label,
    badge: d.badge_class,
    studentLabel: d.student_label,
    description: d.description,
  }));
}

export function buildTypeBadgeMap(defs: TypeDefinition[]): Record<string, { badge: string; label: string }> {
  const map: Record<string, { badge: string; label: string }> = {};
  for (const d of defs) {
    map[d.slug] = { badge: d.badge_class, label: d.student_label };
  }
  return map;
}

export function buildTypeIcons(defs: TypeDefinition[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of defs) {
    map[d.slug] = d.icon;
  }
  return map;
}

export function buildTypeStudentLabels(defs: TypeDefinition[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of defs) {
    map[d.slug] = d.student_label;
  }
  return map;
}

/** Build PROMPT_PAIRS dynamically from type definitions */
export function buildPromptPairs(defs: TypeDefinition[]): typeof PROMPT_PAIRS {
  const ALL_PAIRS = [
    { key: 'concept', systemField: 'concept_prompt_system' as keyof MiniSection, userField: 'concept_prompt_user' as keyof MiniSection, fkField: 'concept_prompt_template_id' as keyof MiniSection, label: 'Concept Prompt' },
    { key: 'build', systemField: 'build_prompt_system' as keyof MiniSection, userField: 'build_prompt_user' as keyof MiniSection, fkField: 'build_prompt_template_id' as keyof MiniSection, label: 'Build Prompt' },
    { key: 'mentor', systemField: 'mentor_prompt_system' as keyof MiniSection, userField: 'mentor_prompt_user' as keyof MiniSection, fkField: 'mentor_prompt_template_id' as keyof MiniSection, label: 'Mentor Prompt' },
    { key: 'kc', systemField: 'kc_prompt_system' as keyof MiniSection, userField: 'kc_prompt_user' as keyof MiniSection, fkField: 'concept_prompt_template_id' as keyof MiniSection, label: 'Knowledge Check Prompt' },
    { key: 'reflection', systemField: 'reflection_prompt_system' as keyof MiniSection, userField: 'reflection_prompt_user' as keyof MiniSection, fkField: 'concept_prompt_template_id' as keyof MiniSection, label: 'Reflection Prompt' },
  ];

  return ALL_PAIRS.map(pair => ({
    ...pair,
    applicableTypes: defs.filter(d => d.applicable_prompt_pairs.includes(pair.key)).map(d => d.slug),
  }));
}

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

/** Score color based on quality score value */
export function getScoreColor(score: number | undefined | null): string {
  if (score == null) return 'bg-light text-muted';
  if (score >= 90) return 'bg-info';
  if (score >= 70) return 'bg-success';
  if (score >= 40) return 'bg-warning text-dark';
  return 'bg-danger';
}

/** Grade letter from score */
export function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}
