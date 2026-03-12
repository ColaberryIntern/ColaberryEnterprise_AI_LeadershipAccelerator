import MiniSection from '../models/MiniSection';
import CurriculumLesson from '../models/CurriculumLesson';
import CurriculumModule from '../models/CurriculumModule';
import SkillDefinition from '../models/SkillDefinition';
import VariableDefinition from '../models/VariableDefinition';
import ArtifactDefinition from '../models/ArtifactDefinition';
import { scoreMiniSection } from './qualityScoringService';
const { v4: uuidv4 } = require('uuid');

// --- Interfaces ---

interface ReconciliationIssue {
  category: 'prompt' | 'skill' | 'variable' | 'artifact' | 'data';
  detail: string;
}

export interface ReconciliationReport {
  timestamp: string;
  duration_ms: number;
  prompts: { generated: number; skipped: number; byType: Record<string, number> };
  skills: { mapped: number; skipped: number };
  variables: { mapped: number; skipped: number };
  artifacts: { created: number; linked: number; skipped: number };
  quality: { scored: number; avgBefore: number; avgAfter: number };
  issues: ReconciliationIssue[];
  total: number;
}

// --- Prompt Templates ---
// {single_braces} = compile-time interpolation from lesson/seed data
// {{double_braces}} = runtime variable placeholders preserved for LLM personalization

