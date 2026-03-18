/**
 * Variable Flow Service
 *
 * Cross-section variable intelligence: extraction, flow analysis,
 * availability detection, and reconciliation.
 *
 * All functions load data into memory and compute in-memory graphs.
 * The dataset is small (~30 sections, <100 variables) so this is fast.
 */

import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';
import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';

// ─── Types ──────────────────────────────────────────────────────────

export interface VariableFlowEntry {
  variable_key: string;
  display_name: string;
  source_type: string;
  scope: string;
  first_set_in: { lesson_id: string; lesson_title: string } | null;
  produced_in: { lesson_id: string; lesson_title: string; mini_section_title: string }[];
  consumed_in: { lesson_id: string; lesson_title: string; mini_section_title: string }[];
}

export interface SectionVariableFlow {
  lesson_id: string;
  available: { key: string; source: string; scope: string }[];
  required: { key: string; usedIn: string[] }[];
  produced: { key: string; producedBy: string }[];
  missing: { key: string; usedIn: string[] }[];
}

export interface VariableReconciliation {
  undefined_refs: { key: string; used_in_sections: string[] }[];
  orphaned_defs: { key: string; display_name: string }[];
}

// ─── Internal helpers ───────────────────────────────────────────────

interface OrderedLesson {
  id: string;
  title: string;
  module_number: number;
  lesson_number: number;
  section_variable_keys: string[];
  globalOrder: number;
}

interface MiniSectionData {
  id: string;
  lesson_id: string;
  title: string;
  associated_variable_keys: string[];
  creates_variable_keys: string[];
  prompt_fields: string[]; // concatenated prompt text for extraction
}

const VARIABLE_REF_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Extract {{variable_key}} references from a template string.
 * Returns unique keys, excludes structure_* keys (injected at runtime).
 */
export function extractVariableRefs(template: string): string[] {
  if (!template) return [];
  const keys = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_REF_REGEX.source, 'g');
  while ((match = re.exec(template)) !== null) {
    const key = match[1];
    // Skip runtime structure keys injected by buildCompositePrompt
    if (!key.startsWith('structure_')) {
      keys.add(key);
    }
  }
  return [...keys];
}

async function loadOrderedLessons(): Promise<OrderedLesson[]> {
  const modules = await CurriculumModule.findAll({ order: [['module_number', 'ASC']] });
  const moduleMap = new Map(modules.map(m => [m.id, m.module_number]));

  const lessons = await CurriculumLesson.findAll({ order: [['lesson_number', 'ASC']] });

  return lessons
    .map(l => ({
      id: l.id,
      title: l.title,
      module_number: moduleMap.get(l.module_id) || 0,
      lesson_number: l.lesson_number,
      section_variable_keys: (l.section_variable_keys || []) as string[],
      globalOrder: (moduleMap.get(l.module_id) || 0) * 1000 + l.lesson_number,
    }))
    .sort((a, b) => a.globalOrder - b.globalOrder);
}

async function loadMiniSectionsForLessons(lessonIds: string[]): Promise<MiniSectionData[]> {
  if (lessonIds.length === 0) return [];
  const miniSections = await MiniSection.findAll({
    where: { lesson_id: lessonIds, is_active: true },
    order: [['mini_section_order', 'ASC']],
  });

  return miniSections.map(ms => {
    // Collect all prompt text fields for variable extraction
    const promptFields: string[] = [];
    const textFields = [
      'concept_prompt_system', 'concept_prompt_user',
      'build_prompt_system', 'build_prompt_user',
      'mentor_prompt_system', 'mentor_prompt_user',
      'kc_prompt_system', 'kc_prompt_user',
      'reflection_prompt_system', 'reflection_prompt_user',
    ] as const;
    for (const field of textFields) {
      const val = (ms as any)[field];
      if (val && typeof val === 'string') promptFields.push(val);
    }

    return {
      id: ms.id,
      lesson_id: ms.lesson_id,
      title: ms.title || 'Untitled',
      associated_variable_keys: (ms.associated_variable_keys || []) as string[],
      creates_variable_keys: (ms.creates_variable_keys || []) as string[],
      prompt_fields: promptFields,
    };
  });
}

// System variables are always available (seeded at startup)
const SYSTEM_VARIABLE_KEYS = [
  'industry', 'company_name', 'company_size', 'role', 'goal',
  'ai_maturity_level', 'identified_use_case', 'full_name', 'email',
  'company', 'title',
];

// ─── Public API ─────────────────────────────────────────────────────

/**
 * For a given section: which variables are available (from prior sections + system),
 * which are required (referenced in prompts), which are produced, which are missing.
 */
