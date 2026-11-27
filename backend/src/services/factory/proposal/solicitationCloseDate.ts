/**
 * solicitationCloseDate (M5) - the ONE honest source of a gov bid's close/due date.
 *
 * WHY THIS EXISTS
 *
 * When a proposal is marked externally submitted it becomes a potential-win in the Revenue Room, and a
 * potential-win needs a close date so the pipeline can show "closes <date>". The close date is NOT invented
 * here: it is read from the solicitation, using the SAME precedence the student/admin projection already applies
 * (govProjectProjection.ts ~line 536-543, 592-593), so the management screen, the ContractBar countdown, and the
 * Revenue Room all agree on one date rather than three:
 *
 *   1. a management-entered manual override  (gov_qualifications.requirements_json.manualDeadline.closeDate)
 *   2. the source snapshot's closeAt, then its closeDate  (what the discovery feed used)
 *   3. the AI-vetting opportunity's closeDate  (ZIP-uploaded pursuits carry no snapshot of their own)
 *
 * Returns null when the solicitation carries NO recorded close date. A submitted bid with no known close date
 * leaves the column null rather than guessing - the same honesty rail the Revenue Room funnel follows for value.
 *
 * Output is a calendar date (YYYY-MM-DD) to match the nullable gov_submission.close_date DATE column, at day
 * precision - the funnel buckets by day (govBidFlowShared.day) and a time-of-day would be false detail.
 */

/** Normalize any date-ish string to YYYY-MM-DD, or null when it is not a real date. */
export function toCloseDateString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  // Day precision in UTC, matching govBidFlowShared.day()'s slice(0,10). A YYYY-MM-DD input round-trips unchanged.
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Resolve the solicitation close date for a gov delivery project, or null when none is recorded.
 * Best-effort and fail-soft: any read error resolves to null (the submission still records; the date is additive).
 */
export async function resolveSolicitationCloseDate(deliveryProjectId: string): Promise<string | null> {
  if (!deliveryProjectId) return null;
  try {
    const { default: GovQualification } = await import('../../../models/GovQualification');
    const qual: any = await GovQualification.findOne({
      where: { delivery_project_id: deliveryProjectId },
      order: [['version', 'DESC']],
    });
    if (!qual) return null;

    // 1. Manual override wins (POST .../due-date -> requirements_json.manualDeadline).
    const rj: any = (qual.requirements_json && typeof qual.requirements_json === 'object') ? qual.requirements_json : {};
    const manual: any = rj.manualDeadline || null;
    const manualClose = toCloseDateString(manual && manual.closeDate);
    if (manualClose) return manualClose;

    // 2. The source snapshot's closeAt, then its closeDate (the authoritative feed branch).
    const snap: any = (qual as { source_snapshot?: any }).source_snapshot || null;
    const op: any = snap && snap.opportunity ? snap.opportunity : null;
    const fromSnap = toCloseDateString((snap && snap.closeAt) || (op && op.closeAt))
      ?? toCloseDateString((snap && snap.closeDate) || (op && op.closeDate));
    if (fromSnap) return fromSnap;

    // 3. ZIP-uploaded pursuits carry no snapshot of their own; the real close date lives on the vetting opportunity.
    if (qual.tenant_id && qual.canonical_opportunity_id) {
      try {
        const { loadAiVettingView } = await import('../govAiVetting');
        const vv: any = await loadAiVettingView(String(qual.tenant_id), String(qual.canonical_opportunity_id));
        const vop: any = vv && vv.opportunity ? vv.opportunity : null;
        const fromVetting = toCloseDateString(vop && vop.closeDate);
        if (fromVetting) return fromVetting;
      } catch { /* vetting is a best-effort fallback; a failure here is not fatal */ }
    }

    return null;
  } catch {
    return null;
  }
}