// Combined prompts: single field per prompt type (stored in *_prompt_system field)
// Merges what was previously separate system + user prompts into one unified prompt.
const PROMPTS: Record<string, Record<string, string>> = {
  executive_reality_check: {
    concept_prompt_system: `You are an executive AI education specialist creating a reality-check analysis for senior business leaders.
Topic: {ms_title}. {ms_description}
Ground every insight in the learner's {{industry}} sector and {{company_name}} context.
Generate the concept_snapshot section with: title, definition (2-3 sentences), why_it_matters (personalized to {{role}} and {{industry}}), and visual_metaphor.
Key areas to address: {key_points}. Skill domain: {skill_area}.

Create a reality-check analysis for lesson: "{lesson_title}"
Context: {lesson_description}
Key points: {key_points_joined}
Focus: {ms_title} — {ms_description}
Available personalization: {{industry}}, {{company_name}}, {{role}}, {{ai_maturity_level}}, {{goal}}.
Personalize especially by: {personalize_by_joined}.`,
    mentor_prompt_system: `You are a senior AI strategy mentor guiding an executive through: {ms_title}.
Your role is to challenge assumptions, deepen understanding, and connect concepts to the learner's real {{industry}} context at {{company_name}}.
Draw on the key areas: {key_points}.

The learner has completed the reality-check analysis for "{lesson_title}" focusing on {ms_title}.
Review their understanding and challenge them to think deeper about how {key_points_joined} applies to their specific {{industry}} context at {{company_name}} as a {{role}}.`,
  },
  ai_strategy: {
    concept_prompt_system: `You are an AI strategy advisor creating actionable AI application guidance for executives.
Focus: {ms_title} — {ms_description}
Connect all recommendations to {{industry}} realities and {{company_name}}'s specific context.
Generate the ai_strategy section with: description, when_to_use_ai (3-4 items), human_responsibilities (3-4 items), and suggested_prompt (3-5 sentence research prompt using {{company_name}}, {{role}}, {{industry}}).
Skill area: {skill_area}. Key points: {key_points}.

Create an AI strategy analysis for lesson: "{lesson_title}"
Context: {lesson_description}
Key points: {key_points_joined}
Focus: {ms_title} — {ms_description}
Available personalization: {{industry}}, {{company_name}}, {{role}}, {{ai_maturity_level}}, {{goal}}.
Personalize especially by: {personalize_by_joined}.
The suggested_prompt must be detailed and research-oriented — 3-5 sentences using {{company_name}}, {{role}}, and {{industry}}.`,
    mentor_prompt_system: `You are a senior AI strategy mentor helping an executive apply AI strategy concepts from: {ms_title}.
Guide them to think critically about AI vs human task separation in their {{industry}} context at {{company_name}}.
Key areas: {key_points}.

The learner has reviewed the AI strategy section for "{lesson_title}" focusing on {ms_title}.
Help them evaluate which AI vs human task boundaries make sense for {{company_name}} in {{industry}}, considering their AI maturity level of {{ai_maturity_level}}.
Key concepts covered: {key_points_joined}.`,
  },
  prompt_template: {
    concept_prompt_system: `You are a prompt engineering educator helping executives understand prompt design principles.
Focus: {ms_title} — {ms_description}
Explain how well-crafted prompts drive better AI outputs in {{industry}} contexts for {{company_name}}.
Key concepts: {key_points}.

Explain prompt design principles for lesson: "{lesson_title}"
Context: {lesson_description}
Key points: {key_points_joined}
Focus: {ms_title} — {ms_description}
Help the learner understand why well-structured prompts matter for {{role}} at {{company_name}} in {{industry}}.`,
    build_prompt_system: `You are a prompt engineering specialist creating reusable AI prompt templates for executive users.
Create a template for: {ms_title} — {ms_description}
The template must contain {{placeholder_name}} markers for discovery-oriented placeholders.
Do NOT use company_name, industry, or role as placeholders — these are auto-filled.
Generate the prompt_template section with: template (4-8 sentences with markers), placeholders array, expected_output_shape.
Context: {skill_area} domain. Key points: {key_points}.

Create a reusable prompt template for lesson: "{lesson_title}"
Context: {lesson_description}
Key points: {key_points_joined}
Skill area: {skill_area}
Focus: {ms_title} — {ms_description}
Use placeholders like: department_focus, specific_challenge, current_process, desired_outcome, key_stakeholders, scope_area.
Personalize by: {personalize_by_joined}.`,
    mentor_prompt_system: `You are a prompt engineering mentor guiding an executive through: {ms_title}.
Help them refine their prompt templates for maximum effectiveness in {{industry}} at {{company_name}}.
Key areas: {key_points}.

The learner has created a prompt template for "{lesson_title}" focusing on {ms_title}.
Review their template quality. Are the placeholders discovery-oriented? Does the template guide the AI effectively for {{industry}} at {{company_name}}?
Key concepts: {key_points_joined}.`,
  },
  implementation_task: {
    build_prompt_system: `You are an executive education task designer creating hands-on deliverables for senior leaders.
Design the implementation task for: {ms_title} — {ms_description}
The task must be completable in 45 minutes using the learner's real {{company_name}} context in {{industry}}.
Generate the implementation_task section with: title, description, requirements (3-5), deliverable, estimated_minutes, getting_started (3 steps), required_artifacts.
Key areas: {key_points}. Personalize by: {personalize_by}.

Design an implementation task for lesson: "{lesson_title}"
Context: {lesson_description}
Key points: {key_points_joined}
Skill area: {skill_area}
Focus: {ms_title} — {ms_description}
The deliverable should demonstrate mastery of: {key_points_joined}.
Include 3 concrete getting_started steps and 1-2 required_artifacts with file types.
Personalize by: {personalize_by_joined}.`,
    mentor_prompt_system: `You are an implementation mentor guiding an executive through: {ms_title}.
Help them produce high-quality deliverables relevant to {{company_name}} in {{industry}}.
Key areas: {key_points}.

The learner is working on the implementation task for "{lesson_title}" — {ms_title}.
Help them produce a high-quality deliverable for {{company_name}} in {{industry}}.
The task covers: {key_points_joined}. Guide them through any blockers.`,
    reflection_prompt_system: `You are an AI-powered workspace coach helping a learner complete an implementation assignment for an AI Leadership course.

ASSIGNMENT: {ms_title}
DESCRIPTION: {ms_description}
KEY AREAS: {key_points_joined}
SKILL AREA: {skill_area}

YOUR ROLE:
Guide the learner through completing this assignment step by step.
For each requirement:
1. Explain what needs to be created
2. Help them structure the content
3. Provide templates or starting points
4. Review their work when they share it

Track progress through requirements. Be encouraging but thorough.
Personalize all guidance for {{company_name}} in {{industry}} from the perspective of a {{role}}.
Start by summarizing what they need to do and asking what they'd like to tackle first.`,
  },
  knowledge_check: {
    kc_prompt_system: `You are an assessment designer creating scenario-based knowledge checks for executive AI education.
Create questions testing practical understanding of: {ms_title} — {ms_description}
Questions must be scenario-based using {{industry}} and {{company_name}} context, not academic trivia.
Generate knowledge_checks with {question_count} questions per section. Each: question, options (A-D), correct_answer, explanation, ai_followup_prompt.
Skills assessed: {skill_names}. Key concepts: {key_points}.

Create scenario-based knowledge check questions for lesson: "{lesson_title}"
Context: {lesson_description}
Key points: {key_points_joined}
Skill area: {skill_area}
Focus: {ms_title} — {ms_description}
Generate {question_count} questions per section.
Each question must use {{industry}} and {{company_name}} context. No academic trivia.
Skills to assess: {skill_names_joined}.
Personalize by: {personalize_by_joined}.`,
    mentor_prompt_system: `You are an assessment mentor helping an executive understand knowledge check results for: {ms_title}.
Guide them to deepen understanding in areas where they struggled, using {{industry}} context at {{company_name}}.
Key areas: {key_points}.

The learner has completed the knowledge check for "{lesson_title}" — {ms_title}.
Review their results. For questions they got wrong, explain the correct answer in the context of {{industry}} at {{company_name}}.
Skills assessed: {skill_names_joined}. Key concepts: {key_points_joined}.`,
  },
};

