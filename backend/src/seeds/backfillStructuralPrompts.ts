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
      system: `Generate a concept_snapshot for "{{mini_section_title}}" in the context of {{section_title}}.

Output JSON: { title, definition, why_it_matters, visual_metaphor }

- definition: Operational business terms, grounded in the learner's industry and role
- why_it_matters: Why this matters for the learner's specific organization
- visual_metaphor: Accessible analogy that makes the concept tangible for executives`,
      user: '',
    },
  },

  ai_strategy: {
    concept: {
      system: `Generate an ai_strategy framework for "{{mini_section_title}}" within {{section_title}}.

Output JSON: { description, when_to_use_ai[], human_responsibilities[], suggested_prompt }

- when_to_use_ai: 3-4 scenarios where AI delegation is appropriate
- human_responsibilities: 3-4 responsibilities that must remain human
- suggested_prompt: Ready-to-use prompt personalized with learner's context variables`,
      user: '',
    },
  },

  prompt_template: {
    concept: {
      system: `Generate a prompt_template for "{{mini_section_title}}" within {{section_title}}.

Output JSON: { template, placeholders[], expected_output_shape, example_filled, iteration_tips }

- template: Use {{placeholder}} syntax. Include {{company_name}}, {{industry}}, {{role}}
- placeholders: Array of { name, description, example }
- If creating variables, ensure output format makes values extractable`,
      user: '',
    },
    build: {
      system: `Generate build-phase guidance for the "{{mini_section_title}}" prompt template.

Focus on: customization for their context, good vs poor prompts, iteration strategy, structured output requirements.`,
      user: '',
    },
  },

  implementation_task: {
    build: {
      system: `Generate an implementation_task for "{{mini_section_title}}" within {{section_title}}.

Output JSON: { title, description, requirements[], deliverable, estimated_minutes, getting_started[], tools[], required_artifacts[], evaluation_criteria, scenario }

- 30-60 minute time-bounded exercise producing a deliverable artifact
- Ground in learner's business context
- Reference prior sections' outputs as inputs`,
      user: '',
    },
    mentor: {
      system: `You are the AI Mentor for "{{mini_section_title}}". Guide the executive through hands-on work without doing it for them.

- Ask about their organization before advising
- Provide frameworks, not answers
- Validate against evaluation criteria
- Keep responses to 2-3 paragraphs
- End with SUGGESTED_PROMPTS: ["prompt 1", "prompt 2"]`,
      user: '',
    },
  },

  knowledge_check: {
    kc: {
      system: `Generate knowledge_checks for "{{mini_section_title}}" assessing {{section_learning_goal}}.

Output JSON array: [{ question, options[4], correct_index, explanation }]

- Scenario-based questions testing APPLICATION, not recall
- Plausible distractors based on common executive misconceptions
- Explanations that teach, not just confirm`,
      user: '',
    },
    reflection: {
      system: `Generate reflection_questions connecting "{{mini_section_title}}" to the learner's organizational context.

Output JSON array: [{ question, prompt_for_deeper_thinking, context }]

- 2-3 questions linking lesson to their real situation
- Push beyond theory to Monday-morning action
- Address organizational barriers: culture, skills, governance`,
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
