import { Request, Response, NextFunction } from 'express';
import { sendMentorMessage, getMentorHistory } from '../services/mentorService';

export async function handleSendMentorMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { message, lesson_id, context_type } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const result = await sendMentorMessage(
      req.participant!.sub,
      message.trim(),
      lesson_id || undefined,
      context_type || undefined
    );
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGetMentorHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const lessonId = req.query.lesson_id as string | undefined;
    const result = await getMentorHistory(req.participant!.sub, lessonId || undefined);
    res.json(result);
  } catch (err) { next(err); }
}
