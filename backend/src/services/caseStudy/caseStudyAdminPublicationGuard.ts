/**
 * caseStudyAdminPublicationGuard — the refusals that protect a LIVE record from
 * an edit made through a verb that reads as bookkeeping.
 *
 * WHY A SEPARATE FILE. `caseStudyAdminService` owns the `case_studies` row and
 * nothing else; it crossed CLAUDE.md's 500-line hard ceiling when the second of
 * these guards was added, and the Modular Composition Rule says the next change
 * splits before it adds. These two functions are one responsibility — "is this
 * edit safe to make while the record is published?" — so they leave together.
 * `caseStudyAdminService` keeps the row; this keeps the guard on it.
 *
 * WHAT THESE ARE NOT. They are not the publish gate. The gate
 * (`caseStudyPublishGate`) decides whether something may GO public and is the
 * sole authority on that. These decide whether an already-public record may be
 * quietly changed underneath its readers, which is a different question and one
 * the gate never sees, because no publish call is made.
 *
 * FAILURE-FIRST. Both read one table and throw or return; neither writes, so a
 * failure leaves nothing behind. No retry: a refusal is an answer, not an
 * outage. Recovery is named in the message — unpublish, make the change,
 * republish — which is also the sequence that produces an audit trail.
 */
import CaseStudyPublication from '../../models/CaseStudyPublication';
import { CaseStudyAdminError, log } from './caseStudyAdminStore';

/**
 * Refuse an edit to a Case Study that is still published somewhere.
 *
 * Shared by BOTH doors to the archived state — `archiveCaseStudy` and
 * `updateCaseStudy({status:'archived'})`. It lived inline in the first of those
 * only, which meant the general-purpose PATCH could reach the same state
 * unguarded and leave `case_studies.status` disagreeing with
 * `case_study_publications` about whether the record exists.
 *
 * `action` names the operation in the refusal, because this guard now covers
 * two unrelated verbs and "Unpublish it before archiving" is a confusing
 * sentence to receive when what you tried to do was rename the record.
 *
 * Deliberately does NOT unpublish on the admin's behalf: spec §35 treats
 * archive and unpublish as distinct operations, and silently taking a
 * public-facing action from a verb that reads as bookkeeping is how a record
 * disappears from a live site without anyone deciding it should. The error
 * names the surfaces, so the recovery is one explicit click.
 */
export async function assertNotPublished(
  caseStudyId: string,
  correlationId: string,
  event: string,
  action = 'archiving',
): Promise<void> {
  const live = await CaseStudyPublication.findAll({
    where: { case_study_id: caseStudyId, status: 'published' },
  });
  if ((live ?? []).length === 0) return;

  const surfaces = (live ?? []).map((p) => p.surface_key).sort();
  log(event, 'failure', correlationId, {
    case_study_id: caseStudyId, error_class: 'CaseStudyPublished',
  });
  throw new CaseStudyAdminError('CaseStudyPublished',
    `This Case Study is still published to ${surfaces.join(', ')}. Unpublish it before ${action}.`,
    { surfaces });
}

/**
 * THE SLUG IS THE PUBLISHED URL, AND IT IS READ LIVE.
 *
 * `toCandidate` (`caseStudyPublicStore.ts`) builds the public candidate with
 * `slug: str(study.slug)` — off the MUTABLE draft row, not off the frozen
 * snapshot. That value becomes `PublicCaseStudyDetail.slug` and
 * `seo.canonicalUrl`. So a PATCH rewrites the address of a live page: every
 * inbound link 404s, the canonical URL moves, and none of it goes through the
 * publish gate, bumps `published_at`, or leaves an audit trail that reads as a
 * publication event.
 *
 * The snapshot is byte-identical throughout, which is exactly why snapshot
 * immutability did not catch this. "The approved snapshot never mutates" is
 * true and was proved; it is simply not the same claim as "the published page
 * never changes without a republish", and the gap between those two sentences
 * is every field the public read takes from the live row instead of the
 * snapshot.
 *
 * Only a REAL change is refused. Re-sending the current slug in a PATCH that
 * edits something else is a no-op and must not be blocked, or every admin form
 * that submits its whole model becomes unusable on a published record.
 */
export async function assertSlugChangeAllowed(
  caseStudyId: string,
  correlationId: string,
  event: string,
  currentSlug: string,
  nextSlug: string | undefined,
): Promise<void> {
  if (nextSlug === undefined || nextSlug === currentSlug) return;
  await assertNotPublished(caseStudyId, correlationId, event, 'changing its slug');
}