export async function getSectionVariableFlow(lessonId: string): Promise<SectionVariableFlow> {
  const lessons = await loadOrderedLessons();
  const targetIdx = lessons.findIndex(l => l.id === lessonId);
  if (targetIdx < 0) {
    return { lesson_id: lessonId, available: [], required: [], produced: [], missing: [] };
  }

  const allLessonIds = lessons.map(l => l.id);
  const allMiniSections = await loadMiniSectionsForLessons(allLessonIds);
  const varDefs = await VariableDefinition.findAll({ where: { is_active: true } });
  const defMap = new Map(varDefs.map(v => [v.variable_key, v]));

  // Build set of variables available from prior sections
  const availableMap = new Map<string, { key: string; source: string; scope: string }>();

  // System variables are always available
  for (const key of SYSTEM_VARIABLE_KEYS) {
    availableMap.set(key, { key, source: 'System', scope: 'program' });
  }

  // Walk prior sections in order — variables they produce become available
  for (let i = 0; i < targetIdx; i++) {
    const priorLesson = lessons[i];
    const priorMiniSections = allMiniSections.filter(ms => ms.lesson_id === priorLesson.id);
    for (const ms of priorMiniSections) {
      for (const key of ms.creates_variable_keys) {
        const def = defMap.get(key);
        availableMap.set(key, {
          key,
          source: priorLesson.title,
          scope: def?.scope || 'program',
        });
      }
    }
  }

  // Variables required by this section (extracted from prompts + associated_variable_keys)
  const targetMiniSections = allMiniSections.filter(ms => ms.lesson_id === lessonId);
  const requiredMap = new Map<string, string[]>();

  for (const ms of targetMiniSections) {
    // From explicit associations
    for (const key of ms.associated_variable_keys) {
      if (!requiredMap.has(key)) requiredMap.set(key, []);
      requiredMap.get(key)!.push(ms.title);
    }
    // From prompt template extraction
    for (const promptText of ms.prompt_fields) {
      const refs = extractVariableRefs(promptText);
      for (const key of refs) {
        if (!requiredMap.has(key)) requiredMap.set(key, []);
        if (!requiredMap.get(key)!.includes(ms.title)) {
          requiredMap.get(key)!.push(ms.title);
        }
      }
    }
  }

  // Variables produced by this section
  const producedMap = new Map<string, string>();
  for (const ms of targetMiniSections) {
    for (const key of ms.creates_variable_keys) {
      producedMap.set(key, ms.title);
    }
  }

  // Missing = required but not available and not produced by an earlier mini-section in this section
  const missing: { key: string; usedIn: string[] }[] = [];
  for (const [key, usedIn] of requiredMap) {
    if (!availableMap.has(key) && !producedMap.has(key)) {
      missing.push({ key, usedIn });
    }
  }

  return {
    lesson_id: lessonId,
    available: [...availableMap.values()],
    required: [...requiredMap].map(([key, usedIn]) => ({ key, usedIn })),
    produced: [...producedMap].map(([key, producedBy]) => ({ key, producedBy })),
    missing,
  };
}

/**
 * Cross-program variable flow map: for each variable, where it's first produced,
 * where it's consumed, and where it's produced.
 */
export async function getVariableFlowMap(): Promise<VariableFlowEntry[]> {
  const lessons = await loadOrderedLessons();
  const allLessonIds = lessons.map(l => l.id);
  const allMiniSections = await loadMiniSectionsForLessons(allLessonIds);
  const varDefs = await VariableDefinition.findAll({ where: { is_active: true } });
  const defMap = new Map(varDefs.map(v => [v.variable_key, v]));

  const lessonById = new Map(lessons.map(l => [l.id, l]));

  // Track all variable keys encountered
  const allKeys = new Set<string>();
  const producedIn = new Map<string, { lesson_id: string; lesson_title: string; mini_section_title: string }[]>();
  const consumedIn = new Map<string, { lesson_id: string; lesson_title: string; mini_section_title: string }[]>();

  for (const ms of allMiniSections) {
    const lesson = lessonById.get(ms.lesson_id);
    if (!lesson) continue;

    // Produced
    for (const key of ms.creates_variable_keys) {
      allKeys.add(key);
      if (!producedIn.has(key)) producedIn.set(key, []);
      producedIn.get(key)!.push({
        lesson_id: lesson.id,
        lesson_title: lesson.title,
        mini_section_title: ms.title,
      });
    }

    // Consumed (from associations + prompt refs)
    const consumed = new Set<string>(ms.associated_variable_keys);
    for (const promptText of ms.prompt_fields) {
      for (const key of extractVariableRefs(promptText)) consumed.add(key);
    }
    for (const key of consumed) {
      allKeys.add(key);
      if (!consumedIn.has(key)) consumedIn.set(key, []);
      consumedIn.get(key)!.push({
        lesson_id: lesson.id,
        lesson_title: lesson.title,
        mini_section_title: ms.title,
      });
    }
  }

  // Include defined variables even if never referenced
  for (const def of varDefs) allKeys.add(def.variable_key);

  const result: VariableFlowEntry[] = [];
  for (const key of allKeys) {
    const def = defMap.get(key);
    const produced = producedIn.get(key) || [];
    result.push({
      variable_key: key,
      display_name: def?.display_name || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      source_type: def?.source_type || 'unknown',
      scope: def?.scope || 'program',
      first_set_in: produced.length > 0 ? { lesson_id: produced[0].lesson_id, lesson_title: produced[0].lesson_title } : null,
      produced_in: produced,
      consumed_in: consumedIn.get(key) || [],
    });
  }

  return result;
}

