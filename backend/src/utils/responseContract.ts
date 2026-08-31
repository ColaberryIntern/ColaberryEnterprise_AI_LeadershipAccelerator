import type { ZodType } from 'zod';

/**
 * responseContract — check an outbound payload against its declared shape.
 *
 * CLAUDE.md's Contract Enforcement Layer requires that a response shape be
 * "validated at the route boundary against the declared shape (in development, fail
 * loud; in production, log and continue)".
 *
 * ## Why this exists as a helper rather than a fix in five places
 *
 * Five controllers carried a byte-similar copy of this block, each wrapped in
 * `if (process.env.NODE_ENV !== 'production')`. **That condition is false in every
 * environment we run** — dev and production containers both report
 * `NODE_ENV=production` — so none of the five checks had ever executed anywhere. The
 * contract enforcement CLAUDE.md mandates was present in the source and absent at
 * runtime.
 *
 * The gate was choosing between *log a warning* and *do nothing*, and picked
 * "do nothing" everywhere. Since the production-side behaviour CLAUDE.md asks for is
 * exactly "log and continue", the condition had nothing left to decide and is gone.
 * The check now runs always.
 *
 * ## Why this never throws
 *
 * A contract violation means we are about to send a shape the frontend was not
 * promised — bad, and worth knowing loudly. It does not mean the data is dangerous.
 * Turning a shape drift into a 500 would take a degraded page and make it a broken
 * one, for every user, at the moment we least understand why. So: warn, and send.
 *
 * The cost is one `safeParse` per response. That is the price of the check actually
 * existing, and it is small next to the database work that produced the payload.
 */

/**
 * The schema surface this needs.
 *
 * This was originally a hand-written structural type, on the reasoning that the util
 * should not import zod. That was a false economy and it did not compile: zod's
 * `safeParse` returns a DISCRIMINATED UNION (`{ success: true, data }` or
 * `{ success: false, error }`), which is not assignable to a `{ success: boolean;
 * error?: ... }` shape. Inventing a structural type instead of using the real one
 * produced a type that agreed with my assumption and disagreed with zod.
 *
 * `ZodType` is the real thing, and zod is already a core dependency here.
 */
export type SafeParsable = Pick<ZodType, 'safeParse'>;

/**
 * Validate `payload` against `schema` and log a structured warning if it drifts.
 *
 * @param event  Stable event name for the log line, e.g. `career_profile_contract_violation`.
 * @param schema The declared response shape.
 * @param payload What is about to be sent.
 * @returns `true` when the payload matches — returned so a caller can branch if it
 *          ever needs to, without this function deciding on its behalf.
 */
export function checkResponseContract(
  event: string,
  schema: SafeParsable,
  payload: unknown,
): boolean {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return true;

  console.warn(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event,
      outcome: 'partial',
      context: {
        issues: parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
        ),
      },
    }),
  );
  return false;
}

/**
 * Validate the WIRE shape rather than the in-memory object.
 *
 * `Date` becomes an ISO string once serialised, and the frontend contract describes
 * what arrives, not what the service held. A check against the raw object can pass
 * while the thing actually sent does not match — which is the more expensive way to be
 * wrong, since it reports success about a payload nobody looked at.
 */
export function checkWireContract(event: string, schema: SafeParsable, payload: unknown): boolean {
  return checkResponseContract(event, schema, JSON.parse(JSON.stringify(payload)));
}
