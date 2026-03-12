import OpenAI from 'openai';
import CurriculumTypeDefinition from '../models/CurriculumTypeDefinition';
import MiniSection from '../models/MiniSection';
const { v4: uuidv4 } = require('uuid');

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

// ──────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────

export async function listTypes() {
  return CurriculumTypeDefinition.findAll({
    where: { is_active: true },
    order: [['display_order', 'ASC'], ['created_at', 'ASC']],
  });
}

export async function getAllTypes() {
  return CurriculumTypeDefinition.findAll({
    order: [['display_order', 'ASC'], ['created_at', 'ASC']],
  });
}

export async function getType(slug: string) {
  const t = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!t) throw new Error(`Curriculum type "${slug}" not found`);
  return t;
}

export async function getTypeById(id: string) {
  const t = await CurriculumTypeDefinition.findByPk(id);
  if (!t) throw new Error(`Curriculum type not found`);
  return t;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export async function createType(data: Partial<CurriculumTypeDefinition>) {
  if (!data.label) throw new Error('label is required');
  if (!data.student_label) throw new Error('student_label is required');

  const slug = data.slug || slugify(data.label);
  const existing = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (existing) throw new Error(`Type with slug "${slug}" already exists`);

  // Determine display order
  const maxOrder = (await CurriculumTypeDefinition.max('display_order')) as number || 0;

  return CurriculumTypeDefinition.create({
    id: uuidv4(),
    slug,
    label: data.label,
    student_label: data.student_label,
    description: data.description || '',
    icon: data.icon || 'bi-square',
    badge_class: data.badge_class || 'bg-secondary',
    can_create_variables: data.can_create_variables || false,
    can_create_artifacts: data.can_create_artifacts || false,
    applicable_prompt_pairs: data.applicable_prompt_pairs || ['concept', 'mentor'],
    default_prompts: data.default_prompts || {},
    settings_schema: data.settings_schema || {},
    is_system: false,
    is_active: true,
    display_order: maxOrder + 1,
  } as any);
}

export async function updateType(id: string, data: Partial<CurriculumTypeDefinition>) {
  const t = await CurriculumTypeDefinition.findByPk(id);
  if (!t) throw new Error('Curriculum type not found');

  // Prevent slug change on system types
  if (t.is_system && data.slug && data.slug !== t.slug) {
    throw new Error('Cannot change slug of a system type');
  }

  // Check slug uniqueness if changing
  if (data.slug && data.slug !== t.slug) {
    const existing = await CurriculumTypeDefinition.findOne({ where: { slug: data.slug } });
    if (existing) throw new Error(`Type with slug "${data.slug}" already exists`);
  }

  await t.update(data);
  return t;
}

export async function deleteType(id: string) {
  const t = await CurriculumTypeDefinition.findByPk(id);
  if (!t) throw new Error('Curriculum type not found');
  if (t.is_system) throw new Error('Cannot delete a system type');

  // Check if any mini-sections use this type
  const usageCount = await MiniSection.count({ where: { mini_section_type: t.slug } });
  if (usageCount > 0) {
    throw new Error(`Cannot delete: ${usageCount} mini-section(s) use this type. Reassign them first.`);
  }

  await t.destroy();
  return { deleted: true };
}

export async function duplicateType(id: string, newSlug?: string, newLabel?: string) {
  const source = await CurriculumTypeDefinition.findByPk(id);
  if (!source) throw new Error('Source type not found');

  const slug = newSlug || `${source.slug}_copy`;
  const label = newLabel || `${source.label} (Copy)`;

  const existing = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (existing) throw new Error(`Type with slug "${slug}" already exists`);

  const maxOrder = (await CurriculumTypeDefinition.max('display_order')) as number || 0;

  return CurriculumTypeDefinition.create({
    id: uuidv4(),
    slug,
    label,
    student_label: source.student_label,
    description: source.description,
    icon: source.icon,
    badge_class: source.badge_class,
    can_create_variables: source.can_create_variables,
    can_create_artifacts: source.can_create_artifacts,
    applicable_prompt_pairs: [...(source.applicable_prompt_pairs || [])],
    default_prompts: { ...(source.default_prompts || {}) },
    settings_schema: { ...(source.settings_schema || {}) },
    is_system: false,
    is_active: true,
    display_order: maxOrder + 1,
  } as any);
}

export async function getTypeUsageCounts(): Promise<Record<string, number>> {
  const results = await MiniSection.findAll({
    attributes: ['mini_section_type'],
    group: ['mini_section_type'],
    raw: true,
  });
  const counts: Record<string, number> = {};
  for (const r of results as any[]) {
    // Count per type
    const countResult = await MiniSection.count({ where: { mini_section_type: r.mini_section_type } });
    counts[r.mini_section_type] = countResult as number;
  }
  return counts;
}

// ──────────────────────────────────────────────
// NLP — Generate Type from Description
// ──────────────────────────────────────────────

export async function generateTypeFromDescription(description: string) {
  const existingTypes = await listTypes();
  const typesContext = existingTypes.map(t => ({
    slug: t.slug,
    label: t.label,
    student_label: t.student_label,
    description: t.description,
    can_create_variables: t.can_create_variables,
    can_create_artifacts: t.can_create_artifacts,
    applicable_prompt_pairs: t.applicable_prompt_pairs,
    icon: t.icon,
    badge_class: t.badge_class,
  }));

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `You are a curriculum architect for an enterprise AI leadership training program.
Given a natural language description of a new curriculum component type, generate a complete type configuration as JSON.

Existing types for reference:
${JSON.stringify(typesContext, null, 2)}

Available prompt pair keys: concept, build, mentor, kc, reflection
Available Bootstrap icons: bi-lightbulb, bi-diagram-3, bi-code-square, bi-clipboard-check, bi-question-circle, bi-book, bi-journal-text, bi-graph-up, bi-chat-dots, bi-puzzle, bi-rocket, bi-shield-check, bi-briefcase, bi-people, bi-bullseye, bi-bar-chart, bi-gear, bi-stars, bi-trophy, bi-pencil-square
Available badge classes: bg-primary, bg-secondary, bg-success, bg-danger, bg-warning text-dark, bg-info, bg-dark

Rules:
- slug must be lowercase with underscores, unique from existing types
- student_label is what the student sees (more friendly/accessible name)
- can_create_variables: true ONLY if this type should produce structured data/variables for later use
- can_create_artifacts: true ONLY if this type produces deliverable documents/outputs
- applicable_prompt_pairs: which prompt types this section uses (concept for content, build for hands-on, mentor for guidance, kc for quiz, reflection for self-assessment)
- default_prompts: optional template prompts for each applicable pair, as { "concept": { "system": "...", "user": "..." } }

Return ONLY valid JSON with these fields:
{ "slug", "label", "student_label", "description", "icon", "badge_class", "can_create_variables", "can_create_artifacts", "applicable_prompt_pairs", "default_prompts" }`,
      },
      {
        role: 'user',
        content: description,
      },
    ],
  });

  const content = response.choices[0]?.message?.content || '';
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
  const jsonStr = (jsonMatch[1] || content).trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error(`AI returned invalid JSON: ${jsonStr.slice(0, 200)}`);
  }
}

