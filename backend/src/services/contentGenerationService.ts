import OpenAI from 'openai';
import CurriculumLesson from '../models/CurriculumLesson';
import UserCurriculumProfile from '../models/UserCurriculumProfile';
import { SectionConfig, PromptTemplate, ProgramBlueprint, MiniSection, ArtifactDefinition } from '../models';
import CurriculumModule from '../models/CurriculumModule';
import * as variableService from './variableService';
import CurriculumTypeDefinition from '../models/CurriculumTypeDefinition';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

function buildPersonalizationContext(
  profile: UserCurriculumProfile,
  priorLabResponses: Record<string, any>
): string {
  const parts: string[] = [];

  if (profile.company_name) parts.push(`Company: ${profile.company_name}`);
  if (profile.industry) parts.push(`Industry: ${profile.industry}`);
  if (profile.company_size) parts.push(`Company Size: ${profile.company_size}`);
  if (profile.role) parts.push(`Role: ${profile.role}`);
  if (profile.goal) parts.push(`Goal: ${profile.goal}`);
  if (profile.ai_maturity_level) parts.push(`AI Maturity Level: ${profile.ai_maturity_level}/5`);
  if (profile.identified_use_case) parts.push(`Identified Use Case: ${profile.identified_use_case}`);
  if (profile.strategy_call_notes) parts.push(`Strategy Call Notes: ${profile.strategy_call_notes}`);
  if (profile.internal_systems_json) {
    parts.push(`Internal Systems: ${JSON.stringify(profile.internal_systems_json)}`);
  }

  if (Object.keys(priorLabResponses).length > 0) {
    parts.push('\nPrior Lab Submissions:');
    for (const [labTitle, responses] of Object.entries(priorLabResponses)) {
      parts.push(`  ${labTitle}:`);
      for (const [key, value] of Object.entries(responses as Record<string, any>)) {
        parts.push(`    ${key}: ${value}`);
      }
    }
  }

  return parts.join('\n');
}

export async function generateLessonContent(
  lesson: CurriculumLesson,
  profile: UserCurriculumProfile,
  priorLabResponses: Record<string, any> = {},
  enrollmentId?: string
): Promise<any> {
  let personalizationContext = buildPersonalizationContext(profile, priorLabResponses);
  const template = lesson.content_template_json || {};

  // Inject resolved variables from orchestration engine if available
  if (enrollmentId) {
    try {
      const sectionConfig = await SectionConfig.findOne({ where: { lesson_id: lesson.id } });
      if (sectionConfig) {
        const resolvedVars = await variableService.getAllVariables(enrollmentId);
        if (Object.keys(resolvedVars).length > 0) {
          personalizationContext += '\n\nOrchestration Variables:';
          for (const [key, value] of Object.entries(resolvedVars)) {
            personalizationContext += `\n${key}: ${value}`;
          }
        }
      }
    } catch {
      // Non-critical — continue without variables
    }
  }

  // Check for mini-sections (7-layer composite path)
  let miniSections: MiniSection[] = [];
  if (enrollmentId) {
    try {
      miniSections = await MiniSection.findAll({
        where: { lesson_id: lesson.id, is_active: true },
        include: [
          { model: PromptTemplate, as: 'conceptPrompt' },
          { model: PromptTemplate, as: 'buildPrompt' },
          { model: PromptTemplate, as: 'mentorPrompt' },
        ],
        order: [['mini_section_order', 'ASC']],
      });
    } catch {
      // Non-critical — fall through to V2 path
    }
  }

  let systemPrompt: string;
  let userPrompt: string;

  if (enrollmentId && miniSections.length > 0) {
    // 7-layer composite prompt path
    const composite = await buildCompositePrompt(lesson, profile, enrollmentId, priorLabResponses, miniSections, personalizationContext);
    systemPrompt = composite.systemPrompt;
    userPrompt = composite.userPrompt;
  } else {
    // Existing V2 path (backward compatible)
    systemPrompt = CONCEPT_V2_SYSTEM_PROMPT;
    userPrompt = buildConceptV2Prompt(lesson, template, personalizationContext);
  }

  try {
    const response = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 10000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from LLM');

    const parsed = JSON.parse(content);

    // Validate v2 content has required fields — use fallback if truncated/malformed
    if (!parsed.content_version || !parsed.concept_snapshot) {
      console.error('[ContentGeneration] Malformed v2 content, using fallback. Keys:', Object.keys(parsed));
      return buildFallbackContent(lesson);
    }

    // Store output variables if SectionConfig defines variable_output_map
    if (enrollmentId) {
      try {
        const sectionConfig = await SectionConfig.findOne({ where: { lesson_id: lesson.id } });
        const outputMap = sectionConfig?.variable_output_map as Record<string, string> | null;
        if (outputMap && typeof outputMap === 'object') {
          for (const [jsonPath, varKey] of Object.entries(outputMap)) {
            const value = getNestedValue(parsed, jsonPath);
            if (value) {
              await variableService.setVariable(
                enrollmentId,
                varKey,
                typeof value === 'string' ? value : JSON.stringify(value),
                'session',
                { sectionId: sectionConfig!.id }
              );
            }
          }
        }
      } catch {
        // Non-critical
      }
    }

    return parsed;
  } catch (err) {
    console.error('[ContentGeneration] Error:', err);
    return buildFallbackContent(lesson);
  }
}

