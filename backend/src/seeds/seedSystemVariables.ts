/**
 * Seed system variables from onboarding/login fields.
 * These are always available to all mini-sections.
 * Idempotent — upserts by variable_key.
 */
import VariableDefinition from '../models/VariableDefinition';

const SYSTEM_VARIABLES = [
  { variable_key: 'industry', display_name: 'Industry', description: 'Learner industry sector from profile' },
  { variable_key: 'company_name', display_name: 'Company Name', description: 'Learner company name from profile' },
  { variable_key: 'company_size', display_name: 'Company Size', description: 'Learner company size from profile' },
  { variable_key: 'role', display_name: 'Role', description: 'Learner role/title from profile' },
  { variable_key: 'goal', display_name: 'Goal', description: 'Learner primary goal from profile' },
  { variable_key: 'ai_maturity_level', display_name: 'AI Maturity Level', description: 'Organization AI maturity (1-5) from profile', data_type: 'number' as const },
  { variable_key: 'identified_use_case', display_name: 'Identified Use Case', description: 'Primary AI use case from strategy call' },
  { variable_key: 'full_name', display_name: 'Full Name', description: 'Learner full name from enrollment' },
  { variable_key: 'email', display_name: 'Email', description: 'Learner email from enrollment' },
  { variable_key: 'company', display_name: 'Company', description: 'Company name from enrollment record' },
  { variable_key: 'title', display_name: 'Job Title', description: 'Job title from enrollment record' },
];

export async function seedSystemVariables() {
  let created = 0;
  let existing = 0;

  for (const sv of SYSTEM_VARIABLES) {
    const [, wasCreated] = await VariableDefinition.findOrCreate({
      where: { variable_key: sv.variable_key },
      defaults: {
        display_name: sv.display_name,
        description: sv.description,
        data_type: sv.data_type || 'text',
        scope: 'program',
        source_type: 'system',
        required_for_section_build: false,
        optional: true,
        is_active: true,
        sort_order: SYSTEM_VARIABLES.indexOf(sv),
      } as any,
    });

    if (wasCreated) {
      created++;
    } else {
      // Update source_type to 'system' if not already set
      await VariableDefinition.update(
        { source_type: 'system' },
        { where: { variable_key: sv.variable_key, source_type: { [require('sequelize').Op.ne]: 'system' } } }
      );
      existing++;
    }
  }

  console.log(`System variables seed: ${created} created, ${existing} already existed`);
  return { created, existing };
}

export default seedSystemVariables;
