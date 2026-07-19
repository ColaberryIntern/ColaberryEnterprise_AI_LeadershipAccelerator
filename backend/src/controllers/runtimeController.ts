/**
 * runtimeController — participant HTTP boundary for the Learning Runtime.
 * enrollmentId = req.participant.sub. The Runtime consumes the frozen Timeline/
 * Composer/progression; it never edits curriculum.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { openCard, completeActivity, readinessSummary, cardContext } from '../services/runtime/runtimeService';
import { recordWatchBeat } from '../services/runtime/watchProgressService';
import { coach, reflectionPrompts, MentorMode } from '../services/runtime/mentorService';
import { getNudge } from '../services/runtime/mentorNudgeService';
import { evaluatePrompt } from '../services/runtime/promptLabRuntime';
import { listNotes, createNote, deleteNote } from '../services/runtime/notebookService';
import { getSurvey, saveSurvey } from '../services/runtime/surveyResponseService';
import { getAssessment, submitAssessment, sectionResultsSummary } from '../services/runtime/assessmentService';
import { ensureFreshContent } from '../services/timeline/cardContentService';
import { uploadCertificate, getCertificateFile } from '../services/runtime/certificateService';
import { uploadFieldGuide, getFieldGuideStatus } from '../services/runtime/fieldGuideService';
import fs from 'fs/promises';

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

// Proactive nudge: on card open, if the student looks stuck, the mentor offers
// help unprompted. Read-only + fail-safe; returns { struggling, reasons, message }.
export async function handleNudge(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getNudge(eid(req), String(req.params.cardId))); } catch (e) { fail(res, e, next); }
}

export async function handleReflection(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = await cardContext(String(req.params.cardId));
    // The reflection sits after the section's Evaluation + Survey — feed their
    // results in so the questions help the student make sense of them.
    const results = await sectionResultsSummary(eid(req), (ctx as any).program_id, (ctx as any).week);
    res.json(await reflectionPrompts(ctx, results));
  } catch (e) { fail(res, e, next); }
}
// The first student to open a card whose content is missing or >30 days old
// regenerates it once (class-wide); the fresh copy then lasts 30 days.
export async function handleEnsureContent(req: Request, res: Response, next: NextFunction) {
  try { res.json(await ensureFreshContent(String(req.params.cardId))); } catch (e) { fail(res, e, next); }
}

// Anthropic Skills Course: verify the uploaded certificate is real (AI check).
// Valid → the client completes the card; invalid → a clear reason to retry.
export async function handleUploadCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const file = (req as any).file;
    if (!file) { res.status(400).json({ error: 'No certificate file uploaded.' }); return; }
    res.json(await uploadCertificate(eid(req), String(req.params.cardId), file));
  } catch (e) { fail(res, e, next); }
}

// Serve THIS student's co-branded (Colaberry-logo) certificate image for download/share.
export async function handleGetCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const cert = await getCertificateFile(eid(req), String(req.params.cardId));
    if (!cert) { res.status(404).json({ error: 'No certificate on file yet.' }); return; }
    const buf = await fs.readFile(cert.path);
    res.setHeader('Content-Type', cert.mime);
    res.setHeader('Content-Disposition', `inline; filename="${cert.download}"`);
    res.send(buf);
  } catch (e) { fail(res, e, next); }
}

// Deep Dive Field Guide: the student uploads the .html they built in Claude Code.
// Stores it as a portfolio artifact + awards a one-time 100-point bonus. GET = status.
export async function handleUploadFieldGuide(req: Request, res: Response, next: NextFunction) {
  try {
    const file = (req as any).file;
    if (!file) { res.status(400).json({ error: 'No Field Guide file uploaded.' }); return; }
    res.json(await uploadFieldGuide(eid(req), String(req.params.cardId), file));
  } catch (e) { fail(res, e, next); }
}
export async function handleGetFieldGuide(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getFieldGuideStatus(eid(req), String(req.params.cardId))); } catch (e) { fail(res, e, next); }
}

const labSchema = z.object({ prompt: z.string().min(1), output: z.string().optional() });
export async function handlePromptLab(req: Request, res: Response, next: NextFunction) {
  try {
    const b = labSchema.parse(req.body || {});
    res.json(await evaluatePrompt(await cardContext(String(req.params.cardId)), b.prompt, b.output));
  } catch (e) { fail(res, e, next); }
}

const completeSchema = z.object({ work: z.string().optional(), reflection: z.string().optional() });
const watchBeatSchema = z.object({
  delta_s: z.number().min(0).max(600),
  position_s: z.number().min(0).nullable().optional(),
  duration_s: z.number().min(0).nullable().optional(),
  provider: z.string().max(32).nullable().optional(),
});

/** POST /api/portal/runtime/cards/:cardId/watch — throttled watch heartbeat.
 *  Returns { watched_pct, required_pct, met } so the UI can sync the gate. */
export async function handleWatchBeat(req: Request, res: Response, next: NextFunction) {
  try {
    const beat = watchBeatSchema.parse(req.body);
    res.json(await recordWatchBeat(eid(req), String(req.params.cardId), beat));
  } catch (err) { fail(res, err, next); }
}

export async function handleComplete(req: Request, res: Response, next: NextFunction) {
  try { res.json(await completeActivity(eid(req), String(req.params.cardId), completeSchema.parse(req.body || {}))); } catch (e) { fail(res, e, next); }
}

export async function handleReadiness(req: Request, res: Response, next: NextFunction) {
  try { res.json(await readinessSummary(eid(req))); } catch (e) { fail(res, e, next); }
}

// weekly feedback survey — capture + store the student's answers
export async function handleGetSurvey(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getSurvey(eid(req), String(req.params.cardId))); } catch (e) { fail(res, e, next); }
}
export async function handleSaveSurvey(req: Request, res: Response, next: NextFunction) {
  try { res.json(await saveSurvey(eid(req), String(req.params.cardId), req.body || {})); } catch (e) { fail(res, e, next); }
}

// Knowledge Check (quiz) + Evaluation — load questions (no answers leaked) / submit + score
const submitAssessmentSchema = z.object({
  responses: z.array(z.object({
    index: z.number().int(),
    selected_index: z.number().int().nullable(),
    time_ms: z.number().nullable().optional(),
  })).default([]),
  duration_ms: z.number().nullable().optional(),
  started_at: z.string().nullable().optional(),
});
export async function handleGetAssessment(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getAssessment(eid(req), String(req.params.cardId))); } catch (e) { fail(res, e, next); }
}
export async function handleSubmitAssessment(req: Request, res: Response, next: NextFunction) {
  try { res.json(await submitAssessment(eid(req), String(req.params.cardId), submitAssessmentSchema.parse(req.body || {}))); } catch (e) { fail(res, e, next); }
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
