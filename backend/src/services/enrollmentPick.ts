/**
 * The canonical-enrolment rule, in a module with no I/O.
 *
 * `enrollments.email` is not unique and duplicate rows are routine; every lookup
 * that goes from an address to ONE enrolment canonicalises through this rule
 * (mgmt_role > non-explorer > paid > newest), or it attaches to an empty shadow
 * account. Lifted out of `participantService.ts` (Phase 4 T407) so the Growth
 * Journey subject resolver - contracted to import no send path - can reuse the
 * SAME function without loading the mailer `participantService` imports.
 * `participantService` re-exports it under the same name: one definition, no copy.
 */

/**
 * Pick the best of several active, portal-enabled enrollments for the same
 * email. Recency alone is not a safe tiebreaker: the Open House flow can mint
 * a fresh 'explorer' row for someone who already holds an older real seat
 * (e.g. a manual PaySimple-side-channel reconciliation that didn't also
 * retire the stray Explorer row), and "most recent" would then route the
 * student's own login into the free-preview shadow account instead of their
 * real one -- silently hiding their paid access and any account credit tied
 * to the real row. Prefer, in order: an enrollment flagged with a
 * `mgmt_role` (2026-07-30 incident: a staff member's newer, unrelated paid
 * duplicate silently outranked their real staff-flagged enrollment, hiding
 * their own Management Portal access), then non-explorer type, then paid
 * over pending, then most recently created. Exported for testing.
 */
export function pickBestEnrollment<T extends {
  enrollment_type?: string | null;
  payment_status?: string | null;
  created_at?: Date | string | null;
  communityMember?: { mgmt_role?: string | null } | null;
}>(
  candidates: T[],
): T | null {
  if (!candidates.length) return null;
  const rank = (e: T): [number, number, number, number] => [
    e.communityMember?.mgmt_role ? 0 : 1,
    e.enrollment_type === 'explorer' ? 1 : 0,
    e.payment_status === 'paid' ? 0 : 1,
    -new Date(e.created_at ?? 0).getTime(),
  ];
  return [...candidates].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    return 0;
  })[0];
}
