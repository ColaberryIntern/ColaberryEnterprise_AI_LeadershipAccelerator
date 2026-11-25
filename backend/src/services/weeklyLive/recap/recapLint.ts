import { lintField, lintObjectAs, type LintViolation, type LintContext } from '../contentLint';
import { loadAttendees } from './recapStore';

/**
 * The recap's content check. Phase 1 shipped a minimal subset here (assumption A4); WL2.3 replaced it
 * with the shared contentLint, so the recap and every other Weekly Live generator apply one rule set.
 *
 * Two kinds of recap text:
 *  - The overview (headline, ideas, steps, quote, homework) is the same for every attendee AND is shown
 *    on the public class recap page, so it is linted as public text ("post") with the class's
 *    attendees: nobody's name or email may appear in it.
 *  - The rendered email (lintText) is 1:1 ("email"): it greets the reader by name, which is fine.
 */
export type { LintViolation };

export function lintText(field: string, text: string | null | undefined): LintViolation[] {
  return lintField({ path: field, kind: 'email', text });
}

/** Lint the overview as public text, against the given attendees. Pure. */
export function lintObject(obj: unknown, ctx: LintContext = {}): LintViolation[] {
  return lintObjectAs(obj, 'post', ctx);
}

/** Lint a class's overview against the people who checked in to that class. */
export async function lintRecapSummary(sessionId: string, summary: unknown): Promise<LintViolation[]> {
  const attendees = (await loadAttendees(sessionId)) || [];
  return lintObject(summary, { attendees });
}
