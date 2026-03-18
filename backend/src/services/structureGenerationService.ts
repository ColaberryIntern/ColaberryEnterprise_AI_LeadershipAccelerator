import crypto from 'crypto';
import { sequelize } from '../config/database';
import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';
import ArtifactDefinition from '../models/ArtifactDefinition';
import SkillDefinition from '../models/SkillDefinition';
import CurriculumTypeDefinition from '../models/CurriculumTypeDefinition';
import { callLLMWithAudit } from './llmCallWrapper';

const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

// ─── Basic Generation (existing) ─────────────────────────────────────────

export interface GeneratedEvent {
  type: string;
  student_label: string;
  title: string;
  description: string;
  learning_goal: string;
}

const BASIC_SYSTEM_PROMPT = `You are an expert curriculum designer for an enterprise AI leadership program targeting senior business executives (aged 35-60).

You will be given a structure prompt describing a section of a learning program. Your job is to generate exactly 5 learning events for that section.

Each event must follow this pedagogical arc:
1. executive_reality_check (student label: "Concept Snapshot") — Reality-check analysis grounding AI concepts in operational reality
2. ai_strategy (student label: "AI Strategy") — Strategic framework defining AI vs human decision boundaries
3. prompt_template (student label: "Prompt Template") — Hands-on prompt engineering exercise producing a reusable template
4. implementation_task (student label: "Implementation Task") — Practical assessment building a real deliverable
5. knowledge_check (student label: "Knowledge Check") — Scenario-based assessment validating comprehension

Return ONLY valid JSON in this exact format:
{
  "events": [
    { "type": "executive_reality_check", "student_label": "Concept Snapshot", "title": "...", "description": "...", "learning_goal": "..." },
    { "type": "ai_strategy", "student_label": "AI Strategy", "title": "...", "description": "...", "learning_goal": "..." },
    { "type": "prompt_template", "student_label": "Prompt Template", "title": "...", "description": "...", "learning_goal": "..." },
    { "type": "implementation_task", "student_label": "Implementation Task", "title": "...", "description": "...", "learning_goal": "..." },
    { "type": "knowledge_check", "student_label": "Knowledge Check", "title": "...", "description": "...", "learning_goal": "..." }
  ]
}

Requirements:
- Titles: concise (3-5 words), professional, specific to the section topic
- Descriptions: 1-2 sentences explaining what the learner will do
- Learning Goals: measurable outcomes starting with action verbs (Analyze, Design, Build, Evaluate, Assess)
- Events should build progressively on each other
- No markdown, no explanation — just the JSON object`;

const EXPECTED_TYPES = [
  'executive_reality_check',
  'ai_strategy',
  'prompt_template',
  'implementation_task',
  'knowledge_check',
];

export async function generateSectionStructure(structurePrompt: string, lessonId?: string): Promise<GeneratedEvent[]> {
  const llmResult = await callLLMWithAudit({
    lessonId: lessonId || 'unknown',
    generationType: 'admin_structure',
    step: 'generate_section_structure',
    systemPrompt: BASIC_SYSTEM_PROMPT,
    userPrompt: structurePrompt,
    model: MODEL,
    temperature: 0.7,
    maxTokens: 1500,
    responseFormat: { type: 'json_object' },
  });

  const parsed = JSON.parse(llmResult.content);
  const events: GeneratedEvent[] = parsed.events;

  if (!Array.isArray(events) || events.length !== 5) {
    throw new Error('AI returned invalid structure: expected exactly 5 events');
  }

  for (const expectedType of EXPECTED_TYPES) {
    if (!events.find(e => e.type === expectedType)) {
      throw new Error(`Missing event type: ${expectedType}`);
    }
  }

  return events;
}

// ─── Comprehensive Generation + Apply ────────────────────────────────────

