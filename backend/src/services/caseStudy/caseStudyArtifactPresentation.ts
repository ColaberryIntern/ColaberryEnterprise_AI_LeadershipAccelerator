/**
 * caseStudyArtifactPresentation — what a picture on a published page is allowed
 * to MEAN, and which pictures may lead a record.
 *
 * WHY IT IS ITS OWN FILE. `caseStudyPublicSections.ts` reached CLAUDE.md's
 * 500-line hard ceiling when these rules were added to it, and the rule there is
 * to split before adding rather than after. The split is along a real seam: this
 * module answers "what kind of claim is this picture" and nothing else — it
 * touches no snapshot, no verification, no projection shape. Same one-way
 * arrangement as the pair it sits beside: sections imports this, this imports
 * nothing from sections, so the two are acyclic by construction.
 *
 * THE RULE IT ENFORCES, from `docs/V2_CUTOVER_CARRYOVER.md`: *"a picture
 * presented as evidence of something that did not happen is a fabricated claim,
 * it just happens to be made of pixels."* A photograph is atmosphere. It shows a
 * room, a working session, a stock frame. It evidences nothing about a delivered
 * system, and this module is what stops it being able to pretend otherwise.
 *
 * PURE and LEAF. One type-only import. No clock, no I/O, no randomness.
 */
import type { CaseStudyArtifactType } from '../../types/caseStudy';
import type { PublicArtifactPresentation } from '../../types/caseStudyPublic';

/** Local, so this module imports nothing at runtime. Mirrors `sections.text`. */
const asText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Atmosphere, never evidence — as a set rather than a sentence.
 *
 * A member of this set is a picture that shows NOTHING about the delivered
 * system. Everything else is a picture OF the work. Keeping it as data is what
 * lets `artifactPresentation()` be total and lets a test enumerate the whole
 * union and assert that exactly one member is atmosphere.
 */
export const ATMOSPHERE_ARTIFACT_TYPES: readonly CaseStudyArtifactType[] = Object.freeze(['photo']);

/** Derived from the type. Never read from the row, so it is never editorial. */
export function artifactPresentation(type: CaseStudyArtifactType): PublicArtifactPresentation {
  return ATMOSPHERE_ARTIFACT_TYPES.includes(type) ? 'atmosphere' : 'evidence';
}

/**
 * The image types that may lead a record, STRONGEST CLAIM FIRST.
 *
 * The order is the rule, not a convenience: a `photo` is last, so it can only
 * become the hero of a record that carries no screenshot and no architecture
 * image at all. A record with both a product screenshot and a nice photograph
 * leads with the screenshot every time, because the hero is the one image a
 * reader reads as "this is the thing they built".
 *
 * Exported so a test can assert the ORDER rather than re-deriving it — a test
 * that rebuilt this list would agree with any order it was given.
 */
export const HERO_IMAGE_PRIORITY: readonly CaseStudyArtifactType[] = Object.freeze([
  'screenshot', 'architecture', 'photo',
]);

/**
 * The words that turn a photograph into a claim about the delivered system.
 *
 * CLOSED VOCABULARY, on the same principle as `caseStudyPublishClaimScan.ts`:
 * nothing here interprets natural language, and the list is short enough to
 * read in one glance and argue with. Each entry is a phrase that, applied to a
 * picture, asserts the picture SHOWS the built thing — which is precisely the
 * assertion a photograph cannot support.
 *
 * WHAT IT DOES NOT CATCH, stated plainly rather than implied: a false caption
 * using none of these words ("a moment from the rollout week") passes, and no
 * deterministic rule reaches it. Snapshot approval stands in that gap. This list
 * exists so a human approving a caption is not also being asked to notice that a
 * stock photograph has been relabelled as a screenshot.
 */
export const DELIVERED_WORK_CLAIMS: readonly string[] = Object.freeze([
  'shipped', 'delivered', 'deployed', 'launched', 'in production', 'production',
  'go-live', 'golive', 'rollout', 'cutover',
  'evidence', 'proof', 'proves', 'verified', 'measured', 'benchmark', 'results',
  'screenshot', 'the system', 'the platform', 'the product', 'the dashboard',
]);

/**
 * Whether a piece of caption text claims to show delivered work.
 *
 * Case-insensitive substring matching over the closed list. Substring rather
 * than word-boundary on purpose: "shipped", "shipping" and "we shipped it" are
 * the same claim, and a stemmer would be the interpretation this rule refuses to
 * do. It errs toward matching, and the consequence of a match is that a
 * photograph is not published — the safe direction.
 */
export function describesDeliveredWork(value: unknown): boolean {
  const haystack = asText(value).toLowerCase();
  if (!haystack) return false;
  return DELIVERED_WORK_CLAIMS.some((claim) => haystack.includes(claim));
}