/* ------------------------------------------------------------------ */
/*  System Prompts                                                     */
/* ------------------------------------------------------------------ */

// V1 prompt kept for backwards compatibility with cached content
const CONCEPT_SYSTEM_PROMPT = `You are an expert AI instructor creating personalized executive education content.
Your content must be practical, business-focused, and personalized to the learner's industry and company.

NEVER generate generic academic content. Every example, analogy, and case study must reference the learner's industry and context.

Return valid JSON with this schema:
{
  "concept_explanation": "3-4 paragraph explanation personalized to their industry (string)",
  "business_example": "A concrete example using their company context (string)",
  "industry_application": "How this applies specifically in their industry (string)",
  "key_takeaways": ["5 bullet points (array of strings)"],
  "discussion_questions": ["2-3 questions to deepen understanding (array of strings)"]
}`;

const CONCEPT_V2_SYSTEM_PROMPT = `You are an expert AI-native instructor creating personalized executive education content.
Your content follows the AI-Native Learning System model with 6 structured sections.
Every section must be practical, business-focused, and personalized to the learner's industry and company.

NEVER generate generic academic content. Every example, analogy, and case study must reference the learner's industry and context.

Return valid JSON with this exact schema:
{
  "content_version": "v2",
  "concept_snapshot": {
    "title": "Clear, concise concept name (string)",
    "definition": "2-3 sentence plain-language definition (string)",
    "why_it_matters": "Why this matters for the learner's role and industry (string)",
    "visual_metaphor": "A relatable analogy or metaphor to anchor understanding (string)"
  },
  "ai_strategy": {
    "description": "How AI applies to this concept in their industry (string)",
    "when_to_use_ai": ["3-4 specific tasks/decisions to delegate to AI (array of strings)"],
    "human_responsibilities": ["3-4 things that must stay human-owned (array of strings)"],
    "suggested_prompt": "A detailed, research-oriented prompt personalized with their company name, role, and industry. Should start them on a practical research path relevant to this lesson. 3-5 sentences long. (string)"
  },
  "prompt_template": {
    "template": "A detailed, multi-step reusable prompt template with {{placeholder_name}} markers embedded directly in the text (string). CRITICAL: The template text MUST contain {{double_curly_brace}} markers for EVERY placeholder listed in the placeholders array. Example: 'I am focused on {{department_focus}} and facing {{specific_challenge}}. Help me...' Do NOT write questions as plain text — embed {{placeholder_name}} markers where the user's answer belongs. The template should be 4-8 sentences and include specific instructions for the AI to follow, desired output format, and context. Do NOT use {{company_name}}, {{industry}}, or {{role}} — these are auto-filled. Instead use discovery-oriented placeholders that gather NEW information.",
    "placeholders": [
      {
        "name": "placeholder_name (string — use snake_case. Do NOT use company_name, industry, or role. Instead use: department_focus, specific_challenge, current_process, desired_outcome, key_stakeholders, budget_range, timeline, scope_area)",
        "description": "A question that helps the learner think about their situation (string — phrase as a question, e.g. 'Are you analyzing your whole company or a specific department?')",
        "example": "An example value for this placeholder (string)"
      }
    ],
    "expected_output_shape": "Description of what the AI output should look like (string)"
  },
  "implementation_task": {
    "title": "Clear, actionable assignment title (string)",
    "description": "2-3 sentence description of what the student will build and why, personalized to their context (string)",
    "requirements": ["3-5 specific requirements the deliverable must meet (array of strings)"],
    "deliverable": "What the learner should produce (string)",
    "estimated_minutes": 45,
    "getting_started": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
    "required_artifacts": [
      {
        "name": "Name of the deliverable artifact (string)",
        "description": "What this artifact should contain (string)",
        "file_types": [".xlsx", ".pdf", ".docx", ".pptx", ".png", ".jpg", ".csv"],
        "validation_criteria": "Specific criteria the artifact will be graded against (string)",
        "allow_screenshot": false
      }
    ]
  },
  "knowledge_checks": {
    "concept_snapshot": [
      {
        "question": "Scenario-based question about the core concept (string)",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "correct_answer": "A",
        "explanation": "Why this answer is correct (string)",
        "ai_followup_prompt": "Prompt to explore this topic further with AI (string)"
      }
    ],
    "ai_strategy": [
      {
        "question": "Question about AI vs human task separation (string)",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "correct_answer": "A",
        "explanation": "Why this answer is correct (string)",
        "ai_followup_prompt": "Prompt to explore this topic further with AI (string)"
      }
    ],
    "prompt_template": [
      {
        "question": "Question about effective prompt engineering (string)",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "correct_answer": "A",
        "explanation": "Why this answer is correct (string)",
        "ai_followup_prompt": "Prompt to explore this topic further with AI (string)"
      }
    ],
    "implementation_task": [
      {
        "question": "Question about applying the concept in practice (string)",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "correct_answer": "A",
        "explanation": "Why this answer is correct (string)",
        "ai_followup_prompt": "Prompt to explore this topic further with AI (string)"
      }
    ],
    "reflection": [
      {
        "question": "Question testing strategic thinking about the concept (string)",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "correct_answer": "A",
        "explanation": "Why this answer is correct (string)",
        "ai_followup_prompt": "Prompt to explore this topic further with AI (string)"
      }
    ]
  },
  "reflection_questions": [
    {
      "question": "A thought-provoking question (string)",
      "prompt_for_deeper_thinking": "A guiding prompt that helps the learner think more deeply about this question (string)"
    }
  ]
}

IMPORTANT RULES:
- Do NOT generate code_examples — this is an executive training program, not a coding course.
- Generate 1-2 knowledge check questions PER SECTION (concept_snapshot, ai_strategy, prompt_template, implementation_task, reflection) — 5-8 total distributed across sections.
- Generate 3 reflection questions.
- For knowledge_checks, correct_answer must be a letter (A, B, C, or D) matching the first character of the correct option.
- For implementation_task.getting_started, provide 3 concrete first steps (e.g., "Open ChatGPT and paste the prompt template", "Gather your company's current AI tools list").
- For implementation_task.required_artifacts, specify 1-3 concrete deliverables with appropriate file_types. For large artifacts like SSIS packages, set allow_screenshot to true. Common file types: .xlsx, .pdf, .docx, .pptx, .png, .csv
- For prompt_template, the template string MUST contain {{placeholder_name}} markers for EVERY placeholder in the placeholders array. WRONG: "What challenge are you facing?" RIGHT: "I am facing {{specific_challenge}} in my {{department_focus}}." The markers get replaced with user values at runtime. Do NOT use company_name, industry, or role as placeholders — these are auto-filled. Use discovery-oriented placeholders: department_focus, specific_challenge, current_process, desired_outcome, key_stakeholders, scope_area, etc. Write placeholder descriptions as questions for the UI form labels.
- For ai_strategy.suggested_prompt, write a detailed, personalized prompt that uses the learner's actual company/role/industry context. It should be 3-5 sentences and guide them toward practical research or analysis.
- Personalize ALL content to the learner's industry, company, role, and AI maturity level.`;

