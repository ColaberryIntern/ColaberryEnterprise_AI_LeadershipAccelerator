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
      system: `Output JSON: { title, definition, why_it_matters, visual_metaphor }`,
      user: '',
    },
  },

  ai_strategy: {
    concept: {
      system: `Output JSON: { description, when_to_use_ai[], human_responsibilities[], suggested_prompt }`,
      user: '',
    },
  },

  prompt_template: {
    concept: {
      system: `Output JSON: { template, placeholders[], expected_output_shape, example_filled, iteration_tips }`,
      user: '',
    },
    build: {
      system: `Guide: customization, good vs poor prompts, iteration strategy.`,
      user: '',
    },
  },

  implementation_task: {
    build: {
      system: `Output JSON: { title, description, requirements[], deliverable, estimated_minutes, getting_started[], tools[], required_artifacts[], evaluation_criteria, scenario }`,
      user: '',
    },
    mentor: {
      system: `Guide the executive. Frameworks not answers. 2-3 paragraphs. End with SUGGESTED_PROMPTS: []`,
      user: '',
    },
  },

  knowledge_check: {
    kc: {
      system: `Output JSON array: [{ question, options[4], correct_index, explanation }]`,
      user: '',
    },
    reflection: {
      system: `Output JSON array: [{ question, prompt_for_deeper_thinking, context }]`,
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
