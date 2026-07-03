import { z } from 'zod';

export const StartInterviewSchema = z.object({
  week_number: z.number().int().min(1).max(12),
});

export const SubmitInterviewSchema = z.object({
  answers: z
    .array(
      z.object({
        question_id: z.string().min(1),
        answer: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(10),
});

export const RevealActivitySchema = z.object({
  completed_item: z.enum(['warm_up', 'lab', 'video_critique', 'post_quiz', 'mock_interview']),
});

export const GetWeekSchema = z.object({
  weekNum: z.string().regex(/^([1-9]|1[0-2])$/, 'Week must be 1–12'),
});

export type StartInterviewInput = z.infer<typeof StartInterviewSchema>;
export type SubmitInterviewInput = z.infer<typeof SubmitInterviewSchema>;
export type RevealActivityInput = z.infer<typeof RevealActivitySchema>;
