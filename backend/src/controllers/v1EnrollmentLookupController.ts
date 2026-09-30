import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Enrollment, Cohort } from '../models';
import {
  v1EnrollmentLookupQuerySchema,
  V1EnrollmentLookupResponse,
  V1EnrollmentLookupRow,
} from '../schemas/v1EnrollmentLookupSchema';

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {},
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'v1-enrollment-lookup', event, outcome, ...context }) + '\n',
  );
}

// A student "counts" for a downstream login gate when they hold a paid membership
// that is live or finished. Guests and withdrawn/suspended members do not.
export function isEnrolledMember(rows: readonly V1EnrollmentLookupRow[]): boolean {
  return rows.some((r) => r.tier === 'member' && (r.status === 'active' || r.status === 'completed'));
}

/**
 * GET /api/v1/enrollments/lookup?email=...
 * enterprise.colaberry.ai -> Repo2Reputation. Service-token auth.
 * Answers "is this email an Accelerator student" so a partner app can gate its login
 * on the launch roster instead of the school database. The email is not logged;
 * only its hash is, so the lookup can be traced without writing PII into the log stream.
 */
export async function lookupEnrollment(req: Request, res: Response, next: NextFunction): Promise<void> {
  const correlation_id = crypto.randomUUID();
  const start = Date.now();

  try {
    const { email } = v1EnrollmentLookupQuerySchema.parse(req.query);
    const normalized = email.toLowerCase();
    const email_hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);

    const found = await Enrollment.findAll({
      where: { email: normalized },
      include: [{ model: Cohort, as: 'cohort', attributes: ['name'], required: false }],
      attributes: ['status', 'tier'],
    });

    const enrollments: V1EnrollmentLookupRow[] = found.map((e) => {
      const cohort = (e as unknown as { cohort?: { name?: string } | null }).cohort;
      return { cohort: cohort?.name ?? null, status: e.status, tier: e.tier };
    });

    const body: V1EnrollmentLookupResponse = { email: normalized, enrolled: isEnrolledMember(enrollments), enrollments };
    log('info', 'enrollment_lookup', 'success', {
      correlation_id,
      email_hash,
      enrolled: body.enrolled,
      matches: enrollments.length,
      duration_ms: Date.now() - start,
    });
    res.status(200).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      log('warn', 'enrollment_lookup', 'failure', { correlation_id, error_class: 'ValidationError', issues: err.issues.length });
      res.status(400).json({ error: 'Invalid query', details: err.issues.map((i) => i.message) });
      return;
    }
    log('error', 'enrollment_lookup', 'failure', {
      correlation_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
}
