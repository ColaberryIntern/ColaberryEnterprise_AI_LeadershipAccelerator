import Enrollment from '../../models/Enrollment';

// Ali flagged live: ticket titles/descriptions baked in the raw enrollment UUID
// ("Reese autonomous outreach — inactivity (d6a4b017-...)") instead of the
// student's name — unreadable for a human. Both call sites that build
// human-facing ticket text (reeseAutonomousOutreachService.sendNewOutreach,
// reeseTicketLinkService.ensureReeseTicketForRoom) need the exact same
// lookup+fallback, so it's lifted here rather than duplicated — mirrors the
// existing Enrollment.findByPk(enrollmentId, { attributes: [...] }) pattern
// already used in reeseSignalService.ts.
//
// entity_id/metadata on the ticket still carry the raw enrollmentId — this
// function only affects human-facing title/description text.

/**
 * Resolve a student's display name for human-facing ticket text. Never throws;
 * degrades to a generic, non-UUID phrase if the enrollment can't be found —
 * printing the raw UUID as a fallback would recreate the exact defect this
 * function exists to fix.
 */
export async function resolveStudentDisplayName(enrollmentId: string): Promise<string> {
  const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['full_name'] });
  return enrollment?.full_name || 'a student';
}