const ASSESSMENT_SYSTEM_PROMPT = `You are an expert AI assessment designer creating knowledge checks for executive education.
Questions must be practical and scenario-based, not academic trivia.

Return valid JSON with this schema:
{
  "questions": [
    {
      "question": "string",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct_answer": "A",
      "explanation": "Why this is correct (string)"
    }
  ]
}

Generate exactly the number of questions specified. Make questions scenario-based using the learner's industry context.`;

const LAB_SYSTEM_PROMPT = `You are an expert AI instructor preparing a hands-on lab exercise for executive education.
The lab requires structured data input. Provide context and guidance personalized to the learner.

Return valid JSON with this schema:
{
  "instructions": "Detailed lab instructions personalized to their context (string)",
  "context_brief": "Why this exercise matters for their organization (string)",
  "field_guidance": { "field_name": "Specific guidance for filling this field (object)" },
  "example_responses": { "field_name": "Example answer using their industry context (object)" }
}`;

const REFLECTION_SYSTEM_PROMPT = `You are an expert AI coach guiding executive reflection.
Create thoughtful reflection prompts personalized to the learner's journey.

Return valid JSON with this schema:
{
  "prompts": [
    {
      "question": "Reflection question (string)",
      "guidance": "Brief guidance on how to think about this (string)"
    }
  ],
  "synthesis_prompt": "A final prompt that connects all reflections together (string)"
}`;

/* ------------------------------------------------------------------ */
/*  Prompt Builders                                                    */
/* ------------------------------------------------------------------ */

