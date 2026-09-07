/**
 * Pictures for rail tiles that have no image of their own.
 *
 * WHY THESE AND NOT NEW ART. The portal already ships 55 curriculum thumbnails
 * under `/thumbnails/curriculum-types/`, and every active curriculum type
 * carries a `thumbnail_url`. Commissioning or generating a second set for the
 * rails would give the product two visual languages for the same subjects: the
 * Prompt Lab card in the week would look one way and the Prompt Lab tile in a
 * rail another. So rails reuse the library the rest of the platform draws from.
 *
 * These are STATIC, PUBLIC paths, not database reads. A rail draws six to eight
 * tiles and must not do a lookup per tile to decide a picture; the mapping is a
 * constant because the subjects are constants -- a mock exam is always a mock
 * exam. Where a tile has real artwork of its own (an event's Eventbrite image,
 * a card's own image, a person's avatar) that always wins and none of this is
 * consulted.
 */

const BASE = '/thumbnails/curriculum-types';

export const ART = {
  diagnostic: `${BASE}/knowledge_check.jpg`,
  drill: `${BASE}/prompt_lab.jpg`,
  mock: `${BASE}/certification_exercise.jpg`,
  domainMap: `${BASE}/ai_architecture_breakdown.jpg`,
  evidence: `${BASE}/artifact_submission.jpg`,
  readiness: `${BASE}/milestone.jpg`,

  projectTask: `${BASE}/project_task.jpg`,
  projectBuild: `${BASE}/implementation_task.jpg`,
  projectDone: `${BASE}/achievement.jpg`,

  portfolioDefault: `${BASE}/artifact_submission.jpg`,
} as const;

/** Portfolio artefacts, by the `kind` column. Falls back to the generic one. */
export const PORTFOLIO_ART: Record<string, string> = {
  architecture_doc: `${BASE}/ai_architecture_breakdown.jpg`,
  prompt_library: `${BASE}/prompt_lab.jpg`,
  case_study: `${BASE}/deep_dive.jpg`,
  reflection: `${BASE}/reflection.jpg`,
  implementation_notes: `${BASE}/implementation_task.jpg`,
  presentation: `${BASE}/presentation.jpg`,
};
