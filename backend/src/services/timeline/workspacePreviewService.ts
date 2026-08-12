/**
 * workspacePreviewService — lets an admin open the REAL student runtime workspace
 * (/portal/runtime/:cardId) for one card, as a READ-ONLY impersonated test
 * student, in a new tab.
 *
 * It mints a read_only participant JWT (the server blocks every write) for a
 * neutral test student, and returns a `/portal/view-as#t=<jwt>&next=<runtime>`
 * deep-link. Read-only means the admin observes the live workspace — the gated
 * buttons, watch bar, mentor, approvals and anti-cheat safeguards — without ever
 * touching a real member's data. The runtime only opens PUBLISHED cards (it 404s
 * on drafts) and enforces gating (423 on a locked card), so this is offered for
 * published cards only.
 */
import { TimelineCard, Cohort, Enrollment } from '../../models';
import { signReadOnlyParticipantJwt } from '../participantService';
import { createTestEnrollments } from '../../scripts/createTestUsers';
import { env } from '../../config/env';
import { buildViewAsWorkspaceUrl } from './workspacePreviewUrl';

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

export async function buildWorkspacePreviewUrl(cardId: string, impersonatedBy: string): Promise<string> {
  const card = await TimelineCard.findByPk(cardId);
  if (!card) throw httpError('Card not found', 404);
  if (card.visibility !== 'published') {
    throw httpError('Publish this card first — the live workspace only opens published cards.', 409);
  }

  // The read-only test student just needs a cohort to exist under. Timeline cards
  // are global (cohort_id null) and the runtime opens any published card
  // regardless of the student's cohort, so any cohort works — prefer the card's
  // program cohort when there is one.
  let cohort = card.program_id
    ? await Cohort.findOne({ where: { program_id: card.program_id } })
    : null;
  if (!cohort) cohort = await Cohort.findOne();
  if (!cohort) throw httpError('No cohort available to host the preview.', 409);

  // Idempotent: reuses the fixed test-warm@colaberry.test enrollment for this cohort.
  const { warm } = await createTestEnrollments(cohort.id);
  const enrollment = await Enrollment.findByPk(warm.enrollment_id);
  if (!enrollment) throw httpError('Preview student unavailable.', 500);

  const token = signReadOnlyParticipantJwt(
    { id: enrollment.id, email: enrollment.email, cohort_id: enrollment.cohort_id },
    impersonatedBy,
  );
  // Token rides in the URL hash (kept out of query strings / logs / referrers),
  // exactly like the existing read-only "View as member" link.
  return buildViewAsWorkspaceUrl(env.frontendUrl, token, cardId);
}
