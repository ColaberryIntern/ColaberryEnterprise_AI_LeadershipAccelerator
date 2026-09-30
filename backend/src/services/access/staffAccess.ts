import CommunityMember from '../../models/CommunityMember';

/**
 * Cross-cutting access helper: does this enrollment belong to a community member
 * with the admin-assigned `staff` role?
 *
 * What this DOES buy: entitlement. `hasFullCurriculumAccess` treats staff as
 * fully paid, so the paywall never limits them to the free-preview week
 * (`contentEntitlement.isFreePreviewTier` / `resolveContentPageAccess`), and the
 * build entitlement middleware lets them through.
 *
 * What this does NOT buy — and the reason this paragraph exists: it does NOT
 * unlock the timeline's PREREQUISITE gating. Neither `assertCardUnlocked` nor
 * the `getFeed` lock overlay consults this helper at all; `timelineGatingService`
 * imports only `isFreePreviewTier`. A staff member therefore sees exactly the
 * same padlocks and the same `lock_reason` as a student, and must complete the
 * same prerequisites. That is deliberate (staff walk the curriculum as students
 * do) — so if you are debugging "why is a @colaberry.com address locked out of a
 * card", this helper is NOT the answer: read the card's `unlock_rules` and
 * `timeline_section_rules` instead.
 *
 * The role lives on `community_members.role` (VARCHAR CHECK: student|mentor|staff),
 * keyed uniquely by `enrollment_id`, so one lookup resolves it unambiguously.
 * This helper is the SINGLE place the timeline domain reaches into the community
 * domain — the coupling (and its one extra query per gate check) stays here so
 * it is easy to find, cache, or swap later.
 *
 * Fail-SAFE to `false`: any lookup error yields "not staff", so a DB blip can
 * never silently unlock the whole curriculum for everyone. Normal gating then
 * applies (and normal gating fails OPEN on its own errors, so a student is never
 * trapped either).
 */
export async function isStaffEnrollment(enrollmentId: string): Promise<boolean> {
  try {
    if (!enrollmentId) return false;
    const member = await CommunityMember.findOne({
      where: { enrollment_id: enrollmentId },
      attributes: ['role'],
    });
    return member?.role === 'staff';
  } catch (err: any) {
    console.warn('[access] isStaffEnrollment lookup failed, treating as non-staff:', err?.message);
    return false;
  }
}

/**
 * Broader than `isStaffEnrollment`: true for the admin-assigned community
 * `staff` role OR any non-null `mgmt_role` (the same "cross-cohort viewer" set
 * the role-aware People panel uses, see `peoplePanelService.resolveIsStaff`).
 * Reused wherever an action needs to match that panel's cross-cohort visibility
 * (e.g. DMs — staff/mgmt can see people outside their own cohort in the panel,
 * so they must also be able to open a DM with them). Fail-SAFE to `false`.
 */
export async function isStaffOrMgmt(enrollmentId: string): Promise<boolean> {
  if (!enrollmentId) return false;
  const [staffRole, member] = await Promise.all([
    isStaffEnrollment(enrollmentId),
    CommunityMember.findOne({ where: { enrollment_id: enrollmentId }, attributes: ['mgmt_role'] }).catch(() => null),
  ]);
  return staffRole || !!(member as any)?.mgmt_role;
}