export interface GeneratedMiniSectionSpec {
  type: string;
  student_label: string;
  title: string;
  description: string;
  learning_goal: string;
  section_prompt: string;
  skill_domain: string;
  variables: { key: string; display_name: string; description: string }[];
  artifact: { name: string; description: string; evaluation_criteria: string } | null;
  knowledge_check_config: { enabled: boolean; question_count: number; pass_score: number } | null;
}

export interface GeneratedBlueprint {
  mini_sections: GeneratedMiniSectionSpec[];
  skill_domain: string;
}

export interface ApplyResult {
  created_mini_sections: { id: string; type: string; title: string }[];
  created_variables: { id: string; key: string; display_name: string }[];
  created_artifacts: { id: string; name: string }[];
  matched_skill: { id: string; skill_id: string; name: string } | null;
  created_skill: { id: string; skill_id: string; name: string } | null;
}

const COMPREHENSIVE_SYSTEM_PROMPT = `You are an expert curriculum designer for an enterprise AI leadership program targeting senior business executives (aged 35-60).

You will be given a description of a lesson section. Generate a comprehensive blueprint with exactly 5 mini-sections following this pedagogical arc:

1. executive_reality_check (student label: "Concept Snapshot") — Reality-check analysis
2. ai_strategy (student label: "AI Strategy") — Strategic framework
3. prompt_template (student label: "Prompt Template") — Hands-on prompt engineering with variable collection
4. implementation_task (student label: "Implementation Task") — Practical deliverable with artifact output
5. knowledge_check (student label: "Knowledge Check") — Scenario-based assessment

Return ONLY valid JSON in this exact format:
{
  "skill_domain": "<skill domain slug like 'strategy_trust', 'governance_risk', etc.>",
  "mini_sections": [
    {
      "type": "executive_reality_check",
      "student_label": "Concept Snapshot",
      "title": "<3-5 word title>",
      "description": "<1-2 sentence description of what the learner will do>",
      "learning_goal": "<measurable outcome starting with an action verb>",
      "section_prompt": "Skill domain: <domain>.",
      "skill_domain": "<domain>",
      "variables": [],
      "artifact": null,
      "knowledge_check_config": null
    },
    {
      "type": "ai_strategy",
      "student_label": "AI Strategy",
      "title": "<3-5 word title>",
      "description": "<description>",
      "learning_goal": "<goal>",
      "section_prompt": "Skill domain: <domain>.",
      "skill_domain": "<domain>",
      "variables": [],
      "artifact": null,
      "knowledge_check_config": null
    },
    {
      "type": "prompt_template",
      "student_label": "Prompt Template",
      "title": "<3-5 word title>",
      "description": "<description>",
      "learning_goal": "<goal>",
      "section_prompt": "Skill domain: <domain>.",
      "skill_domain": "<domain>",
      "variables": [
        { "key": "snake_case_key", "display_name": "Human Readable Name", "description": "What this variable captures" }
      ],
      "artifact": null,
      "knowledge_check_config": null
    },
    {
      "type": "implementation_task",
      "student_label": "Implementation Task",
      "title": "<3-5 word title>",
      "description": "<description>",
      "learning_goal": "<goal>",
      "section_prompt": "Skill domain: <domain>.",
      "skill_domain": "<domain>",
      "variables": [],
      "artifact": {
        "name": "<Artifact Name>",
        "description": "<What the artifact is>",
        "evaluation_criteria": "<How to evaluate the deliverable>"
      },
      "knowledge_check_config": null
    },
    {
      "type": "knowledge_check",
      "student_label": "Knowledge Check",
      "title": "<3-5 word title>",
      "description": "<description>",
      "learning_goal": "<goal>",
      "section_prompt": "Skill domain: <domain>.",
      "skill_domain": "<domain>",
      "variables": [],
      "artifact": null,
      "knowledge_check_config": { "enabled": true, "question_count": 5, "pass_score": 70 }
    }
  ]
}

Rules:
- The prompt_template mini-section MUST have 1-3 variables the learner will fill in (specific to the topic)
- The implementation_task mini-section MUST have an artifact the learner will produce
- Variable keys must be snake_case, unique, and specific to the section topic (not generic like "name" or "industry")
- The knowledge_check mini-section MUST have knowledge_check_config
- Section prompts should be minimal: just "Skill domain: <domain>." with optional capstone notes
- Titles: concise (3-5 words), professional, specific to the section topic
- Descriptions: 1-2 sentences, 100-200 characters
- Learning Goals: measurable outcomes starting with action verbs
- Events should build progressively
- No markdown, no explanation — just the JSON object`;