// ──────────────────────────────────────────────
// Reverse Engineer — Type
// ──────────────────────────────────────────────

export async function reverseEngineerType(id: string) {
  const typeDef = await CurriculumTypeDefinition.findByPk(id);
  if (!typeDef) throw new Error('Type not found');

  const config = {
    slug: typeDef.slug,
    label: typeDef.label,
    student_label: typeDef.student_label,
    description: typeDef.description,
    can_create_variables: typeDef.can_create_variables,
    can_create_artifacts: typeDef.can_create_artifacts,
    applicable_prompt_pairs: typeDef.applicable_prompt_pairs,
    default_prompts: typeDef.default_prompts,
    icon: typeDef.icon,
    badge_class: typeDef.badge_class,
  };

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `You are a curriculum architect. Given a curriculum type configuration (JSON), write the natural language description that an admin would use to create this type from scratch.

Be specific about:
- What the learning component does and its pedagogical purpose
- Whether it creates variables or artifacts, and why
- Which prompt types it uses and their roles
- The assessment or interaction model it follows
- How it fits into a lesson alongside other component types

Write it as a clear, actionable instruction — as if telling a colleague: "Create a curriculum type that..."
Do NOT include JSON or code. Just the natural language description.`,
      },
      {
        role: 'user',
        content: JSON.stringify(config, null, 2),
      },
    ],
  });

  return {
    prompt: response.choices[0]?.message?.content || '',
    config,
  };
}

// ──────────────────────────────────────────────
// Reverse Engineer — Mini-Section
// ──────────────────────────────────────────────

export async function reverseEngineerMiniSection(miniSectionId: string) {
  const ms = await MiniSection.findByPk(miniSectionId);
  if (!ms) throw new Error('Mini-section not found');

  const config: Record<string, any> = {
    type: ms.mini_section_type,
    title: ms.title,
    description: ms.description,
    prompts: {} as Record<string, any>,
    creates_variable_keys: ms.creates_variable_keys || [],
    creates_artifact_ids: ms.creates_artifact_ids || [],
    associated_variable_keys: ms.associated_variable_keys || [],
    associated_skill_ids: ms.associated_skill_ids || [],
    knowledge_check_config: ms.knowledge_check_config,
    settings_json: ms.settings_json || {},
  };

  // Collect all non-empty inline prompts
  const promptFields = [
    { key: 'concept', sys: 'concept_prompt_system', usr: 'concept_prompt_user' },
    { key: 'build', sys: 'build_prompt_system', usr: 'build_prompt_user' },
    { key: 'mentor', sys: 'mentor_prompt_system', usr: 'mentor_prompt_user' },
    { key: 'kc', sys: 'kc_prompt_system', usr: 'kc_prompt_user' },
    { key: 'reflection', sys: 'reflection_prompt_system', usr: 'reflection_prompt_user' },
  ];

  for (const pf of promptFields) {
    const sysVal = (ms as any)[pf.sys];
    const usrVal = (ms as any)[pf.usr];
    if (sysVal || usrVal) {
      config.prompts[pf.key] = {
        system: sysVal || '',
        user: usrVal || '',
      };
    }
  }

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `You are a curriculum architect. Given a mini-section configuration (including its type, title, prompts, variables, and settings), write the natural language description that would recreate this exact mini-section.

Your output should describe:
1. The purpose and learning goal of this section
2. The type of content it generates (concept explanation, hands-on task, assessment, etc.)
3. Key prompt instructions and style (summarize the system/user prompts)
4. What variables it creates or references
5. Any knowledge check or assessment configuration
6. The pedagogical approach and tone

Write it as a clear recipe — as if telling a colleague: "Create a mini-section that..."
The description should be detailed enough that someone could recreate this mini-section from scratch using AI generation.`,
      },
      {
        role: 'user',
        content: JSON.stringify(config, null, 2),
      },
    ],
  });

  return {
    prompt: response.choices[0]?.message?.content || '',
    reconstructedConfig: config,
  };
}
