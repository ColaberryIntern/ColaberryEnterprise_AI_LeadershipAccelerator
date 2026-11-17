import type { Request, Response } from 'express';
import { z } from 'zod';
import { PREP_SKILLS } from '../db/ensureCareerPrepSchema';
import { NotFoundError } from '../services/careerPrep/sessions';
import { skillSources } from '../services/careerPrep/skillSources';
import {
  AnswerRejectedError, deleteAnswer, listSavedAnswers, NotSaveableError, RecordingGoneError, resolveAnswerFile, saveAnswer, setShowPublic,
} from '../services/careerPrep/savedAnswers';
import { logFailure } from '../routes/campusRoutes';

/**
 * Career Prep R1.1: the evidence behind a skill's number, and the Try answers a student chose to keep.
 *
 *   GET    /api/portal/career-prep/skills/:key/sources?source=video     what each result was, newest first
 *   GET    /api/portal/career-prep/answers                              this student's saved Try answers
 *   POST   /api/portal/career-prep/attempts/:attemptId/save             keep a scored answer (within its hour)
 *   DELETE /api/portal/career-prep/attempts/:attemptId/save             delete the kept copy (idempotent)
 *   PUT    /api/portal/career-prep/attempts/:attemptId/public           { on } show a saved answer on the public profile (R1.2)
 *   GET    /api/portal/career-prep/answer-video/:assetId/:kind?t=       playback, signed for the owner only
 *
 * The enrollment is always the caller's, from the token. An attempt that is not theirs is a 404.
 */
const SKILL = z.enum(PREP_SKILLS.map((s) => s.key) as [string, ...string[]]);
const SourcesParams = z.object({ key: SKILL }).strict();
const SourcesQuery = z.object({ source: z.enum(['video', 'phone_mock', 'real_interview', 'training', 'project']) }).strict();
const AttemptParams = z.object({ attemptId: z.string().uuid() }).strict();
const PublicBody = z.object({ on: z.boolean() }).strict();
const SaveBody = z.object({ question: z.string().trim().min(1).max(600).optional() }).strict();

export async function getSkillSources(req: Request, res: Response): Promise<void> {
  const p = SourcesParams.safeParse(req.params);
  const q = SourcesQuery.safeParse(req.query);
  if (!p.success || !q.success) { res.status(400).json({ error: 'Pick one of your skills and a source.' }); return; }
  try { res.json({ items: await skillSources(req.participant!.sub, p.data.key, q.data.source) }); } catch (err) {
    logFailure('career_prep_sources_failed', err);
    res.status(500).json({ error: 'Could not load where this score comes from.' });
  }
}

export async function getSavedAnswers(req: Request, res: Response): Promise<void> {
  try { res.json({ answers: await listSavedAnswers(req.participant!.sub) }); } catch (err) {
    logFailure('career_prep_saved_list_failed', err);
    res.status(500).json({ error: 'Could not load your saved answers.' });
  }
}

export async function postSaveAnswer(req: Request, res: Response): Promise<void> {
  const p = AttemptParams.safeParse(req.params);
  const b = SaveBody.safeParse(req.body ?? {});
  if (!p.success || !b.success) { res.status(400).json({ error: 'Not a valid answer.' }); return; }
  try {
    res.status(201).json({ answer: await saveAnswer(req.participant!.sub, p.data.attemptId, b.data.question ?? null) });
  } catch (err) {
    if (err instanceof NotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
    if (err instanceof NotSaveableError) { res.status(409).json({ error: 'Only a scored answer can be saved.' }); return; }
    if (err instanceof RecordingGoneError) { res.status(410).json({ error: 'This recording is gone: unsaved answers are deleted after an hour.' }); return; }
    if (err instanceof AnswerRejectedError) { res.status(422).json({ error: 'This recording could not be saved. Record the answer again to keep it.' }); return; }
    logFailure('career_prep_save_answer_failed', err);
    res.status(500).json({ error: 'Could not save the answer. Try again.' });
  }
}

export async function deleteSavedAnswer(req: Request, res: Response): Promise<void> {
  const p = AttemptParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not a valid answer.' }); return; }
  try { await deleteAnswer(req.participant!.sub, p.data.attemptId); res.json({ ok: true }); } catch (err) {
    if (err instanceof NotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
    logFailure('career_prep_delete_answer_failed', err);
    res.status(500).json({ error: 'Could not delete the answer. Try again.' });
  }
}

export async function putShowPublic(req: Request, res: Response): Promise<void> {
  const p = AttemptParams.safeParse(req.params);
  const b = PublicBody.safeParse(req.body ?? {});
  if (!p.success || !b.success) { res.status(400).json({ error: 'Not a valid answer.' }); return; }
  try { res.json({ answer: await setShowPublic(req.participant!.sub, p.data.attemptId, b.data.on) }); } catch (err) {
    if (err instanceof NotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
    logFailure('career_prep_show_public_failed', err);
    res.status(500).json({ error: 'Could not change this answer. Try again.' });
  }
}

/** Extensionless on purpose (nginx's .mp4/.jpg locations would win over /api/). Range requests come from sendFile. */
export async function serveAnswerVideo(req: Request, res: Response): Promise<void> {
  try {
    const file = await resolveAnswerFile(String(req.params.assetId), String(req.params.kind), req.query.t);
    if (!file) { res.status(404).set('Cache-Control', 'no-store').json({ error: 'Not found' }); return; }
    res.set({ 'Content-Type': file.type, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.sendFile(file.path, { acceptRanges: true, dotfiles: 'deny', headers: { 'Content-Type': file.type } }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
    });
  } catch (err) {
    logFailure('career_prep_answer_video_failed', err);
    if (!res.headersSent) res.status(500).json({ error: 'Could not play this answer.' });
  }
}