/**
 * Reconciliation: find variables referenced in prompts but not defined,
 * and defined variables never referenced anywhere.
 */
export async function getVariableReconciliation(): Promise<VariableReconciliation> {
  const lessons = await loadOrderedLessons();
  const allLessonIds = lessons.map(l => l.id);
  const allMiniSections = await loadMiniSectionsForLessons(allLessonIds);
  const varDefs = await VariableDefinition.findAll({ where: { is_active: true } });
  const definedKeys = new Set(varDefs.map(v => v.variable_key));
  const lessonById = new Map(lessons.map(l => [l.id, l]));

  // All keys referenced in prompts or associations
  const referencedKeys = new Map<string, Set<string>>(); // key → set of section titles

  for (const ms of allMiniSections) {
    const lesson = lessonById.get(ms.lesson_id);
    const sectionTitle = lesson?.title || 'Unknown';

    const allRefs = new Set<string>(ms.associated_variable_keys);
    for (const promptText of ms.prompt_fields) {
      for (const key of extractVariableRefs(promptText)) allRefs.add(key);
    }
    for (const key of ms.creates_variable_keys) allRefs.add(key);

    for (const key of allRefs) {
      if (!referencedKeys.has(key)) referencedKeys.set(key, new Set());
      referencedKeys.get(key)!.add(sectionTitle);
    }
  }

  // Undefined refs: referenced but no VariableDefinition (exclude system vars)
  const systemKeySet = new Set(SYSTEM_VARIABLE_KEYS);
  const undefined_refs: VariableReconciliation['undefined_refs'] = [];
  for (const [key, sections] of referencedKeys) {
    if (!definedKeys.has(key) && !systemKeySet.has(key)) {
      undefined_refs.push({ key, used_in_sections: [...sections] });
    }
  }

  // Orphaned defs: defined but never referenced
  const allReferenced = new Set(referencedKeys.keys());
  const orphaned_defs: VariableReconciliation['orphaned_defs'] = [];
  for (const def of varDefs) {
    if (!allReferenced.has(def.variable_key) && def.source_type !== 'system') {
      orphaned_defs.push({ key: def.variable_key, display_name: def.display_name });
    }
  }

  return { undefined_refs, orphaned_defs };
}

/**
 * Auto-extract variable references from a mini-section's prompt fields
 * and sync to associated_variable_keys. Also auto-creates missing VariableDefinitions.
 * Returns the set of extracted keys.
 */
export async function syncVariableKeysFromPrompts(miniSectionId: string): Promise<string[]> {
  const ms = await MiniSection.findByPk(miniSectionId);
  if (!ms) return [];

  // Collect all prompt text
  const textFields = [
    'concept_prompt_system', 'concept_prompt_user',
    'build_prompt_system', 'build_prompt_user',
    'mentor_prompt_system', 'mentor_prompt_user',
    'kc_prompt_system', 'kc_prompt_user',
    'reflection_prompt_system', 'reflection_prompt_user',
  ] as const;

  const allRefs = new Set<string>();
  for (const field of textFields) {
    const val = (ms as any)[field];
    if (val && typeof val === 'string') {
      for (const key of extractVariableRefs(val)) allRefs.add(key);
    }
  }

  if (allRefs.size === 0) return [];

  // Merge with existing associated_variable_keys
  const existing = new Set(ms.associated_variable_keys || []);
  let updated = false;
  for (const key of allRefs) {
    if (!existing.has(key)) {
      existing.add(key);
      updated = true;
    }
  }

  if (updated) {
    await ms.update({ associated_variable_keys: [...existing] });
  }

  // Auto-create VariableDefinition for any new keys
  const systemKeySet = new Set(SYSTEM_VARIABLE_KEYS);
  for (const key of allRefs) {
    if (systemKeySet.has(key)) continue;
    const existingDef = await VariableDefinition.findOne({ where: { variable_key: key } });
    if (!existingDef) {
      await VariableDefinition.create({
        id: require('crypto').randomUUID(),
        variable_key: key,
        display_name: key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        data_type: 'text',
        scope: 'program',
        source_type: 'user_input',
        optional: true,
        is_active: true,
        sort_order: 0,
      } as any);
    }
  }

  return [...allRefs];
}

/**
 * Propagate all variable keys from mini-sections to the parent lesson's section_variable_keys.
 */
export async function propagateVariableKeysToLesson(lessonId: string): Promise<void> {
  const miniSections = await MiniSection.findAll({
    where: { lesson_id: lessonId, is_active: true },
  });

  const allKeys = new Set<string>();
  for (const ms of miniSections) {
    for (const k of (ms.associated_variable_keys || [])) allKeys.add(k);
    for (const k of (ms.creates_variable_keys || [])) allKeys.add(k);
  }

  await CurriculumLesson.update(
    { section_variable_keys: [...allKeys] } as any,
    { where: { id: lessonId } },
  );
}