/**
 * Generate a comprehensive section blueprint from a description.
 * Returns the full spec including variables, artifacts, skills, and KC config.
 */
export async function generateComprehensiveBlueprint(structurePrompt: string, lessonId?: string): Promise<GeneratedBlueprint> {
  const llmResult = await callLLMWithAudit({
    lessonId: lessonId || 'unknown',
    generationType: 'admin_blueprint',
    step: 'generate_comprehensive_blueprint',
    systemPrompt: COMPREHENSIVE_SYSTEM_PROMPT,
    userPrompt: structurePrompt,
    model: MODEL,
    temperature: 0.7,
    maxTokens: 3000,
    responseFormat: { type: 'json_object' },
  });

  const parsed = JSON.parse(llmResult.content);

  const miniSections: GeneratedMiniSectionSpec[] = parsed.mini_sections;
  if (!Array.isArray(miniSections) || miniSections.length !== 5) {
    throw new Error('AI returned invalid blueprint: expected exactly 5 mini-sections');
  }

  for (const expectedType of EXPECTED_TYPES) {
    if (!miniSections.find(ms => ms.type === expectedType)) {
      throw new Error(`Missing mini-section type: ${expectedType}`);
    }
  }

  return {
    mini_sections: miniSections,
    skill_domain: parsed.skill_domain || miniSections[0]?.skill_domain || 'general',
  };
}

/**
 * Apply a generated blueprint to a lesson — creates all entities in a transaction.
 * Deletes existing mini-sections for the lesson and replaces with new ones.
 */
