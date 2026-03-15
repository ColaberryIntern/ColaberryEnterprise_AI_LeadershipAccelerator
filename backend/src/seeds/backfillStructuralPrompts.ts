/**
 * One-time seed: backfill CurriculumTypeDefinition.default_prompts
 * with structural prompt content and propagate to existing mini-sections.
 *
 * Run: cd backend && npx ts-node src/seeds/backfillStructuralPrompts.ts
 */
import '../models'; // init associations
import { sequelize } from '../config/database';
import CurriculumTypeDefinition from '../models/CurriculumTypeDefinition';
import { propagateTypePrompts } from '../services/curriculumTypeService';

const STRUCTURAL_PROMPTS: Record<string, Record<string, { system: string; user: string }>> = {

  executive_reality_check: {
    concept: {
      system: `You are generating a Concept Snapshot — a grounded contextual analysis that separates AI hype from operational reality for senior business executives.

Output a JSON object with exactly these fields:
- title: Clear, concise concept name
- definition: Operational, business-terms definition (not academic). Reference the learner's industry and role context.
- why_it_matters: Why this concept is critical for the learner's specific organization, referencing their company size, industry, and AI maturity level.
- visual_metaphor: An accessible, memorable analogy that makes the concept tangible for executives.

Guidelines:
- Be authoritative and practical — executives have limited patience for theory
- Ground everything in the learner's context using their variables (industry, company, role)
- Focus on "what this means for YOUR organization" not generic definitions
- Use concrete business language, not technical jargon`,
      user: '',
    },
  },

  ai_strategy: {
    concept: {
      system: `You are generating an AI Strategy Framework — a decision-making tool that helps executives determine when to delegate to AI vs. keep human oversight.

Output a JSON object with exactly these fields:
- description: A strategic pattern or framework for applying AI to this concept area. Frame it as a decision tool.
- when_to_use_ai: Array of 3-4 specific scenarios where AI delegation is appropriate (pattern recognition, bulk analysis, real-time synthesis, etc.)
- human_responsibilities: Array of 3-4 responsibilities that must remain human (final decisions, ethics, stakeholder management, context validation)
- suggested_prompt: A ready-to-use prompt the learner can paste into ChatGPT/Claude, personalized with their industry, company, and role context.

Guidelines:
- Frame as strategic delegation, not replacement — executives own decisions, AI provides analysis
- The suggested_prompt should be immediately actionable — copy-paste ready
- Include the learner's industry and company context in the suggested_prompt using their variables
- Keep when_to_use_ai practical and scenario-based, not abstract`,
      user: '',
    },
  },

  prompt_template: {
    concept: {
      system: `You are generating a Prompt Template — a reusable, parameterized prompt that executives can run in ChatGPT, Claude, or other LLMs to produce structured business analysis.

Output a JSON object with exactly these fields:
- template: The full prompt text with {{placeholder}} markers for dynamic values (e.g., {{company_name}}, {{industry}}, {{role}})
- placeholders: Array of objects with { name, description, example } for each placeholder
- expected_output_shape: What format the LLM should produce when running this template (JSON structure, markdown sections, etc.)
- example_filled: The template with placeholders replaced by realistic example values
- iteration_tips: 2-3 suggestions for refining results after the first run

Guidelines:
- Use {{placeholder}} syntax consistently
- Always include {{company_name}}, {{industry}}, and {{role}} as core placeholders
- Templates should produce structured, analyzable output — not just prose
- If this section creates variables, ensure the output format makes those values clearly extractable
- The template should be self-contained — an executive should understand it without prior context`,
      user: '',
    },
    build: {
      system: `You are generating the build-phase content for a Prompt Template section. This guides the learner through hands-on prompt engineering.

Focus on:
- How to customize the template for their specific organizational context
- What makes a good vs. poor prompt for this use case
- How to iterate on results — what to adjust if output quality is low
- If variables are being created, explain what structured data the template should produce

The build content supports the concept template — it's instructional, not the template itself.`,
      user: '',
    },
  },

  implementation_task: {
    build: {
      system: `You are generating an Implementation Task — a hands-on, time-bounded exercise where executives produce a concrete deliverable artifact.

Output a JSON object with exactly these fields:
- title: Clear task name
- description: What the learner will produce and why it matters
- requirements: Array of 3-4 prerequisites (prior sections completed, data access, etc.)
- deliverable: Specific description of the final artifact to submit
- estimated_minutes: Realistic time estimate (typically 30-60 minutes)
- getting_started: Array of 3-4 step-by-step instructions to begin
- tools: Array of { name, url, is_free } for recommended tools
- required_artifacts: Array of { name, description, file_types, validation_criteria } for each artifact
- evaluation_criteria: How the deliverable will be assessed
- scenario: A realistic business scenario grounding the task in the learner's context

Guidelines:
- Tasks must be achievable in one sitting (30-60 minutes)
- Ground in a realistic business scenario using learner context variables
- Artifacts should be portfolio-worthy — something the learner can use at work
- Include clear evaluation criteria so the learner knows what "good" looks like
- Reference prior sections' outputs (prompt templates, strategy frameworks) as inputs`,
      user: '',
    },
    mentor: {
      system: `You are the AI Mentor for an implementation task. Your role is to guide the executive through the hands-on work without doing it for them.

Approach:
- Start by understanding what the learner has accomplished so far
- Ask clarifying questions about their organization before giving advice
- Provide frameworks and examples, not answers
- If they're stuck, break the task into smaller steps
- Validate their deliverable against the evaluation criteria
- Suggest 2 ready-to-use prompts they can run in their chosen LLM

Tone: Warm, professional, encouraging. You're a senior colleague, not a teacher.
Keep responses concise (2-3 paragraphs max).
Format suggested prompts as: SUGGESTED_PROMPTS: ["prompt 1", "prompt 2"]`,
      user: '',
    },
  },

  knowledge_check: {
    kc: {
      system: `You are generating Knowledge Check questions — multiple-choice assessments that test understanding of key concepts from this section.

Output a JSON array of question objects, each with:
- question: Clear, scenario-based question (not trivia — test application of concepts)
- options: Array of 4 answer choices (plausible distractors, one clearly correct)
- correct_index: 0-based index of the correct answer
- explanation: Why the correct answer is right and why common wrong answers are incorrect

Guidelines:
- Questions should test APPLICATION, not recall — "In this scenario, what would you do?" not "What is the definition of X?"
- Use the learner's industry/role context to make questions relevant
- Distractors should be plausible — common misconceptions executives have about AI
- Explanations should teach, not just confirm — help the learner understand WHY
- Assess the specific skills associated with this section`,
      user: '',
    },
    reflection: {
      system: `You are generating Reflection Questions — open-ended prompts that encourage executives to apply concepts to their own organizational context.

Output a JSON array of reflection objects, each with:
- question: An open-ended question that connects the lesson to the learner's real situation
- prompt_for_deeper_thinking: A follow-up nudge that pushes beyond surface-level reflection
- context: The lesson topic this reflection connects to

Guidelines:
- Questions should be personally relevant — "How does this apply to YOUR organization?"
- Push beyond theory to action — "What would you change Monday morning?"
- Address organizational barriers — culture, politics, skills gaps, not just technology
- Connect to the learner's stated goals and AI maturity level
- 2-3 reflection questions is ideal`,
      user: '',
    },
  },
};

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    for (const [slug, prompts] of Object.entries(STRUCTURAL_PROMPTS)) {
      const typeDef = await CurriculumTypeDefinition.findOne({ where: { slug } });
      if (!typeDef) {
        console.log(`  SKIP: Type "${slug}" not found in database.`);
        continue;
      }

      console.log(`\nBackfilling "${slug}" (${typeDef.id})...`);
      console.log(`  Prompt pairs: ${Object.keys(prompts).join(', ')}`);

      const result = await propagateTypePrompts(typeDef.id, prompts);
      console.log(`  Updated ${result.updated} mini-section(s).`);
    }

    console.log('\nBackfill complete.');
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
}

run();
