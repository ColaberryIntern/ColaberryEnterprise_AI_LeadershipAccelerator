import type { ProjectTreeDto, ProjectTaskDto } from '../projects/projectTreeDto';

/**
 * The student's OWN material, gathered for the grounding check.
 *
 * WHY THIS IS NOT THE PROMPT. The grounding check asks "does this figure appear in
 * anything the student wrote?" The assembled prompt contains the TEMPLATE's text,
 * including its worked examples and the numbers in them. Ground a generated deck
 * against the thing that asked for a number and every fabrication looks supported —
 * the check would pass on exactly the decks it exists to catch.
 *
 * So this returns only what the learner authored: their project's name and setting,
 * their plan stories, the acceptance lines they wrote, and the two Prepare answers.
 * Prep tasks are excluded for the same reason the prompt excludes them — "Record a
 * first run-through" is not a fact about what they built.
 *
 * EMPTY IS A LEGITIMATE ANSWER, and an important one. A student who has written
 * nothing has supplied no figures, so every figure in their deck should be flagged.
 * Returning a plausible-looking filler string here would silently ground the whole
 * deck against text the student never typed.
 *
 * Pure: a tree in, strings out. No database, no model call, no imports beyond types.
 */

const isPrep = (t: ProjectTaskDto): boolean => /^PREP-\d+$/.test(t.story_id || '');

/** Trimmed, non-empty strings only — a blank line is not evidence of anything. */
function pushText(out: string[], value: unknown): void {
  if (typeof value !== 'string') return;
  const t = value.trim();
  if (t) out.push(t);
}

export interface SavedPrepAnswers {
  audience?: string | null;
  purpose?: string | null;
}

export function sourcesFromTree(
  tree: ProjectTreeDto,
  saved: SavedPrepAnswers = {},
): string[] {
  const out: string[] = [];

  pushText(out, tree.name);
  pushText(out, tree.organization_name);
  pushText(out, tree.industry);
  pushText(out, tree.project_stage);

  // The learner's own answers on the Prepare stage. These are the most likely place
  // for a real number to have been typed, so leaving them out would flag figures the
  // student did supply.
  pushText(out, saved.audience);
  pushText(out, saved.purpose);

  const tasks: ProjectTaskDto[] = (tree.lists || []).flatMap((l) => l.tasks || []);
  for (const t of tasks) {
    if (isPrep(t)) continue;
    pushText(out, t.title);
    pushText(out, t.description);
    // Acceptance lines are where thresholds live — "under 2 minutes", "at least 40
    // deliveries a day". They are the student's own wording and they carry figures.
    if (Array.isArray(t.acceptance)) for (const line of t.acceptance) pushText(out, line);
    pushText(out, t.vibe);
    pushText(out, t.trust);
  }

  // Deduplicated because the same phrase recurring does not make it more true, and a
  // long source list costs nothing but makes the stored grounding record harder to read.
  return Array.from(new Set(out));
}
