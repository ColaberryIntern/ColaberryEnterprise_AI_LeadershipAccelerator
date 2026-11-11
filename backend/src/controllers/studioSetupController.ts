import { Request, Response, NextFunction } from 'express';
import {
  readStudioConfig, writeStudioConfig, listStudioSessions, StudioWriteRefusal,
} from '../services/broadcast/studioSetupService';
import { studioSetupBodySchema } from '../schemas/studioSetupSchema';

/**
 * Studio setup routes (D4, P4-01).
 *
 * Two handlers: read everything the screen renders from a session id, and apply a change.
 *
 * ## Why every refusal is a status code with a machine-readable reason
 *
 * The screen turns each reason into a sentence a person can act on. Returning a bare 500, or a
 * 200 with a quietly unapplied change, would leave an operator believing they had configured a
 * broadcast they had not — and for `access_mode` that belief is unrecoverable, because the
 * decision is write-once and there is no screen anywhere that can change it afterwards.
 *
 * The reason codes never reach a human as-is. That translation belongs to the frontend, which is
 * where the sentences live; printing a server reason code to a user is a copy-rule violation in
 * this repo.
 */

/** 409 for a state conflict, 400 for a bad request. The distinction is what the screen keys on. */
const REFUSAL_STATUS: Record<StudioWriteRefusal, number> = {
  // The operator asked for something the data forbids right now.
  no_room: 409,
  undeterminable_start: 409,
  already_aired: 409,
  cancelled: 409,
  no_live_input: 409,
  access_mode_is_permanent: 409,
  version_conflict: 409,
  // The operator asked for something that is never valid.
  producer_is_presenter: 400,
};

export async function handleGetStudioConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await readStudioConfig(req.params.id as string);
    if (!config) return res.status(404).json({ error: 'Session not found' });
    res.json({ config });
  } catch (err) { next(err); }
}

export async function handleUpdateStudioConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = studioSetupBodySchema.safeParse(req.body);
    if (!parsed.success) {
      // The field path is included because the screen highlights the offending card. The Zod
      // message is not shown to a person.
      return res.status(400).json({
        error: 'Invalid studio setup',
        reason: 'invalid_body',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
      });
    }

    const result = await writeStudioConfig(req.params.id as string, parsed.data);

    if (!result.ok && !result.refusal) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!result.ok && result.refusal) {
      return res.status(REFUSAL_STATUS[result.refusal]).json({
        error: 'Studio setup refused',
        reason: result.refusal,
        // Returned even on a refusal so the screen can re-render the true current state rather
        // than keeping whatever the operator had typed.
        config: result.config ?? null,
      });
    }
    res.json({ config: result.config });
  } catch (err) { next(err); }
}


/**
 * The classes an operator can configure.
 *
 * This exists because a nav entry is static and cannot carry a session id, so the menu link
 * lands here and the operator picks the class. Without it, criterion 1 - reach Studio setup from
 * the admin nav - has nowhere to go.
 */
export async function handleListStudioSessions(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ sessions: await listStudioSessions() });
  } catch (err) { next(err); }
}
