import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import {
  generateClarifyingQuestions,
  generateRequirementsDoc,
  QuestionAnswer,
} from '../services/advisorBrainService';

const router = Router();

// ─── Input schemas ────────────────────────────────────────────────────────────

const QuestionsBodySchema = z.object({
  idea: z.string().min(1, 'idea is required'),
});

const RequirementsBodySchema = z.object({
  idea: z.string().min(1, 'idea is required'),
  answers: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    )
    .default([]),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/portal/advisor/questions
 * Body: { idea: string }
 * Returns: ClarifyingQuestionsResult
 *
 * Step 1 of the advisor brain pipeline. Takes a raw project idea
 * and returns ~10 targeted clarifying questions.
 */
router.post('/api/portal/advisor/questions', requireParticipant, async (req: Request, res: Response) => {
  const parsed = QuestionsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const enrollmentId = req.participant!.sub;
  const result = await generateClarifyingQuestions(parsed.data.idea, enrollmentId);

  if (result.error) {
    const status = result.error.includes('AuthError') || result.error.includes('ANTHROPIC_API_KEY') ? 503 : 502;
    return res.status(status).json(result);
  }

  return res.json(result);
});

/**
 * POST /api/portal/advisor/requirements
 * Body: { idea: string, answers: { question: string, answer: string }[] }
 * Returns: RequirementsDocResult
 *
 * Step 2 of the advisor brain pipeline. Takes the idea + collected answers
 * and returns a structured requirements document.
 */
router.post('/api/portal/advisor/requirements', requireParticipant, async (req: Request, res: Response) => {
  const parsed = RequirementsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const enrollmentId = req.participant!.sub;
  const result = await generateRequirementsDoc(
    parsed.data.idea,
    parsed.data.answers as QuestionAnswer[],
    enrollmentId,
  );

  if (result.error) {
    const status = result.error.includes('AuthError') || result.error.includes('ANTHROPIC_API_KEY') ? 503 : 502;
    return res.status(status).json(result);
  }

  return res.json(result);
});

export default router;
