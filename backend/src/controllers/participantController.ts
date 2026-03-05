import { Request, Response, NextFunction } from 'express';
import {
  requestMagicLink, verifyMagicLink, getParticipantProfile,
  getParticipantDashboard, getParticipantSessions, getParticipantSessionDetail,
  getParticipantSubmissions, createParticipantSubmission, uploadParticipantSubmission,
  getParticipantProgress,
} from '../services/participantService';

export async function handleRequestMagicLink(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const result = await requestMagicLink(email);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleVerifyMagicLink(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.query.token as string;
    if (!token) return res.status(400).json({ error: 'Token is required' });
    const result = await verifyMagicLink(token);
    if (!result) return res.status(401).json({ error: 'Invalid or expired link. Please request a new one.' });
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGetProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getParticipantProfile(req.participant!.sub);
    if (!profile) return res.status(404).json({ error: 'Enrollment not found' });
    res.json({ profile });
  } catch (err) { next(err); }
}

export async function handleGetDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const dashboard = await getParticipantDashboard(req.participant!.sub);
    if (!dashboard) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(dashboard);
  } catch (err) { next(err); }
}

export async function handleGetSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await getParticipantSessions(req.participant!.sub, req.participant!.cohort_id);
    res.json({ sessions });
  } catch (err) { next(err); }
}

export async function handleGetSessionDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const detail = await getParticipantSessionDetail(
      req.participant!.sub, req.params.id as string, req.participant!.cohort_id
    );
    if (!detail) return res.status(404).json({ error: 'Session not found' });
    res.json(detail);
  } catch (err) { next(err); }
}

export async function handleGetSubmissions(req: Request, res: Response, next: NextFunction) {
  try {
    const submissions = await getParticipantSubmissions(req.participant!.sub);
    res.json({ submissions });
  } catch (err) { next(err); }
}

export async function handleCreateSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const submission = await createParticipantSubmission(req.participant!.sub, req.body);
    res.status(201).json({ submission });
  } catch (err) { next(err); }
}

export async function handleUploadSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    const submission = await uploadParticipantSubmission(
      req.participant!.sub, req.params.id as string, file
    );
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    res.json({ submission });
  } catch (err) { next(err); }
}

export async function handleGetProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const progress = await getParticipantProgress(req.participant!.sub);
    if (!progress) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(progress);
  } catch (err) { next(err); }
}
