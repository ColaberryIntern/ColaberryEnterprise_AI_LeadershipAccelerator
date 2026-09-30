import { buildBlueprintPromptText, BlueprintContextFields } from '../blueprintContext';

const base: BlueprintContextFields = {
  week: 1,
  title: 'Claude Code Foundations',
  purpose: null,
  difficulty: null,
  estimated_hours: null,
  competencies: [],
  learning_objectives: [],
  architect_domains: [],
  success_criteria: [],
  student_outcomes: [],
};

describe('buildBlueprintPromptText', () => {
  it('always anchors the content to the week + course, even with no optional fields', () => {
    const text = buildBlueprintPromptText(base);
    expect(text).toContain('Week 1 of the AI Systems Architect Accelerator: "Claude Code Foundations"');
    // The closing "be specific" instruction must always be present.
    expect(text).toContain("specific to this week's topic");
  });

  it('includes each optional field only when present (no empty lines)', () => {
    const full = buildBlueprintPromptText({
      ...base,
      purpose: 'Ship a working AI tool in a weekend',
      difficulty: 'core',
      estimated_hours: 6,
      competencies: ['prompt_engineering', 'claude_code'],
      learning_objectives: ['Scaffold a project', 'Ship one tool'],
      architect_domains: ['ai_systems_architecture'],
      success_criteria: ['A running tool'],
      student_outcomes: ['Confidence with Claude Code'],
    });
    expect(full).toContain('Week focus: Ship a working AI tool in a weekend');
    expect(full).toContain('Topics & competencies covered this week: prompt_engineering, claude_code.');
    expect(full).toContain('Learning objectives: Scaffold a project; Ship one tool.');
    expect(full).toContain('Architect domains: ai_systems_architecture.');
    expect(full).toContain('Student outcomes: Confidence with Claude Code.');
    expect(full).toContain('Success criteria: A running tool.');
    expect(full).toContain('Level: core.');
    expect(full).toContain('Estimated workload: ~6 hours.');
  });

  it('omits topic/objective lines entirely when arrays are empty', () => {
    const text = buildBlueprintPromptText(base);
    expect(text).not.toContain('Topics & competencies');
    expect(text).not.toContain('Learning objectives');
    expect(text).not.toContain('Level:');
  });

  it('is deterministic — same input yields byte-identical output (idempotent)', () => {
    const a = buildBlueprintPromptText({ ...base, purpose: 'x', competencies: ['a', 'b'] });
    const b = buildBlueprintPromptText({ ...base, purpose: 'x', competencies: ['a', 'b'] });
    expect(a).toBe(b);
  });
});
