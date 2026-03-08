import { Request, Response, NextFunction } from 'express';
import { executePromptLab } from '../services/promptLabService';

export async function handleExecutePromptLab(req: Request, res: Response, next: NextFunction) {
  try {
    const lessonId = req.params.lessonId as string;
    const enrollmentId = req.participant!.sub as string;
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ error: 'Prompt must be under 2000 characters' });
    }

    const result = await executePromptLab(enrollmentId, lessonId, prompt.trim());
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not started') || message.includes('not found')) {
      return res.status(404).json({ error: message });
    }
    if (message.includes('only available') || message.includes('Maximum')) {
      return res.status(400).json({ error: message });
    }
    next(err);
  }
}