export async function applySectionBlueprint(
  lessonId: string,
  blueprint: GeneratedBlueprint,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    created_mini_sections: [],
    created_variables: [],
    created_artifacts: [],
    matched_skill: null,
    created_skill: null,
  };

  await sequelize.transaction(async (t) => {
    // 1. Delete existing mini-sections for this lesson
    await MiniSection.destroy({ where: { lesson_id: lessonId }, transaction: t });

    // 2. Match or create skill definition
    const skillDomain = blueprint.skill_domain;
    let matchedSkill = await SkillDefinition.findOne({ where: { skill_id: skillDomain }, transaction: t });

    if (matchedSkill) {
      result.matched_skill = { id: matchedSkill.id, skill_id: matchedSkill.skill_id, name: matchedSkill.name };
    } else {
      const skillName = skillDomain
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      matchedSkill = await SkillDefinition.create({
        id: crypto.randomUUID(),
        skill_id: skillDomain,
        name: skillName,
        description: `Auto-generated from section blueprint`,
        layer_id: 'ai-leadership',
        domain_id: skillDomain.split('_')[0] || 'general',
        weights: {},
        mastery_threshold: 0.7,
        skill_type: 'core',
        is_active: true,
      } as any, { transaction: t });
      result.created_skill = { id: matchedSkill.id, skill_id: matchedSkill.skill_id, name: matchedSkill.name };
    }

    // 3. Load type definitions for prompt defaults
    const typeDefs = await CurriculumTypeDefinition.findAll({ transaction: t });
    const typeDefMap = new Map(typeDefs.map(td => [td.slug, td]));

    // 4. Create each mini-section with all associations
    for (let i = 0; i < blueprint.mini_sections.length; i++) {
      const spec = blueprint.mini_sections[i];

      // 4a. Create variable definitions for this mini-section
      const createdVarKeys: string[] = [];
      for (const varSpec of spec.variables || []) {
        const existing = await VariableDefinition.findOne({
          where: { variable_key: varSpec.key },
          transaction: t,
        });
        if (!existing) {
          const vd = await VariableDefinition.create({
            id: crypto.randomUUID(),
            variable_key: varSpec.key,
            display_name: varSpec.display_name,
            description: varSpec.description,
            data_type: 'text',
            scope: 'section',
            source_type: 'user_input',
            optional: false,
            is_active: true,
            sort_order: i * 10 + result.created_variables.length,
          } as any, { transaction: t });
          result.created_variables.push({ id: vd.id, key: vd.variable_key, display_name: vd.display_name });
        }
        createdVarKeys.push(varSpec.key);
      }

      // 4b. Create artifact definition for this mini-section
      const createdArtifactIds: string[] = [];
      if (spec.artifact) {
        const artId = crypto.randomUUID();
        await ArtifactDefinition.create({
          id: artId,
          lesson_id: lessonId,
          name: spec.artifact.name,
          description: spec.artifact.description,
          artifact_type: 'document',
          artifact_role: 'output',
          evaluation_criteria: spec.artifact.evaluation_criteria,
          file_types: ['.pdf', '.docx', '.xlsx', '.pptx'],
          sort_order: 0,
        } as any, { transaction: t });
        createdArtifactIds.push(artId);
        result.created_artifacts.push({ id: artId, name: spec.artifact.name });
      }

      // 4c. Build prompt defaults from type definition
      // NOTE: concept_prompt_system is intentionally excluded — it holds the
      // minimal section prompt (e.g. "Skill domain: strategy_trust.").
      // Structure prompts from the type definition are auto-appended at
      // runtime by buildCompositePrompt() as "Structure [key]:" blocks.
      // Storing them here too would cause duplication.
      const promptDefaults: Record<string, string> = {};
      const td = typeDefMap.get(spec.type);
      if (td?.default_prompts) {
        const PROMPT_PAIRS = [
          // concept excluded — section prompt goes in concept_prompt_system
          { key: 'build', systemField: 'build_prompt_system' },
          { key: 'mentor', systemField: 'mentor_prompt_system' },
          { key: 'kc', systemField: 'kc_prompt_system' },
          { key: 'reflection', systemField: 'reflection_prompt_system' },
        ];
        for (const pair of PROMPT_PAIRS) {
          const dp = (td.default_prompts as any)[pair.key];
          if (dp) {
            const merged = dp.system && dp.user
              ? dp.system + '\n\n' + dp.user
              : dp.system || dp.user || '';
            if (merged) promptDefaults[pair.systemField] = merged;
          }
        }
      }

      // 4d. Create the mini-section
      const msId = crypto.randomUUID();
      await MiniSection.create({
        id: msId,
        lesson_id: lessonId,
        mini_section_type: spec.type,
        mini_section_order: i + 1,
        title: spec.title,
        description: `${spec.description}${spec.learning_goal ? '\nLearning Goal: ' + spec.learning_goal : ''}`,
        concept_prompt_system: spec.section_prompt || `Skill domain: ${skillDomain}.`,
        prompt_source: 'inline',
        associated_skill_ids: [matchedSkill.skill_id],
        creates_variable_keys: createdVarKeys.length > 0 ? createdVarKeys : undefined,
        creates_artifact_ids: createdArtifactIds.length > 0 ? createdArtifactIds : undefined,
        knowledge_check_config: spec.knowledge_check_config || undefined,
        is_active: true,
        completion_weight: 1.0,
        ...promptDefaults,
      } as any, { transaction: t });

      result.created_mini_sections.push({ id: msId, type: spec.type, title: spec.title });
    }
  });

  return result;
}
