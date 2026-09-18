import { Request, Response } from 'express';
import { TenantAccessError } from '../modules/tenancy/tenantAuthorization';
import { personParamsSchema, personQuerySchema } from '../schemas/growthJourneySchema';
import { loadPersonJourney, type PersonJourney } from '../services/growthJourney/personJourneyService';
import { accessDenied, badRequest, logReadFailure, scopedContext } from './growthJourneyController';

/**
 * Person 360 (Phase 4 T410): `GET /people/:leadId`.
 *
 * Same status matrix as the other reads: 401 unauthenticated · 404 master
 * flag off (the router) · 200 in scope · 404 for a lead the caller can see
 * nothing of, byte-identical to a lead that does not exist · 403 for a
 * requested scope not granted. There is no per-row guard here because there
 * is no single row: every collection is read under the caller's scope by the
 * service, and a lead with a CPN and an Enterprise relationship shows one of
 * them to a Training-only operator.
 *
 * The view is scrubbed once more at the boundary: any token carrying an `@`
 * (a human's free-text disposition reason, say) is replaced by `[redacted]`
 * before it leaves - stricter than the log redactor, which keeps the domain,
 * because the contract for this read is "no address, ever", not "no
 * identifiable address". The service reads no email column; this is the belt
 * to that brace.
 */

const NOT_FOUND = { error: 'Not found' } as const;

/** Every token carrying an `@`, replaced whole; ids, dates and numbers untouched. */
const ADDRESS_TOKEN = /\S*@\S*/g;
export function scrubAddresses<T>(value: T): T {
  if (typeof value === 'string') return (value.includes('@') ? value.replace(ADDRESS_TOKEN, '[redacted]') : value) as unknown as T;
  if (Array.isArray(value)) return value.map(scrubAddresses) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubAddresses(v)])) as unknown as T;
  }
  return value;
}

/** GET /people/:leadId - one lead's journey across the brands the caller may see. */
export async function getPersonJourneyHandler(req: Request, res: Response): Promise<void> {
  const params = personParamsSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const query = personQuerySchema.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  try {
    const ctx = await scopedContext(req, res, query.data);
    if (!ctx) return;
    const result = await loadPersonJourney({ leadId: params.data.leadId, ctx, limit: query.data.limit });
    if (result.status === 'not_found') {
      res.status(404).json(NOT_FOUND);
      return;
    }
    res.json(scrubAddresses<PersonJourney>(result.person));
  } catch (err) {
    if (err instanceof TenantAccessError) return accessDenied(req, res, err, 'person_read_refused');
    const errorClass = logReadFailure(req, err, 'person_read_failed');
    res.status(500).json({ error: 'Person read failed', error_class: errorClass });
  }
}
