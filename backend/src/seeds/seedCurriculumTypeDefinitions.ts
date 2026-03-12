import CurriculumTypeDefinition from '../models/CurriculumTypeDefinition';

const SYSTEM_TYPES = [
  {
    slug: 'executive_reality_check',
    label: 'Executive Reality Check',
    student_label: 'Concept Snapshot',
    description: 'Contextual analysis using student variables. Cannot create variables or artifacts.',
    icon: 'bi-lightbulb',
    badge_class: 'bg-primary',
    can_create_variables: false,
    can_create_artifacts: false,
    applicable_prompt_pairs: ['concept', 'mentor'],
    display_order: 1,
  },
  {
    slug: 'ai_strategy',
    label: 'AI Strategy',
    student_label: 'AI Strategy',
    description: 'Strategic AI frameworks and decision logic. Cannot create variables or artifacts.',
    icon: 'bi-diagram-3',
    badge_class: 'bg-info',
    can_create_variables: false,
    can_create_artifacts: false,
    applicable_prompt_pairs: ['concept', 'mentor'],
    display_order: 2,
  },
  {
    slug: 'prompt_template',
    label: 'Prompt Template',
    student_label: 'Prompt Template',
    description: 'Structured output + variable creation engine. The ONLY type that can create variables.',
    icon: 'bi-code-square',
    badge_class: 'bg-success',
    can_create_variables: true,
    can_create_artifacts: false,
    applicable_prompt_pairs: ['concept', 'build', 'mentor'],
    display_order: 3,
  },
  {
    slug: 'implementation_task',
    label: 'Implementation Task',
    student_label: 'Implementation Task',
    description: 'Artifact production. The ONLY type that can create artifacts.',
    icon: 'bi-clipboard-check',
    badge_class: 'bg-warning text-dark',
    can_create_variables: false,
    can_create_artifacts: true,
    applicable_prompt_pairs: ['build', 'mentor'],
    display_order: 4,
  },
  {
    slug: 'knowledge_check',
    label: 'Knowledge Check',
    student_label: 'Knowledge Check',
    description: 'Assessment mapped to skills. Influences gating and skill scores.',
    icon: 'bi-question-circle',
    badge_class: 'bg-secondary',
    can_create_variables: false,
    can_create_artifacts: false,
    applicable_prompt_pairs: ['mentor', 'kc', 'reflection'],
    display_order: 5,
  },
];

export async function seedCurriculumTypeDefinitions(): Promise<void> {
  for (const typeDef of SYSTEM_TYPES) {
    const existing = await CurriculumTypeDefinition.findOne({ where: { slug: typeDef.slug } });
    if (!existing) {
      await CurriculumTypeDefinition.create({
        ...typeDef,
        is_system: true,
        is_active: true,
        default_prompts: {},
        settings_schema: {},
      } as any);
    }
  }
  console.log('[Seed] Curriculum type definitions ensured');
}
