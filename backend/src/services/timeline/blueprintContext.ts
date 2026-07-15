import CurriculumBlueprint from '../../models/CurriculumBlueprint';

/**
 * The week's Blueprint as reusable AI context. Every curriculum generator
 * (video, course, content, component preview, …) prepends this so generated
 * content is specific to the week's topic — a "coding" video for Week 1 knows
 * it's Claude Code Foundations. Looked up by (course, week); returns null when
 * there's no blueprint (e.g. Week 0 free preview, or a course with no composed
 * week yet).
 */
export interface BlueprintContext {
  week: number;
  title: string;
  purpose: string | null;
  difficulty: string | null;
  estimated_hours: number | null;
  competencies: string[];
  learning_objectives: string[];
  architect_domains: string[];
  success_criteria: string[];
  student_outcomes: string[];
  /** The formatted block injected into LLM prompts. */
  prompt_text: string;
}

/** The blueprint fields the formatter reads — the read-only "defaults" surfaced to authors. */
export interface BlueprintContextFields {
  week: number;
  title: string;
  purpose: string | null;
  difficulty: string | null;
  estimated_hours: number | null;
  competencies: string[];
  learning_objectives: string[];
  architect_domains: string[];
  success_criteria: string[];
  student_outcomes: string[];
}

const arr = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

/**
 * Pure formatter: turn a week's Blueprint fields into the prompt block that gets
 * prepended to every generator's system message. Kept side-effect-free (no DB)
 * so it's unit-testable and deterministic. This is the single source of truth
 * for "what topics/coverage the AI is told about" — the same text the author
 * sees in the read-only "auto-included" block.
 */
export function buildBlueprintPromptText(bp: BlueprintContextFields): string {
  const lines: string[] = [
    `WEEK CONTEXT — this content is part of Week ${bp.week} of the AI Systems Architect Accelerator: "${bp.title}".`,
  ];
  if (bp.purpose) lines.push(`Week focus: ${bp.purpose}`);
  if (bp.competencies.length) lines.push(`Topics & competencies covered this week: ${bp.competencies.join(', ')}.`);
  if (bp.learning_objectives.length) lines.push(`Learning objectives: ${bp.learning_objectives.join('; ')}.`);
  if (bp.architect_domains.length) lines.push(`Architect domains: ${bp.architect_domains.join(', ')}.`);
  if (bp.student_outcomes.length) lines.push(`Student outcomes: ${bp.student_outcomes.join('; ')}.`);
  if (bp.success_criteria.length) lines.push(`Success criteria: ${bp.success_criteria.join('; ')}.`);
  if (bp.difficulty) lines.push(`Level: ${bp.difficulty}.`);
  if (bp.estimated_hours != null) lines.push(`Estimated workload: ~${bp.estimated_hours} hours.`);
  lines.push('Make everything you generate specific to this week\'s topic and level — do not produce generic content.');
  return lines.join('\n');
}

export async function getBlueprintContext(
  programId?: string | null,
  week?: number | null,
): Promise<BlueprintContext | null> {
  if (!programId || week == null) return null;
  const bp = await CurriculumBlueprint.findOne({
    where: { program_id: programId, week },
    order: [['updated_at', 'DESC']],
  });
  if (!bp) return null;

  const fields: BlueprintContextFields = {
    week: bp.week as number,
    title: bp.title,
    purpose: bp.purpose,
    difficulty: bp.difficulty,
    estimated_hours: bp.estimated_hours,
    competencies: arr(bp.competencies),
    learning_objectives: arr(bp.learning_objectives),
    architect_domains: arr(bp.architect_domains),
    success_criteria: arr(bp.success_criteria),
    student_outcomes: arr(bp.student_outcomes),
  };

  return { ...fields, prompt_text: buildBlueprintPromptText(fields) };
}
