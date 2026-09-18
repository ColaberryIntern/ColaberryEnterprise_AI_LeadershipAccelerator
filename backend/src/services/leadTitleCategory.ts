/**
 * The title -> seniority category rule, in a module with no I/O.
 *
 * Lifted out of `interactionService.ts` (Phase 4 T407) so the Growth Journey
 * scorer - a pure module by contract - can reuse the SAME function for the
 * authority dimension without loading the models `interactionService` imports.
 * `interactionService` re-exports it under the same name: one definition, no copy.
 */

/** Normalize title into a broad category for aggregation */
export function normalizeTitleCategory(title?: string): string {
  if (!title) return 'unknown';
  const t = title.toLowerCase();

  if (/\b(ceo|cto|cfo|cio|coo|cmo|chief)\b/.test(t)) return 'C-Suite';
  if (/\b(svp|senior vice president)\b/.test(t)) return 'SVP';
  if (/\b(vp|vice president)\b/.test(t)) return 'VP';
  if (/\b(director|head of)\b/.test(t)) return 'Director';
  if (/\b(senior manager|sr\.\s*manager)\b/.test(t)) return 'Sr. Manager';
  if (/\b(manager|mgr)\b/.test(t)) return 'Manager';
  if (/\b(lead|principal|staff|senior|sr\.)\b/.test(t)) return 'Senior IC';
  if (/\b(founder|co-founder|owner|partner)\b/.test(t)) return 'Founder';

  return 'IC';
}
