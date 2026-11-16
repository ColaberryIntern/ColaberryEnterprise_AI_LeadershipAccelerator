import type { Request, Response } from 'express';
import { z } from 'zod';
import { listReminders, scheduleReminder } from '../services/careerPrep/reminders';
import { TooLateError } from '../services/careerPrep/reminderTime';
import { NotFoundError } from '../services/careerPrep/sessions';
import { logFailure } from '../routes/campusRoutes';

/**
 * Career Prep v27 (CP4.5): set a reminder ("tonight" at 6:00 PM Central, or "tomorrow" at the same time)
 * for the caller's own plan or session, and list the caller's reminders for the room's in-app line.
 * Asking twice returns the same reminder (200), a new one is 201; another student's plan or session is 404.
 */
const Body = z.object({
  kind: z.enum(['tonight', 'tomorrow']),
  sessionId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
}).strict().refine((b) => Boolean(b.sessionId) !== Boolean(b.planId), { message: 'one of sessionId or planId' });

export async function postReminder(req: Request, res: Response): Promise<void> {
  const b = Body.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: 'That reminder is not valid.' }); return; }
  try {
    const { kind, ...ref } = b.data;
    const r = await scheduleReminder(req.participant!.sub, kind, ref);
    res.status(r.created ? 201 : 200).json({ reminder: r.reminder });
  } catch (err) {
    if (err instanceof NotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
    if (err instanceof TooLateError) { res.status(409).json({ error: 'It is already past 6:00 PM. Pick "Same time tomorrow" instead.' }); return; }
    logFailure('career_prep_reminder_schedule_failed', err);
    res.status(500).json({ error: 'Could not set the reminder. Try again.' });
  }
}

export async function getReminders(req: Request, res: Response): Promise<void> {
  try { res.json({ reminders: await listReminders(req.participant!.sub) }); } catch (err) {
    logFailure('career_prep_reminder_list_failed', err);
    res.status(500).json({ error: 'Could not load your reminders.' });
  }
}