// --- Template Interpolation ---
// Replaces {param} (single braces) with values, preserves {{runtime}} (double braces)

function interpolate(template: string, params: Record<string, string>): string {
  let result = template;
  // Temporarily protect {{double_braces}} by replacing with a unique marker
  const marker = '\x00DB\x00';
  result = result.replace(/\{\{/g, marker + '{').replace(/\}\}/g, '}' + marker);
  // Replace {single_brace} params
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  // Restore {{double_braces}}
  result = result.replace(new RegExp(marker + '\\{', 'g'), '{{').replace(new RegExp('\\}' + marker, 'g'), '}}');
  return result;
}

// --- Skill Mapping ---

interface SkillsByDomain {
  firstDomain: string[];
  secondDomain: string[];
  all: string[];
}

function mapSkillsForType(type: string, skills: SkillsByDomain): string[] {
  switch (type) {
    case 'knowledge_check':
    case 'implementation_task':
      return skills.all;
    case 'executive_reality_check':
      return skills.firstDomain;
    case 'ai_strategy':
    case 'prompt_template':
      return skills.secondDomain;
    default:
      return skills.all;
  }
}

// --- Variable Mapping ---

const BASE_VARIABLES = ['industry', 'company_name', 'role', 'goal', 'ai_maturity_level'];

function mapVariablesForType(
  type: string,
  personalizeBy: string[],
  validKeys: Set<string>
): string[] {
  const vars = new Set(BASE_VARIABLES);
  for (const key of personalizeBy) {
    if (validKeys.has(key)) vars.add(key);
  }
  if (type === 'prompt_template') vars.add('identified_use_case');
  if (type === 'implementation_task') vars.add('company_size');
  // Filter to only valid keys
  return Array.from(vars).filter(k => validKeys.has(k));
}

// --- Main Engine ---