function buildConceptPrompt(lesson: CurriculumLesson, template: any, context: string): string {
  return `Create personalized lesson content for:

LESSON: ${lesson.title}
DESCRIPTION: ${lesson.description}
KEY POINTS TO COVER: ${(template.key_points || []).join(', ')}

LEARNER CONTEXT:
${context}

Make ALL examples and applications specific to this learner's industry and company context. Do not use generic examples.`;
}

function buildConceptV2Prompt(lesson: CurriculumLesson, template: any, context: string): string {
  return `Create AI-native personalized lesson content for:

LESSON: ${lesson.title}
DESCRIPTION: ${lesson.description}
KEY POINTS TO COVER: ${(template.key_points || []).join(', ')}
SKILL AREA: ${template.skill_area || 'general'}

LEARNER CONTEXT:
${context}

Create ALL 6 sections of the AI-Native Learning System model (concept_snapshot, ai_strategy, prompt_template, implementation_task, knowledge_checks, reflection_questions).
Do NOT include code_examples — this is executive training, not a coding course.
The prompt template should be directly usable with ChatGPT, Claude, or similar AI tools.
The implementation task assignment must use the learner's actual company/industry context and include required_artifacts with specific file types and validation criteria.
The suggested_prompt in ai_strategy must be detailed and research-oriented — not a generic one-liner.
Knowledge checks must be scenario-based, not trivia.`;
}

function buildAssessmentPrompt(lesson: CurriculumLesson, template: any, context: string): string {
  return `Create an assessment for:

LESSON: ${lesson.title}
TOPICS COVERED: ${(template.covers || []).join(', ')}
NUMBER OF QUESTIONS: ${template.question_count || 10}
QUESTION TYPES: ${(template.question_types || ['multiple_choice']).join(', ')}

LEARNER CONTEXT:
${context}

Make questions scenario-based using the learner's industry context. Each question should test practical understanding, not memorization.`;
}

function buildLabPrompt(lesson: CurriculumLesson, template: any, context: string): string {
  return `Prepare lab guidance for:

LESSON: ${lesson.title}
DESCRIPTION: ${lesson.description}

LEARNER CONTEXT:
${context}

Provide specific guidance and examples tailored to their industry and company. Reference their prior lab submissions where relevant.`;
}

function buildReflectionPrompt(lesson: CurriculumLesson, template: any, context: string): string {
  const prompts = template.reflection_prompts || [];
  return `Create reflection content for:

LESSON: ${lesson.title}
SUGGESTED PROMPTS: ${prompts.join('\n- ')}

LEARNER CONTEXT:
${context}

Personalize the reflection prompts to reference their specific journey, industry, and prior work.`;
}

/* ------------------------------------------------------------------ */
/*  7-Layer Composite Prompt Builder                                   */
/* ------------------------------------------------------------------ */

