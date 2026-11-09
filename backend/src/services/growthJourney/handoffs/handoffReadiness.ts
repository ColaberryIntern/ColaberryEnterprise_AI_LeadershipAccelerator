import { classifyError } from '../../../utils/errorClassifier';

/**
 * M35 - the admissions queue ordered by the Sales Readiness Score (M25/M26), so the human team calls the readiest
 * person first.
 *
 * NOT A NEW SCORE AND NOT A NEW TABLE. The score is the same composition the admin person profile uses
 * (routes/admin/personProfileRoutes.ts): getPersonProfile -> inputsFromProfile -> scoreReadiness, computed on read. It is
 * computed with the CALLER's sections and visibility, so the queue can never show a readiness the caller could not see on
 * that person's profile (a withheld panel scores absent, exactly as it does there).
 *
 * NOT A NEW TASK SYSTEM. The rows are the existing growth_journey_handoffs queue; this only orders them. Every handoff
 * appears exactly once (the input rows are returned, re-ordered, never duplicated or dropped), and a row whose score
 * cannot be computed (no person behind it, or a read error) sorts LAST with readiness null rather than vanishing.
 *
 * BOUNDED: the caller scores at most READINESS_WINDOW rows per request (the queue holds 0 rows in production today), with
 * READINESS_CONCURRENCY profile reads in flight at once.
 */

export const READINESS_WINDOW = 100;
export const READINESS_CONCURRENCY = 5;

export interface Readiness { total: number; scoreableMax: number; coverage: number }

export interface ReadinessRow { id: string; enrollment_id: string | null; lead_id: number | null; created_at: Date | string }

export interface ReadinessDeps {
  /** The person's readiness as the caller may see it, or null when no person resolves. */
  scoreFor: (ref: string) => Promise<Readiness | null>;
}

/** The person reference for a handoff: the enrollment outranks the lead (the identity T208 precedence). */
export function personRefFor(row: Pick<ReadinessRow, 'enrollment_id' | 'lead_id'>): string | null {
  if (row.enrollment_id) return `enrollment:${row.enrollment_id}`;
  if (row.lead_id !== null && row.lead_id !== undefined) return `lead:${row.lead_id}`;
  return null;
}

export async function scoreRows<R extends ReadinessRow>(rows: R[], deps: ReadinessDeps): Promise<Map<string, Readiness | null>> {
  const out = new Map<string, Readiness | null>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < rows.length) {
      const row = rows[next++];
      const ref = personRefFor(row);
      if (!ref) { out.set(row.id, null); continue; }
      try {
        out.set(row.id, await deps.scoreFor(ref));
      } catch (err: unknown) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'handoff_readiness_failed',
          outcome: 'failure', error_class: classifyError(err), context: { handoff_id: row.id },
        }));
        out.set(row.id, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(READINESS_CONCURRENCY, rows.length) }, worker));
  return out;
}

/** Highest score first; a null score last; ties (and nulls) oldest first. Pure; returns a new array, same rows. */
export function sortByReadiness<R extends ReadinessRow>(rows: R[], scores: Map<string, Readiness | null>): R[] {
  const t = (r: R): number => new Date(r.created_at).getTime();
  return [...rows].sort((a, b) => {
    const sa = scores.get(a.id)?.total ?? null;
    const sb = scores.get(b.id)?.total ?? null;
    if (sa === null && sb !== null) return 1;
    if (sb === null && sa !== null) return -1;
    if (sa !== null && sb !== null && sa !== sb) return sb - sa;
    return t(a) - t(b);
  });
}

export interface ReadinessScope { sections: string[]; visibleEnrollmentIds: string[] | null }

/** The production scorer: the admin profile's own composition, scoped to the caller. */
export function profileScorer(scope: ReadinessScope): ReadinessDeps {
  return {
    scoreFor: async (ref) => {
      const { resolveRefToEmail } = await import('../../adminOs/personRef');
      const email = await resolveRefToEmail(ref);
      if (!email) return null;
      const { getPersonProfile } = await import('../../adminOs/personProfileService');
      const profile = await getPersonProfile({ email, sections: scope.sections, visibleEnrollmentIds: scope.visibleEnrollmentIds });
      if (!profile) return null;
      const { scoreReadiness } = await import('../../salesReadiness/srsEngine');
      const { inputsFromProfile } = await import('../../salesReadiness/srsInputs');
      const r = scoreReadiness(inputsFromProfile(profile), new Date().toISOString());
      return { total: r.total, scoreableMax: r.scoreableMax, coverage: r.coverage };
    },
  };
}