export async function deepReconcile(options?: { dryRun?: boolean }): Promise<ReconciliationReport> {
  const startTime = Date.now();
  const dryRun = options?.dryRun ?? false;

  const report: ReconciliationReport = {
    timestamp: new Date().toISOString(),
    duration_ms: 0,
    prompts: { generated: 0, skipped: 0, byType: {} },
    skills: { mapped: 0, skipped: 0 },
    variables: { mapped: 0, skipped: 0 },
    artifacts: { created: 0, linked: 0, skipped: 0 },
    quality: { scored: 0, avgBefore: 0, avgAfter: 0 },
    issues: [],
    total: 0,
  };

  // 1. Load all data upfront
  const miniSections = await MiniSection.findAll({
    include: [
      {
        model: CurriculumLesson,
        as: 'lesson',
        include: [{ model: CurriculumModule, as: 'module' }],
      },
    ],
    order: [['lesson_id', 'ASC'], ['mini_section_order', 'ASC']],
  });
  report.total = miniSections.length;

  const allSkills = await SkillDefinition.findAll({ where: { is_active: true } });
  const allVarDefs = await VariableDefinition.findAll({ where: { is_active: true } });
  const existingArtifacts = await ArtifactDefinition.findAll();

  // Index skills by layer_id → { firstDomain, secondDomain, all }
  const skillsByLayer: Record<string, SkillsByDomain> = {};
  const skillsByLayerRaw: Record<string, { domainId: string; id: string }[]> = {};
  for (const skill of allSkills) {
    const layer = skill.layer_id;
    if (!skillsByLayerRaw[layer]) skillsByLayerRaw[layer] = [];
    skillsByLayerRaw[layer].push({ domainId: skill.domain_id, id: skill.id });
  }
  for (const [layer, skills] of Object.entries(skillsByLayerRaw)) {
    const domains = [...new Set(skills.map(s => s.domainId))].sort();
    skillsByLayer[layer] = {
      firstDomain: skills.filter(s => s.domainId === domains[0]).map(s => s.id),
      secondDomain: skills.filter(s => s.domainId === (domains[1] || domains[0])).map(s => s.id),
      all: skills.map(s => s.id),
    };
  }

  // Skill name lookup for prompt templates
  const skillNameMap: Record<string, string> = {};
  for (const s of allSkills) skillNameMap[s.id] = s.name;

  // Valid variable keys
  const validVarKeys = new Set(allVarDefs.map(v => v.variable_key));

  // Index existing artifacts by lesson_id
  const artifactsByLesson: Record<string, ArtifactDefinition[]> = {};
  for (const art of existingArtifacts) {
    const lid = (art as any).lesson_id;
    if (lid) {
      if (!artifactsByLesson[lid]) artifactsByLesson[lid] = [];
      artifactsByLesson[lid].push(art);
    }
  }

  // Collect before-scores
  let totalBeforeScore = 0;
  let beforeCount = 0;
  for (const ms of miniSections) {
    const qs = (ms as any).quality_score;
    if (typeof qs === 'number') {
      totalBeforeScore += qs;
      beforeCount++;
    }
  }
  report.quality.avgBefore = beforeCount > 0 ? Math.round(totalBeforeScore / beforeCount) : 0;

  // 2. Process each MiniSection
  for (const ms of miniSections) {
    const lesson = (ms as any).lesson as CurriculumLesson | null;
    if (!lesson) {
      report.issues.push({ category: 'data', detail: `MiniSection ${ms.id} has no associated lesson` });
      continue;
    }
    const module = (lesson as any).module as CurriculumModule | null;
    const skillArea = module?.skill_area || '';
    const contentTemplate = (lesson as any).content_template_json || {};
    const keyPoints: string[] = contentTemplate.key_points || [];
    const personalizeBy: string[] = contentTemplate.personalize_by || [];
    const questionCount = contentTemplate.question_count || 3;
    const msType = ms.mini_section_type || '';

    // Build interpolation params
    const layerSkills = skillsByLayer[skillArea] || { firstDomain: [], secondDomain: [], all: [] };
    const mappedSkillIds = mapSkillsForType(msType, layerSkills);
    const skillNames = mappedSkillIds.map(id => skillNameMap[id] || id);

    const params: Record<string, string> = {
      ms_title: ms.title || '',
      ms_description: ms.description || '',
      lesson_title: lesson.title || '',
      lesson_description: lesson.description || '',
      skill_area: skillArea,
      key_points: keyPoints.join(', '),
      key_points_joined: keyPoints.join(', '),
      personalize_by: personalizeBy.join(', '),
      personalize_by_joined: personalizeBy.join(', '),
      question_count: String(questionCount),
      skill_names: skillNames.join(', '),
      skill_names_joined: skillNames.join(', '),
    };

    const updates: Record<string, any> = {};
    let promptGenerated = false;

    // --- A. PROMPTS ---
    const typePrompts = PROMPTS[msType];
    if (typePrompts) {
      for (const [field, template] of Object.entries(typePrompts)) {
        if (!(ms as any)[field]) {
          updates[field] = interpolate(template, params);
          promptGenerated = true;
        } else {
          report.prompts.skipped++;
        }
      }
    } else {
      report.issues.push({ category: 'prompt', detail: `No prompt templates for type "${msType}" on ${ms.id}` });
    }

    if (promptGenerated) {
      updates.prompt_source = 'inline';
      report.prompts.generated++;
      report.prompts.byType[msType] = (report.prompts.byType[msType] || 0) + 1;
    }

    // --- B. SKILLS ---
    const currentSkills = ms.associated_skill_ids;
    if (!currentSkills || currentSkills.length === 0) {
      if (mappedSkillIds.length > 0) {
        updates.associated_skill_ids = mappedSkillIds;
        report.skills.mapped++;
      } else {
        report.issues.push({ category: 'skill', detail: `No skills found for layer "${skillArea}" on ${ms.id}` });
      }
    } else {
      report.skills.skipped++;
    }

    // --- C. VARIABLES ---
    const currentVars = ms.associated_variable_keys;
    if (!currentVars || currentVars.length === 0) {
      const varKeys = mapVariablesForType(msType, personalizeBy, validVarKeys);
      if (varKeys.length > 0) {
        updates.associated_variable_keys = varKeys;
        report.variables.mapped++;
      }
    } else {
      report.variables.skipped++;
    }

    // --- D. ARTIFACTS (implementation_task only) ---
    if (msType === 'implementation_task') {
      const currentArtifacts = ms.creates_artifact_ids;
      const existingForLesson = artifactsByLesson[lesson.id] || [];
      if ((!currentArtifacts || currentArtifacts.length === 0) && existingForLesson.length === 0) {
        if (!dryRun) {
          const artifact = await ArtifactDefinition.create({
            id: uuidv4(),
            lesson_id: lesson.id,
            name: `${ms.title} Deliverable`,
            description: ms.description || '',
            artifact_type: 'document',
            file_types: ['.pdf', '.docx', '.xlsx', '.pptx'],
            evaluation_criteria: `Must address: ${keyPoints.join(', ')}. Personalized to learner's industry and organization.`,
            required_for_build_unlock: lesson.lesson_number === 5,
            required_for_session: false,
            required_for_presentation_unlock: false,
            requires_github_validation: false,
            requires_screenshot: false,
            versioning_enabled: false,
            sort_order: 0,
          } as any);
          updates.creates_artifact_ids = [artifact.id];
          updates.associated_artifact_ids = [artifact.id];
          // Cache for idempotency within this run
          if (!artifactsByLesson[lesson.id]) artifactsByLesson[lesson.id] = [];
          artifactsByLesson[lesson.id].push(artifact);
          report.artifacts.created++;
          report.artifacts.linked++;
        } else {
          report.artifacts.created++;
          report.artifacts.linked++;
        }
      } else if (existingForLesson.length > 0 && (!currentArtifacts || currentArtifacts.length === 0)) {
        // Artifact exists but not linked
        updates.creates_artifact_ids = [existingForLesson[0].id];
        updates.associated_artifact_ids = [existingForLesson[0].id];
        report.artifacts.linked++;
      } else {
        report.artifacts.skipped++;
      }
    }

    // --- Apply Updates ---
    if (Object.keys(updates).length > 0 && !dryRun) {
      await ms.update(updates as any);
    }
  }

  // 3. Re-score all MiniSections
  if (!dryRun) {
    let totalAfterScore = 0;
    for (const ms of miniSections) {
      try {
        const result = await scoreMiniSection(ms.id);
        totalAfterScore += result.overall;
        report.quality.scored++;
      } catch (err: any) {
        report.issues.push({ category: 'data', detail: `Scoring failed for ${ms.id}: ${err.message}` });
      }
    }
    report.quality.avgAfter = report.quality.scored > 0
      ? Math.round(totalAfterScore / report.quality.scored)
      : 0;
  } else {
    report.quality.avgAfter = report.quality.avgBefore;
    report.quality.scored = miniSections.length;
  }

  report.duration_ms = Date.now() - startTime;
  return report;
}
