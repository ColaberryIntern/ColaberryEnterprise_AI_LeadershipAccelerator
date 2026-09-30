/**
 * CAPE Phase 3 Zod contract tests — architectureSkillImpactSchema,
 * learningPlacementContractSchema, curriculumSkillMapCreateSchema,
 * architectureSkillPrerequisiteInputSchema (design doc §7 ArchitectureSkillImpact /
 * LearningPlacementContract, as validated at the route boundary, backend/CLAUDE.md
 * "every route validates input with Zod").
 */
import {
  architectureSkillImpactListSchema,
  learningPlacementContractSchema,
  curriculumSkillMapCreateSchema,
  architectureSkillPrerequisiteInputSchema,
} from '../capeSchema';

const validImpact = {
  skill_id: 'agents_mcp',
  weight: 1,
  bands: ['application'],
  credit_strength: 'high',
  evidence_required: true,
  max_credit: 15,
};

describe('architectureSkillImpactListSchema', () => {
  it('happy path: a single-impact list with weight 1.0 is valid', () => {
    expect(architectureSkillImpactListSchema.safeParse([validImpact]).success).toBe(true);
  });

  it('happy path: an empty array (explicit zero-credit declaration) is valid', () => {
    expect(architectureSkillImpactListSchema.safeParse([]).success).toBe(true);
  });

  it('failure: weights not summing to 1.0 is rejected', () => {
    const result = architectureSkillImpactListSchema.safeParse([
      { ...validImpact, weight: 0.5 },
      { ...validImpact, skill_id: 'system_design', weight: 0.3 },
    ]);
    expect(result.success).toBe(false);
  });

  it('failure: an unknown skill_id is rejected', () => {
    const result = architectureSkillImpactListSchema.safeParse([{ ...validImpact, skill_id: 'not_a_real_skill' }]);
    expect(result.success).toBe(false);
  });
});

describe('learningPlacementContractSchema', () => {
  const validContract = {
    skill_impacts: [validImpact],
    prerequisite_skills: [{ skill_id: 'llm_core', min_placement: 30 }],
    recommended_range: { min: 20, max: 70 },
    freshness_days: null,
    reviewable: true,
  };

  it('happy path: a full §7-shaped contract validates', () => {
    expect(learningPlacementContractSchema.safeParse(validContract).success).toBe(true);
  });

  it('boundary: recommended_range.min > max is rejected', () => {
    const result = learningPlacementContractSchema.safeParse({ ...validContract, recommended_range: { min: 80, max: 20 } });
    expect(result.success).toBe(false);
  });
});

describe('curriculumSkillMapCreateSchema', () => {
  const base = {
    skill_impacts: [validImpact],
    prerequisite_skills: [],
    recommended_range: { min: 20, max: 70 },
    reviewable: true,
  };

  it('happy path: a type-scoped mapping with only type_slug set validates', () => {
    const result = curriculumSkillMapCreateSchema.safeParse({ ...base, scope_type: 'type', type_slug: 'knowledge_check' });
    expect(result.success).toBe(true);
  });

  it('happy path: a week-scoped mapping with only week_number set validates', () => {
    const result = curriculumSkillMapCreateSchema.safeParse({ ...base, scope_type: 'week', week_number: 4 });
    expect(result.success).toBe(true);
  });

  it('failure: scope_type "card" without card_id is rejected', () => {
    const result = curriculumSkillMapCreateSchema.safeParse({ ...base, scope_type: 'card' });
    expect(result.success).toBe(false);
  });

  it('failure: setting both type_slug and week_number for scope_type "type" is rejected (ambiguous scope key)', () => {
    const result = curriculumSkillMapCreateSchema.safeParse({ ...base, scope_type: 'type', type_slug: 'knowledge_check', week_number: 4 });
    expect(result.success).toBe(false);
  });

  it('failure: an invalid scope_type is rejected', () => {
    const result = curriculumSkillMapCreateSchema.safeParse({ ...base, scope_type: 'not_a_scope', type_slug: 'knowledge_check' });
    expect(result.success).toBe(false);
  });
});

describe('architectureSkillPrerequisiteInputSchema', () => {
  it('happy path: a valid distinct-skill edge validates', () => {
    const result = architectureSkillPrerequisiteInputSchema.safeParse({ skill_id: 'agents_mcp', prerequisite_skill_id: 'llm_core', min_placement: 40 });
    expect(result.success).toBe(true);
  });

  it('failure: a self-referencing edge is rejected', () => {
    const result = architectureSkillPrerequisiteInputSchema.safeParse({ skill_id: 'llm_core', prerequisite_skill_id: 'llm_core', min_placement: 40 });
    expect(result.success).toBe(false);
  });
});
