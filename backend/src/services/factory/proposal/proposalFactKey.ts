/**
 * proposalFactKey — one pure helper, shared by the two answer paths (resolveProjectNeed and answerQuestionToLibrary),
 * so an answered need becomes a tidily-keyed company fact instead of a sentence-keyed row. No imports, no I/O.
 */

/**
 * A clean, human-readable key for a company-library fact derived from a need key like `fact:project_name_1`
 * (strip the kind prefix, underscores to spaces, Title Case). Falls back to the need's ask when the key is empty or
 * a bare "fact".
 */
export function cleanFactKey(needKey: string, ask?: string): string {
  const base = String(needKey || '').replace(/^[a-z_]+:/i, '').replace(/_/g, ' ').trim();
  const titled = base.replace(/\b\w/g, (c) => c.toUpperCase());
  if (!titled || /^fact$/i.test(base)) return (ask && ask.trim()) || needKey || 'Company fact';
  return titled;
}
