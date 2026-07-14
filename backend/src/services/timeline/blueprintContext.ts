import CurriculumBlueprint from '../../models/CurriculumBlueprint';

/**
 * The week's Blueprint as reusable AI context. Every curriculum generator
 * (video, course, content, …) prepends this so generated content is specific to
 * the week's topic — a "coding" video for Week 1 knows it's Claude Code
 * Foundations. Looked up by (course, week); returns null when there's no
 * blueprint (e.g. Week 0 free preview, or a course with no composed week yet).
 */
export interface BlueprintContext {
  week: number;
  title: string;
  purpose: string | null;
  difficulty: string | null;
  competencies: string[];
  learning_objectives: string[];
  architect_domains: string[];
  /** The formatted block injected into LLM prompts. */
  prompt_text: string;
}

const arr = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

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

  const competencies = arr(bp.competencies);
  const learning_objectives = arr(bp.learning_objectives);
  const architect_domains = arr(bp.architect_domains);

  const lines: string[] = [
    `WEEK CONTEXT — this content is part of Week ${bp.week} of the AI Systems Architect Accelerator: "${bp.title}".`,
  ];
  if (bp.purpose) lines.push(`Week focus: ${bp.purpose}`);
  if (competencies.length) lines.push(`Competencies this week: ${competencies.join(', ')}.`);
  if (learning_objectives.length) lines.push(`Learning objectives: ${learning_objectives.join('; ')}.`);
  if (architect_domains.length) lines.push(`Architect domains: ${architect_domains.join(', ')}.`);
  if (bp.difficulty) lines.push(`Level: ${bp.difficulty}.`);
  lines.push('Make everything you generate specific to this week\'s topic and level — do not produce generic content.');

  return {
    week: bp.week as number,
    title: bp.title,
    purpose: bp.purpose,
    difficulty: bp.difficulty,
    competencies,
    learning_objectives,
    architect_domains,
    prompt_text: lines.join('\n'),
  };
}
