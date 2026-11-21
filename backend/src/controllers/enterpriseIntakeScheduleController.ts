import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import multer from 'multer';
import { enterpriseIntakeUpload, enterpriseTempPaths, UnsupportedClientFileError } from '../config/enterpriseIntakeUpload';
import { ClientFileRefused, postFilesSoon, storeClientFile } from '../services/enterpriseIntake/enterpriseIntakeFiles';
import { ZodError } from 'zod';
import { findIntake } from '../services/enterpriseIntake/enterpriseIntakeService';
import {
  CalendarUnavailable,
  ScheduleRefused,
  bookMeeting,
  interviewPlanSchema,
  listMeetingSlots,
  meetingSchema,
  setInterviewPlan,
} from '../services/enterpriseIntake/enterpriseIntakeSchedule';

/**
 * The Enterprise intake's planning doors (v2, 2026-11-21). Same token rule as the W28 doors:
 * the intake's random id; wrong, malformed or unknown all get the same 404.
 *
 *   GET  /api/enterprise/intake/:token/slots           times on Ali's calendar they can book
 *   POST /api/enterprise/intake/:token/interview-plan  the AI interview now, or later at a time
 *   POST /api/enterprise/intake/:token/meeting         book the meeting with Ali
 *   POST /api/enterprise/intake/:token/files           one research file of their own
 */

type Handler = (intake: NonNullable<Awaited<ReturnType<typeof findIntake>>>, req: Request) => Promise<unknown>;

function door(name: string, fn: Handler, okStatus = 200) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const intake = await findIntake(String(req.params.token || ''));
      if (!intake) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(okStatus).json(await fn(intake, req));
    // `any`: express handlers receive unknown throwables; each branch narrows with instanceof.
    } catch (err: any) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) });
        return;
      }
      if (err instanceof ScheduleRefused) {
        res.status(err.http).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof CalendarUnavailable) {
        res.status(503).json({ error: 'We cannot reach the calendar right now. Please try again in a minute.', code: 'calendar_unavailable' });
        return;
      }
      console.error(JSON.stringify({ level: 'error', service: 'enterprise-intake', event: `enterprise_${name}_error`, outcome: 'failure',
        error_class: err?.error_class || err?.name || 'UnknownError', context: { message: String(err?.message || err).slice(0, 200) } }));
      res.status(500).json({ error: 'We could not do that just now. Please try again.' });
    }
  };
}

export const handleMeetingSlots = door('slots', (intake) => listMeetingSlots(intake));

export const handleInterviewPlan = door('interview_plan', (intake, req) =>
  setInterviewPlan(intake, interviewPlanSchema.parse(req.body || {})));

export const handleBookMeeting = door('meeting', (intake, req) =>
  bookMeeting(intake, meetingSchema.parse(req.body || {}).start));

/**
 * POST /api/enterprise/intake/:token/files - one research file from the client (v2).
 * multer writes to a temp file first; every temp path it was given is removed whatever happens.
 * A file over 25 MB is a JSON 413 here (nginx allows 26m on this exact path), never nginx's page.
 */
export async function handleUploadClientFile(req: Request, res: Response): Promise<void> {
  const cleanup = () => Promise.all(enterpriseTempPaths(req).map((p) => fs.unlink(p).catch(() => undefined)));
  let intake: Awaited<ReturnType<typeof findIntake>>;
  try {
    intake = await findIntake(String(req.params.token || ''));
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', service: 'enterprise-intake', event: 'enterprise_upload_lookup_failed', outcome: 'failure',
      error_class: 'UpstreamUnavailable', context: { message: String((e as Error)?.message || e).slice(0, 200) } }));
    res.status(503).json({ error: 'We could not save that file just now. Please try again.' });
    return;
  }
  if (!intake) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  enterpriseIntakeUpload.single('file')(req, res, async (err: unknown) => {
    try {
      if (err instanceof multer.MulterError) {
        await cleanup();
        res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
          error: err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 25 MB or smaller.' : 'Send one file at a time.',
          code: err.code === 'LIMIT_FILE_SIZE' ? 'too_large' : 'bad_upload',
        });
        return;
      }
      if (err instanceof UnsupportedClientFileError) {
        await cleanup();
        res.status(400).json({ error: err.message, code: 'type' });
        return;
      }
      if (err) throw err;
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(400).json({ error: 'Choose a file to share.', code: 'no_file' });
        return;
      }
      const files = await storeClientFile(intake, { tmpPath: file.path, originalName: file.originalname, size: file.size });
      postFilesSoon(intake.id);
      res.status(201).json({ files });
    // `any`: as above, narrowed by instanceof before use.
    } catch (e: any) {
      await cleanup();
      if (e instanceof ClientFileRefused) {
        res.status(e.http).json({ error: e.message, code: e.code });
        return;
      }
      console.error(JSON.stringify({ level: 'error', service: 'enterprise-intake', event: 'enterprise_upload_error', outcome: 'failure',
        error_class: e?.error_class || e?.name || 'UnknownError', context: { message: String(e?.message || e).slice(0, 200) } }));
      res.status(500).json({ error: 'We could not save that file just now. Please try again.' });
    }
  });
}