async function buildCompositePrompt(
  lesson: CurriculumLesson,
  profile: UserCurriculumProfile,
  enrollmentId: string,
  priorLabResponses: Record<string, any>,
  miniSections: MiniSection[],
  personalizationContext: string
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const parts: string[] = [];

  // Layer 1: Program Blueprint
  try {
    const module = await CurriculumModule.findByPk(lesson.module_id);
    if (module?.program_id) {
      const blueprint = await ProgramBlueprint.findByPk(module.program_id);
      if (blueprint?.default_prompt_injection_rules) {
        const rules = blueprint.default_prompt_injection_rules;
        parts.push('=== PROGRAM CONTEXT ===');
        if (rules.system_context) parts.push(rules.system_context);
        if (rules.tone) parts.push(`Tone: ${rules.tone}`);
        if (rules.audience_level) parts.push(`Audience: ${rules.audience_level}`);
        if (blueprint.learning_philosophy) parts.push(`Philosophy: ${blueprint.learning_philosophy}`);
        parts.push('');
      }
    }
  } catch { /* non-critical */ }

  // Layer 2: Section Blueprint
  parts.push('=== SECTION BLUEPRINT ===');
  parts.push(`Section: ${lesson.title}`);
  parts.push(`Description: ${lesson.description}`);
  if (lesson.learning_goal) parts.push(`Learning Goal: ${lesson.learning_goal}`);
  if (lesson.build_phase_flag) parts.push('Phase: BUILD (hands-on creation)');
  if (lesson.presentation_phase_flag) parts.push('Phase: PRESENTATION (executive delivery)');
  parts.push('');

  // Layer 3: Mini-Section Structure (Type-Aware)
  parts.push('=== MINI-SECTIONS ===');
  parts.push('Generate content for each typed sub-section below. Each type maps to a specific output section:');
  parts.push('- executive_reality_check → concept_snapshot');
  parts.push('- ai_strategy → ai_strategy');
  parts.push('- prompt_template → prompt_template');
  parts.push('- implementation_task → implementation_task');
  parts.push('- knowledge_check → knowledge_checks');
  parts.push('');
  for (const ms of miniSections) {
    parts.push(`\n--- Sub-Section ${ms.mini_section_order}: ${ms.title} ---`);
    parts.push(`Type: ${ms.mini_section_type || 'untyped'}`);
    if (ms.description) parts.push(`Description: ${ms.description}`);
    if (ms.completion_weight !== 1.0) parts.push(`Weight: ${ms.completion_weight}`);

    // Type-specific generation instructions
    switch (ms.mini_section_type) {
      case 'executive_reality_check':
        parts.push('Output: Generate the concept_snapshot section — title, definition, why_it_matters, visual_metaphor.');
        parts.push('Focus on dynamic contextual analysis using the learner\'s variables and industry context.');
        break;
      case 'ai_strategy':
        parts.push('Output: Generate the ai_strategy section — description, when_to_use_ai, human_responsibilities, suggested_prompt.');
        parts.push('Focus on strategic AI application frameworks aligned with curriculum goals.');
        break;
      case 'prompt_template':
        parts.push('Output: Generate the prompt_template section — template with {{placeholders}}, placeholders array, expected_output_shape.');
        if (ms.creates_variable_keys?.length) {
          parts.push(`Creates Variables: ${ms.creates_variable_keys.join(', ')}. Ensure output is structured so these can be extracted.`);
        }
        break;
      case 'implementation_task':
        parts.push('Output: Generate the implementation_task section — title, description, requirements, deliverable, getting_started, required_artifacts.');
        if (ms.creates_artifact_ids?.length) {
          // Load artifact definitions for richer instructions
          try {
            const artDefs = await ArtifactDefinition.findAll({ where: { id: ms.creates_artifact_ids } });
            for (const art of artDefs) {
              parts.push(`Artifact: ${art.name} (${art.artifact_type}) — ${art.description || ''}`);
              if (art.evaluation_criteria) parts.push(`  Evaluation: ${art.evaluation_criteria}`);
            }
          } catch { /* non-critical */ }
        }
        break;
      case 'knowledge_check':
        parts.push('Output: Generate knowledge_checks questions for the associated skills.');
        if (ms.knowledge_check_config?.enabled) {
          parts.push(`Questions: ${ms.knowledge_check_config.question_count}, pass score: ${ms.knowledge_check_config.pass_score}%`);
        }
        if (ms.associated_skill_ids?.length) {
          parts.push(`Assess Skills: ${ms.associated_skill_ids.join(', ')}`);
        }
        break;
      default:
        // Dynamic custom type — load definition for generation instructions
        try {
          const typeDef = await CurriculumTypeDefinition.findOne({ where: { slug: ms.mini_section_type } });
          if (typeDef) {
            parts.push(`Output: Generate content for custom section type "${typeDef.student_label}".`);
            if (typeDef.description) parts.push(`Type Description: ${typeDef.description}`);
            if (typeDef.can_create_variables && ms.creates_variable_keys?.length) {
              parts.push(`Creates Variables: ${ms.creates_variable_keys.join(', ')}.`);
            }
          } else {
            parts.push(`Output: Generate content for section type "${ms.mini_section_type}".`);
          }
        } catch {
          parts.push(`Output: Generate content for section type "${ms.mini_section_type}".`);
        }
        break;
    }

    // Context variable substitution for inline prompts ({{section_title}}, {{mini_section_title}}, etc.)
    const contextVars: Record<string, string> = {
      'section_title': lesson.title,
      'section_description': lesson.description || '',
      'section_learning_goal': lesson.learning_goal || '',
      'mini_section_title': ms.title,
      'mini_section_description': ms.description || '',
      'mini_section_order': String(ms.mini_section_order),
      'mini_section_type': ms.mini_section_type || '',
    };
    const substituteVars = (text: string): string => {
      let result = text;
      for (const [key, value] of Object.entries(contextVars)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
      return result;
    };

    const mergePromptFields = (sys: string | undefined, usr: string | undefined): string => {
      if (sys && usr) return sys + '\n\n' + usr;
      return sys || usr || '';
    };

    // Concept prompt
    const conceptInline = mergePromptFields((ms as any).concept_prompt_system, (ms as any).concept_prompt_user);
    if (conceptInline) {
      parts.push(`Concept Prompt:\n${substituteVars(conceptInline)}`);
    } else {
      const conceptPrompt = (ms as any).conceptPrompt;
      if (conceptPrompt?.user_prompt_template) {
        parts.push(`Concept Prompt:\n${substituteVars(conceptPrompt.user_prompt_template)}`);
      }
    }

    // Build prompt
    const buildInline = mergePromptFields((ms as any).build_prompt_system, (ms as any).build_prompt_user);
    if (buildInline) {
      parts.push(`Build Prompt:\n${substituteVars(buildInline)}`);
    } else {
      const buildPrompt = (ms as any).buildPrompt;
      if (buildPrompt?.user_prompt_template) {
        parts.push(`Build Prompt:\n${substituteVars(buildPrompt.user_prompt_template)}`);
      }
    }

    // Mentor prompt
    const mentorInline = mergePromptFields((ms as any).mentor_prompt_system, (ms as any).mentor_prompt_user);
    if (mentorInline) {
      parts.push(`Mentor Prompt:\n${substituteVars(mentorInline)}`);
    } else {
      const mentorPrompt = (ms as any).mentorPrompt;
      if (mentorPrompt?.user_prompt_template) {
        parts.push(`Mentor Prompt:\n${substituteVars(mentorPrompt.user_prompt_template)}`);
      }
    }

    // KC and Reflection prompts
    const kcInline = mergePromptFields((ms as any).kc_prompt_system, (ms as any).kc_prompt_user);
    if (kcInline) {
      parts.push(`Knowledge Check Prompt:\n${substituteVars(kcInline)}`);
    }
    const reflectionInline = mergePromptFields((ms as any).reflection_prompt_system, (ms as any).reflection_prompt_user);
    if (reflectionInline) {
      parts.push(`Reflection Prompt:\n${substituteVars(reflectionInline)}`);
    }
  }
  parts.push('');

  // Layer 4: Learner Data (appended as key-value pairs for natural personalization)
  parts.push('=== LEARNER CONTEXT ===');
  parts.push(personalizationContext);
  const learnerDataBlock = await variableService.buildLearnerDataBlock(enrollmentId);
  if (learnerDataBlock) parts.push(learnerDataBlock);

  // Layer 5: Artifact Expectations
  try {
    const artifacts = await ArtifactDefinition.findAll({ where: { lesson_id: lesson.id } });
    if (artifacts.length > 0) {
      parts.push('\n=== EXPECTED ARTIFACTS ===');
      for (const art of artifacts) {
        parts.push(`- ${art.name} (${art.artifact_type}): ${art.description || ''}`);
      }
    }
  } catch { /* non-critical */ }

  // Layer 6: Session Context
  if (lesson.associated_session_id) {
    try {
      const { LiveSession } = await import('../models');
      const session = await LiveSession.findByPk(lesson.associated_session_id);
      if (session) {
        parts.push('\n=== SESSION CONTEXT ===');
        parts.push(`Associated Session: ${session.title}`);
        if (session.description) parts.push(`Session Theme: ${session.description}`);
      }
    } catch { /* non-critical */ }
  }

  // Layer 7: Mentor Brief
  try {
    const sectionConfig = await SectionConfig.findOne({
      where: { lesson_id: lesson.id },
      include: [{ model: PromptTemplate, as: 'mentorPrompt' }],
    });
    const mentorPrompt = (sectionConfig as any)?.mentorPrompt;
    if (mentorPrompt?.user_prompt_template) {
      parts.push('\n=== MENTOR BRIEF ===');
      parts.push(mentorPrompt.user_prompt_template);
    }
  } catch { /* non-critical */ }

  return {
    systemPrompt: CONCEPT_V2_SYSTEM_PROMPT,
    userPrompt: parts.join('\n'),
  };
}

async function resolveTemplate(template: string, enrollmentId: string): Promise<string> {
  try {
    const vars = await variableService.getAllVariables(enrollmentId);
    let resolved = template;
    for (const [key, value] of Object.entries(vars)) {
      resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return resolved;
  } catch {
    return template;
  }
}

/* ------------------------------------------------------------------ */
/*  Fallback (if LLM fails)                                            */
/* ------------------------------------------------------------------ */

function buildFallbackContent(lesson: CurriculumLesson): any {
  // Always return V2 format for unified section architecture
  return {
    content_version: 'v2',
    concept_snapshot: {
      title: lesson.title,
      definition: lesson.description || 'Content is being generated. Please try again.',
      why_it_matters: 'This concept is key to your AI leadership journey.',
      visual_metaphor: '',
    },
    ai_strategy: {
      description: 'AI strategy content will be personalized to your industry.',
      when_to_use_ai: ['Data analysis and pattern recognition', 'Draft generation and iteration'],
      human_responsibilities: ['Strategic decision-making', 'Stakeholder relationship management'],
      suggested_prompt: 'As a leader in my industry, help me identify the top 3 AI use cases for my organization.',
    },
    prompt_template: {
      template: 'As a {{role}} in {{industry}}, help me understand {{topic}}.',
      placeholders: [
        { name: 'role', description: 'Your job title or role', example: 'VP of Operations' },
        { name: 'industry', description: 'Your industry', example: 'Healthcare' },
        { name: 'topic', description: 'The concept to explore', example: 'AI-driven process optimization' },
      ],
      expected_output_shape: 'A structured analysis with key insights, practical recommendations, and next steps.',
    },
    implementation_task: {
      title: 'Apply This Concept',
      description: 'Apply this concept to your organization by identifying a practical use case and drafting an implementation plan.',
      requirements: ['Identify an application area', 'Draft a plan', 'Assess feasibility'],
      deliverable: 'A brief implementation outline.',
      required_artifacts: [
        {
          name: 'Implementation Outline',
          description: 'A document outlining how you would apply this concept in your organization.',
          file_types: ['.pdf', '.docx', '.xlsx'],
          validation_criteria: 'Must include at least 3 application areas with feasibility assessment.',
          allow_screenshot: false,
        },
      ],
    },
    knowledge_checks: [],
    reflection_questions: [
      { question: 'How does this apply to your role?', prompt_for_deeper_thinking: 'Think about your daily responsibilities and where AI could augment your decision-making.' },
    ],
  };
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, key) => o?.[key], obj);
}

