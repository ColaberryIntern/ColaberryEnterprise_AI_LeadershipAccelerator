import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { openHouseRegisterSchema } from '../schemas/openHouseSchema';
import { createExplorerEnrollment } from '../services/enrollmentService';

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {}
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'open-house-register', event, outcome, ...context }) + '\n'
  );
}

// POST /api/v1/open-house/register
// Service-authed (training.colaberry.com). Creates a light "Explorer" account
// under the current cohort and emails a passwordless login link. Idempotent on
// email: repeat calls return the existing account without duplicating or re-sending.
export async function handleOpenHouseRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  const correlation_id = crypto.randomUUID();
  const start = Date.now();
  log('info', 'open_house_register_start', 'partial', { correlation_id });

  try {
    const payload = openHouseRegisterSchema.parse(req.body);
    const { enrollment, created } = await createExplorerEnrollment(payload);

    const status = created ? 201 : 200;
    log('info', 'open_house_register_end', 'success', {
      correlation_id, status, created, duration_ms: Date.now() - start,
    });

    res.status(status).json({
      ok: true,
      created,
      enrollment_id: enrollment.id,
      message: created
        ? 'Explorer account created; a login link was emailed.'
        : 'Already registered; a login link was previously emailed.',
    });
  } catch (err) {
    if (err instanceof ZodError) {
      log('warn', 'open_house_register_validation_failure', 'failure', {
        correlation_id,
        error_class: 'ValidationError',
        issues: err.issues.map(e => ({ path: e.path, message: e.message })),
        duration_ms: Date.now() - start,
      });
      res.status(400).json({ error: 'Validation failed', details: err.issues });
      return;
    }
    log('error', 'open_house_register_unhandled_error', 'failure', {
      correlation_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    });
    next(err);
  }
}
