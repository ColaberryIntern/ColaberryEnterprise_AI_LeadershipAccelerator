import { lintField, lintObjectAs, type LintViolation } from '../contentLint';

/**
 * The recap's content check. Phase 1 shipped a minimal subset here (assumption A4); WL2.3 replaced it
 * with the shared contentLint, so the recap and every other Weekly Live generator apply one rule set.
 * The recap is a 1:1 email, so every field is linted as kind "email" (the reader's own name is fine,
 * the zero-price, partnership, logo, earnings and dash rules all apply).
 *
 * The two function names stay so the Phase 1 callers (controller, draft, send) are unchanged.
 */
export type { LintViolation };

export function lintText(field: string, text: string | null | undefined): LintViolation[] {
  return lintField({ path: field, kind: 'email', text });
}

/** Lint every string inside an object, reporting dotted field paths. */
export function lintObject(obj: unknown): LintViolation[] {
  return lintObjectAs(obj, 'email');
}
