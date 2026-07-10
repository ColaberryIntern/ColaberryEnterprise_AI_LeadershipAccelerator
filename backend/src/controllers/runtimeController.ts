/**
 * runtimeController — participant HTTP boundary for the Learning Runtime.
 * enrollmentId = req.participant.sub. The Runtime consumes the frozen Timeline/
 * Composer/progression; it never edits curriculum.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { openCard, completeActivity, readinessSummary, cardContext } from '../services/runtime/runtimeService';
import { coach, reflectionPrompts, videoAugment, MentorMode } from '../services/runtime/mentorService';
import { evaluatePrompt } from '../services/runtime/promptLabRuntime';
import { listNotes, createNote, deleteNote } from '../services/runtime/notebookService';

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}
const eid = (req: Request) => req.participant!.sub;

export async function handleOpenCard(req: Request, res: Response, next: NextFunction) {
  try { res.json(await openCard(eid(req), String(req.params.cardId))); } catch (e) { fail(res, e, next); }
}

const mentorSchema = z.object({ mode: z.enum(['ask', 'hint', 'explain', 'review']).default('ask'), message: z.string().default(''), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).optional() });
export async function handleMentor(req: Request, res: Response, next: NextFunction) {
  try {
    const b = mentorSchema.parse(req.body || {});
    const ctx = await cardContext(String(req.params.cardId));
    res.json(await coach(eid(req), ctx, b.mode as MentorMode, b.message, b.history || []));
  } catch (e) { fail(res, e, next); }
}

export async function handleReflection(req: Request, res: Response, next: NextFunction) {
  try { res.json(await reflectionPrompts(await cardContext(String(req.params.cardId)))); } catch (e) { fail(res, e, next); }
}
export async function handleVideoAugment(req: Request, res: Response, next: NextFunction) {
  try {
    const force = req.query.force === 'true' || req.body?.force === true;
    res.json(await videoAugment(await cardContext(String(req.params.cardId)), force));
  } catch (e) { fail(res, e, next); }
}

const labSchema = z.object({ prompt: z.string().min(1), output: z.string().optional() });
export async function handlePromptLab(req: Request, res: Response, next: NextFunction) {
  try {
    const b = labSchema.parse(req.body || {});
    res.json(await evaluatePrompt(await cardContext(String(req.params.cardId)), b.prompt, b.output));
  } catch (e) { fail(res, e, next); }
}

const completeSchema = z.object({ work: z.string().optional(), reflection: z.string().optional() });
export async function handleComplete(req: Request, res: Response, next: NextFunction) {
  try { res.json(await completeActivity(eid(req), String(req.params.cardId), completeSchema.parse(req.body || {}))); } catch (e) { fail(res, e, next); }
}

export async function handleReadiness(req: Request, res: Response, next: NextFunction) {
  try { res.json(await readinessSummary(eid(req))); } catch (e) { fail(res, e, next); }
}

// notebook
export async function handleListNotes(req: Request, res: Response, next: NextFunction) {
  try { res.json({ notes: await listNotes(eid(req), { kind: req.query.kind as string, q: req.query.q as string }) }); } catch (e) { fail(res, e, next); }
}
export async function handleCreateNote(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await createNote(eid(req), req.body || {})); } catch (e) { fail(res, e, next); }
}
export async function handleDeleteNote(req: Request, res: Response, next: NextFunction) {
  try { res.json(await deleteNote(eid(req), String(req.params.id))); } catch (e) { fail(res, e, next); }
}
