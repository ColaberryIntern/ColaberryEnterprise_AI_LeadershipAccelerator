import { Request, Response, NextFunction } from 'express';
import { getSessionChatMessages, postSessionChatMessage } from '../services/sessionChatService';
import Enrollment from '../models/Enrollment';

export async function handleGetSessionChat(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const since = req.query.since as string | undefined;
    const cohortId = req.participant!.cohort_id as string;
    const result = await getSessionChatMessages(sessionId, cohortId, since);
    if (!result) return res.status(404).json({ error: 'Session not found' });
    res.json(result);
  } catch (err) { next(err); }
}

export async function handlePostSessionChat(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });
    const enrollmentId = req.participant!.sub as string;
    const cohortId = req.participant!.cohort_id as string;

    const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['full_name'] });
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });

    const message = await postSessionChatMessage(sessionId, enrollmentId, cohortId, enrollment.full_name, content);
    if (!message) return res.status(404).json({ error: 'Session not found' });
    res.status(201).json({ message });
  } catch (err) { next(err); }
}
