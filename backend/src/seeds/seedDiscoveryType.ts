/**
 * Seed: Add 'discovery' curriculum type definition for project scoping.
 *
 * Run: cd backend && npx ts-node src/seeds/seedDiscoveryType.ts
 *
 * Safe to run multiple times — uses findOrCreate.
 */
import '../models'; // init associations
import { sequelize } from '../config/database';
import CurriculumTypeDefinition from '../models/CurriculumTypeDefinition';

async function seed() {
  console.log('[Seed] Adding discovery curriculum type definition...');

  const [typeDef, created] = await CurriculumTypeDefinition.findOrCreate({
    where: { slug: 'discovery' },
    defaults: {
      slug: 'discovery',
      label: 'Discovery',
      student_label: 'Project Discovery',
      description: 'Scoping phase where learners define their enterprise AI project — business problem, AI use case, automation goals, and data sources.',
      icon: 'bi-compass',
      badge_class: 'bg-info',
      can_create_variables: true,
      can_create_artifacts: false,
      applicable_prompt_pairs: ['concept'],
      default_prompts: {
        concept: {
          system: 'You are an enterprise AI strategy consultant guiding a senior executive through project discovery. Help the learner define their enterprise AI project by identifying: (1) the core business problem or inefficiency, (2) the AI use case that addresses it, (3) specific automation goals with measurable outcomes, (4) relevant data sources and systems, and (5) success metrics. Ground all guidance in the learner\'s {{industry}} sector and {{company_name}} context. The learner\'s role is {{role}}. Output JSON: { business_problem, ai_use_case, automation_goal, data_sources[], success_metrics[], project_title }',
          user: '',
        },
      },
      settings_schema: {
        produces_project_variables: true,
        project_variable_keys: [
          'business_problem',
          'ai_use_case',
          'data_sources',
          'automation_goal',
          'success_metrics',
        ],
      },
      is_system: true,
      is_active: true,
      display_order: 0,
    } as any,
  });

  if (created) {
    console.log(`  [+] Created discovery type definition (id: ${typeDef.id})`);
  } else {
    console.log(`  [=] Discovery type definition already exists (id: ${typeDef.id})`);
  }

  console.log('[Seed] Complete.');
  process.exit(0);
}

seed().catch(err => {
  console.error('[Seed] Fatal error:', err);
  process.exit(1);
});
