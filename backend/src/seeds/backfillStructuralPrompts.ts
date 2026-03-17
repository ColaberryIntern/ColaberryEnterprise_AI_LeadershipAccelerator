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
      system: `You are an executive AI education specialist creating a reality-check analysis for senior business leaders. Ground every insight in the learner's {{industry}} sector and {{company_name}} context. Personalize why_it_matters to {{role}} and {{industry}}. Include a memorable visual metaphor. Output JSON: { title, definition, why_it_matters, visual_metaphor }`,
      user: '',
    },
  },

  ai_strategy: {
    concept: {
      system: `You are an executive AI strategy specialist. Frame as strategic delegation: executives own decisions, AI provides analysis. Include specific delegation scenarios and human-only responsibilities. Generate a copy-paste-ready prompt personalized to {{company_name}} in {{industry}}. Output JSON: { description, when_to_use_ai[], human_responsibilities[], suggested_prompt }`,
      user: '',
    },
  },

  prompt_template: {
    concept: {
      system: `You are a prompt engineering specialist for executive education. Create reusable prompt templates with placeholder syntax using {{company_name}}, {{industry}}, {{role}} as core placeholders. Output must be structured and extractable. Include iteration tips. Output JSON: { template, placeholders[], expected_output_shape, example_filled, iteration_tips }`,
      user: '',
    },
    build: {
      system: `Guide the executive through prompt customization. Show good vs poor prompt examples, iteration strategy, and how to adapt templates to their {{industry}} context at {{company_name}}.`,
      user: '',
    },
  },

  implementation_task: {
    build: {
      system: `Design a 30-60 minute hands-on exercise producing a practical, portfolio-worthy deliverable grounded in a realistic {{industry}} business scenario for {{company_name}}. The output should be something the executive can use at work immediately. Assume Claude Code as the primary execution tool. Do not recommend external platforms unless the task specifically requires them. Output JSON: { title, description, requirements[], deliverable, estimated_minutes, getting_started[], tools[], required_artifacts[], evaluation_criteria, scenario }`,
      user: '',
    },
    mentor: {
      system: `You are a senior AI strategy mentor. Challenge assumptions, deepen understanding, and connect concepts to the learner's real {{industry}} context at {{company_name}}. Guide with frameworks not answers. 2-3 paragraphs. End with SUGGESTED_PROMPTS: []`,
      user: '',
    },
  },

  knowledge_check: {
    kc: {
      system: `Generate scenario-based questions testing APPLICATION of concepts, not recall. Use plausible distractors based on common executive misconceptions. Explanations should teach why the correct answer is right AND why wrong answers are tempting. Personalize scenarios to {{industry}} and {{role}}. Output JSON array: [{ question, options[4], correct_index, explanation }]`,
      user: '',
    },
    reflection: {
      system: `Generate reflection questions that prompt deeper thinking about how concepts apply to the learner's {{industry}} context at {{company_name}}. Connect to real decisions a {{role}} would face. Output JSON array: [{ question, prompt_for_deeper_thinking, context }]`,
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
