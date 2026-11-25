import type { Request, Response } from 'express';
import { z } from 'zod';
import { FEEDBACK_KINDS, listFeedback, markRepliesSeen, submitFeedback } from '../services/careerPrep/feedback';
import { decodeScreenshot } from '../routes/admin/marketingBugReportRoutes';
import { logFailure } from '../routes/campusRoutes';

/**
 * Career Prep pilot feedback: send it, list your own with our answers, mark the answers read. The enrollment is always
 * the signed-in student's. The browser shrinks the screenshot; nginx caps the whole body at 1 MB, so it is capped here too.
 */
const CapturedError = z.object({ at: z.string().max(40), kind: z.string().max(40), message: z.string().max(1500), stack: z.string().max(1500).optional() });
const CapturedRequest = z.object({
  at: z.string().max(40), method: z.string().max(10), url: z.string().max(600), status: z.union([z.number(), z.string().max(40)]), ms: z.number(), count: z.number().optional(),
});
export const FeedbackBody = z.object({
  clientKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(5).max(4000),
  better: z.string().trim().max(4000).optional(),
  screenshot: z.string().max(900_000).optional(),
  context: z.object({
    pageUrl: z.string().max(1000), tab: z.string().max(20), sheet: z.string().max(20).optional(), interviewId: z.string().uuid().optional(),
    browser: z.string().max(500), viewport: z.string().max(60),
    errors: z.array(CapturedError).max(15), failedRequests: z.array(CapturedRequest).max(15),
  }),
}).strict();

export async function postFeedback(req: Request, res: Response): Promise<void> {
  const b = FeedbackBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: 'Pick a type and write at least a few words.' }); return; }
  const screenshot = decodeScreenshot(b.data.screenshot);
  if (b.data.screenshot && !screenshot) { res.status(400).json({ error: 'That screenshot could not be read. Remove it or try another.' }); return; }
  try {
    const { clientKey, kind, message, better, context } = b.data;
    const r = await submitFeedback(req.participant!.sub, { clientKey, kind, message, better: better || undefined, context, screenshot });
    res.status(r.created ? 201 : 200).json({ item: r.item });
  } catch (err) {
    logFailure('career_prep_feedback_failed', err);
    res.status(500).json({ error: 'Could not send your feedback. Try again; your words are still here.' });
  }
}

export async function getFeedback(req: Request, res: Response): Promise<void> {
  try { res.json({ items: await listFeedback(req.participant!.sub) }); } catch (err) {
    logFailure('career_prep_feedback_list_failed', err);
    res.status(500).json({ error: 'Could not load your feedback.' });
  }
}

export async function postFeedbackSeen(req: Request, res: Response): Promise<void> {
  try { await markRepliesSeen(req.participant!.sub); res.json({ ok: true }); } catch (err) {
    logFailure('career_prep_feedback_seen_failed', err);
    res.status(500).json({ error: 'Could not save that.' });
  }
}
