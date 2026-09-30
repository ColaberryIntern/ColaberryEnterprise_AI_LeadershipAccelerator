import { z } from 'zod';

/**
 * The shape the model must return for an applicant assessment. Validated with
 * safeParse so a malformed generation falls back to the deterministic assessment
 * rather than reaching a reviewer as garbage.
 *
 * The model RECOMMENDS; it never decides. `recommendation` is advice a human reads
 * and then chooses their own decision — mirroring the whole feature's contract.
 */
export const assessmentRecommendationValues = [
  'approve',
  'approve_with_conditions',
  'concerns',
  'follow_up',
  'not_ready',
] as const;

export const internshipAssessmentOutputSchema = z.object({
  /** 2-4 sentences a reviewer reads first — who this applicant is and how they came across. */
  summary: z.string().min(1).max(1200),
  recommendation: z.enum(assessmentRecommendationValues),
  /** Why this recommendation, in plain language, grounded in what they said. */
  rationale: z.string().min(1).max(1200),
  /** For approve_with_conditions: what they must do/confirm. Empty otherwise. */
  conditions: z.array(z.string().max(300)).max(8).default([]),
  /** For follow_up / concerns: the exact questions a reviewer should get answered. */
  follow_up_questions: z.array(z.string().max(300)).max(8).default([]),
});

export type InternshipAssessmentOutput = z.infer<typeof internshipAssessmentOutputSchema>;
