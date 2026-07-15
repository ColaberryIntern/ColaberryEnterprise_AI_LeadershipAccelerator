import { z } from 'zod';

const QuizAnswerSchema = z.object({
  answer: z.string().min(1).max(20),
  correct: z.boolean(),
});

/** Body for POST /lessons/:id/quiz-progress — maps question index (string) to answer state */
export const QuizProgressSchema = z.record(
  z.string().regex(/^\d+$/, 'Key must be a question index'),
  QuizAnswerSchema
);

export type QuizProgressInput = z.infer<typeof QuizProgressSchema>;

const SurveyAnswerSchema = z.union([
  z.number().int().min(1).max(5),   // Likert
  z.string().max(2000),              // open-text
]);

/** Body for POST /lessons/:id/survey — maps question key to response value */
export const SurveyResponseSchema = z.record(
  z.string().min(1).max(100),
  SurveyAnswerSchema
).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'Survey response must include at least one answer' }
);

export type SurveyResponseInput = z.infer<typeof SurveyResponseSchema>;

/** Deterministic quiz score: (correct / total) * 100, rounded to integer */
export function computeQuizScore(responses: QuizProgressInput): number {
  const entries = Object.values(responses);
  if (entries.length === 0) return 0;
  const correct = entries.filter((e) => e.correct).length;
  return Math.round((correct / entries.length) * 100);
}