/* ------------------------------------------------------------------ */
/*  Exported: Composite Prompt Builder for Test Simulation             */
/* ------------------------------------------------------------------ */

/**
 * Build composite prompt for simulation — no enrollment needed.
 * Uses test variables for template resolution instead of enrollment variable store.
 */
export async function buildCompositePromptForSimulation(
  lesson: CurriculumLesson,
  miniSections: MiniSection[],
  personalizationContext: string,
  testVariables: Record<string, string>
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const parts: string[] = [];

  // Layer 1: Program Blueprint
  try {
    const module = await CurriculumModule.findByPk(lesson.module_id);
    if (module?.program_id) {
      const blueprint = await ProgramBlueprint.findByPk(module.program_id);
      if (blueprint?.default_prompt_injection_rules) {
        const rules = blueprint.default_prompt_injection_rules;
        parts.push('=== PROGRAM CONTEXT ===');
        if (rules.system_context) parts.push(rules.system_context);
        if (rules.tone) parts.push(`Tone: ${rules.tone}`);
        if (rules.audience_level) parts.push(`Audience: ${rules.audience_level}`);
        if (blueprint.learning_philosophy) parts.push(`Philosophy: ${blueprint.learning_philosophy}`);
        parts.push('');
      }
    }
  } catch { /* non-critical */ }

  // Layer 2: Section Blueprint
  parts.push('=== SECTION BLUEPRINT ===');
  parts.push(`Section: ${lesson.title}`);
  parts.push(`Description: ${lesson.description}`);
  if (lesson.learning_goal) parts.push(`Learning Goal: ${lesson.learning_goal}`);
  if (lesson.build_phase_flag) parts.push('Phase: BUILD (hands-on creation)');
  if (lesson.presentation_phase_flag) parts.push('Phase: PRESENTATION (executive delivery)');
  parts.push('');

  // Layer 3: Mini-Section Structure
  parts.push('=== MINI-SECTIONS ===');
  parts.push('Generate content for each typed sub-section below. Each type maps to a specific output section:');
  parts.push('- executive_reality_check → concept_snapshot');
  parts.push('- ai_strategy → ai_strategy');
  parts.push('- prompt_template → prompt_template');
  parts.push('- implementation_task → implementation_task');
  parts.push('- knowledge_check → knowledge_checks');
  parts.push('');

  for (const ms of miniSections) {
    parts.push(`\n--- Sub-Section ${ms.mini_section_order}: ${ms.title} ---`);
    parts.push(`Type: ${ms.mini_section_type || 'untyped'}`);
    if (ms.description) parts.push(`Description: ${ms.description}`);

    switch (ms.mini_section_type) {
      case 'executive_reality_check':
        parts.push('Output: Generate the concept_snapshot section — title, definition, why_it_matters, visual_metaphor.');
        break;
      case 'ai_strategy':
        parts.push('Output: Generate the ai_strategy section — description, when_to_use_ai, human_responsibilities, suggested_prompt.');
        break;
      case 'prompt_template':
        parts.push('Output: Generate the prompt_template section — template with {{placeholders}}, placeholders array, expected_output_shape.');
        if (ms.creates_variable_keys?.length) {
          parts.push(`Creates Variables: ${ms.creates_variable_keys.join(', ')}.`);
        }
        break;
      case 'implementation_task':
        parts.push('Output: Generate the implementation_task section — title, description, requirements, deliverable, getting_started, required_artifacts.');
        if (ms.creates_artifact_ids?.length) {
          try {
            const artDefs = await ArtifactDefinition.findAll({ where: { id: ms.creates_artifact_ids } });
            for (const art of artDefs) {
              parts.push(`Artifact: ${art.name} (${art.artifact_type}) — ${art.description || ''}`);
            }
          } catch { /* non-critical */ }
        }
        break;
      case 'knowledge_check':
        parts.push('Output: Generate knowledge_checks questions.');
        if (ms.knowledge_check_config?.enabled) {
          parts.push(`Questions: ${ms.knowledge_check_config.question_count}, pass score: ${ms.knowledge_check_config.pass_score}%`);
        }
        if (ms.associated_skill_ids?.length) {
          parts.push(`Assess Skills: ${ms.associated_skill_ids.join(', ')}`);
        }
        break;
      default:
        try {
          const typeDef = await CurriculumTypeDefinition.findOne({ where: { slug: ms.mini_section_type } });
          if (typeDef) {
            parts.push(`Output: Generate content for custom section type "${typeDef.student_label}".`);
            if (typeDef.description) parts.push(`Type Description: ${typeDef.description}`);
            if (typeDef.can_create_variables && ms.creates_variable_keys?.length) {
              parts.push(`Creates Variables: ${ms.creates_variable_keys.join(', ')}.`);
            }
          } else {
            parts.push(`Output: Generate content for section type "${ms.mini_section_type}".`);
          }
        } catch {
          parts.push(`Output: Generate content for section type "${ms.mini_section_type}".`);
        }
        break;
    }

    // Resolve prompts: merge system+user into single prompt (backward compat), fall back to FK templates
    const mergeFields = (sys: string | undefined, usr: string | undefined): string => {
      if (sys && usr) return sys + '\n\n' + usr;
      return sys || usr || '';
    };

    const conceptInline = mergeFields((ms as any).concept_prompt_system, (ms as any).concept_prompt_user);
    if (conceptInline) {
      parts.push(`Concept Prompt: ${conceptInline}`);
    } else {
      const conceptPrompt = (ms as any).conceptPrompt;
      if (conceptPrompt?.user_prompt_template) {
        parts.push(`Concept Prompt: ${conceptPrompt.user_prompt_template}`);
      }
    }

    const buildInline = mergeFields((ms as any).build_prompt_system, (ms as any).build_prompt_user);
    if (buildInline) {
      parts.push(`Build Prompt: ${buildInline}`);
    } else {
      const buildPrompt = (ms as any).buildPrompt;
      if (buildPrompt?.user_prompt_template) {
        parts.push(`Build Prompt: ${buildPrompt.user_prompt_template}`);
      }
    }

    const mentorInline = mergeFields((ms as any).mentor_prompt_system, (ms as any).mentor_prompt_user);
    if (mentorInline) {
      parts.push(`Mentor Prompt: ${mentorInline}`);
    } else {
      const mentorPrompt = (ms as any).mentorPrompt;
      if (mentorPrompt?.user_prompt_template) {
        parts.push(`Mentor Prompt: ${mentorPrompt.user_prompt_template}`);
      }
    }

    const kcInline = mergeFields((ms as any).kc_prompt_system, (ms as any).kc_prompt_user);
    if (kcInline) {
      parts.push(`Knowledge Check Prompt: ${kcInline}`);
    }
    const reflectionInline = mergeFields((ms as any).reflection_prompt_system, (ms as any).reflection_prompt_user);
    if (reflectionInline) {
      parts.push(`Reflection Prompt: ${reflectionInline}`);
    }
  }
  parts.push('');

  // Layer 4: Learner Context + Data Block
  parts.push('=== LEARNER CONTEXT ===');
  parts.push(personalizationContext);
  const testDataBlock = variableService.buildTestDataBlock(testVariables);
  if (testDataBlock) parts.push(testDataBlock);

  // Layer 5: Artifact Expectations
  try {
    const artifacts = await ArtifactDefinition.findAll({ where: { lesson_id: lesson.id } });
    if (artifacts.length > 0) {
      parts.push('\n=== EXPECTED ARTIFACTS ===');
      for (const art of artifacts) {
        parts.push(`- ${art.name} (${art.artifact_type}): ${art.description || ''}`);
      }
    }
  } catch { /* non-critical */ }

  // Layer 6: Session Context
  if (lesson.associated_session_id) {
    try {
      const { LiveSession } = await import('../models');
      const session = await LiveSession.findByPk(lesson.associated_session_id);
      if (session) {
        parts.push('\n=== SESSION CONTEXT ===');
        parts.push(`Associated Session: ${session.title}`);
        if (session.description) parts.push(`Session Theme: ${session.description}`);
      }
    } catch { /* non-critical */ }
  }

  return {
    systemPrompt: CONCEPT_V2_SYSTEM_PROMPT,
    userPrompt: parts.join('\n'),
  };
}

function resolveWithTestVars(template: string, vars: Record<string, string>): string {
  let resolved = template;
  for (const [key, value] of Object.entries(vars)) {
    resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return resolved;
}
