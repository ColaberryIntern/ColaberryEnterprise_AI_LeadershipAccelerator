import { Op } from 'sequelize';
import {
  Enrollment,
  Lead,
  CommunityMember,
  ExplorerJourneyProfile,
} from '../../models';
import { pickBestEnrollment } from '../participantService';
import { redactForLogs } from '../../utils/piiRedaction';

/**
 * Explorer ↔ Lead identity bridge.
 * Plan: docs/EXPLORER_GROWTH_OS_PLAN.md §2.6, §5.4 T1, EPIC 1 T008.
 *
 * The campaign engine is lead-centric (`leads`, INTEGER pk) and the learning
 * platform is enrollment-centric (`enrollments`, UUID pk). There is no FK
 * between them in either direction — the only link is a lowercased email match,
 * created best-effort inside a try/catch in
 * enrollmentService.createExplorerEnrollment:325. It works today (verified:
 * 154/154 active Explorers resolve) but nothing enforces it and nothing repairs
 * it, so it degrades silently as soon as a signup path misses.
 *
 * This module makes that link durable by persisting it on
 * explorer_journey_profiles.lead_id, and reportable when it fails.
 *
 * Two invariants worth stating because they are easy to get wrong:
 *
 *  1. READ-ONLY on `leads`. This never creates a lead. An Explorer with no
 *     matching lead is a REPORTED condition, not a repaired one — silently
 *     minting CRM rows for people who never entered the funnel would corrupt
 *     every downstream conversion metric.
 *
 *  2. `enrollments.email` is NOT unique and duplicate rows are routine. Every
 *     lookup canonicalises through participantService.pickBestEnrollment, or the
 *     bridge would attach to an empty shadow account (mgmt_role > non-explorer >
 *     paid > newest) and score a learner whose real activity lives elsewhere.
 *
 * No cron is registered here. EPIC 3 owns scheduling; this exposes the callable.
 */

/** Result of resolving one learner. */
export interface BridgeResolution {
  enrollment_id: string;
  lead_id: number | null;
  email_normalized: string;
  resolved: boolean;
}

export interface BridgeRepairReport {
  scanned: number;
  resolved: number;
  unresolved: number;
  duplicatesSkipped: number;
  /** Enrollment IDs only — never email addresses. */
  unresolvedEnrollmentIds: string[];
  dryRun: boolean;
}

/** Lowercase + trim. The single normalisation rule for the whole bridge. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Find the CRM lead for an email. Read-only — never creates one. */
async function findLeadByEmail(emailNormalized: string): Promise<number | null> {
  if (!emailNormalized) return null;
  const lead = (await Lead.findOne({
    where: Lead.sequelize!.where(
      Lead.sequelize!.fn('lower', Lead.sequelize!.col('email')),
      emailNormalized,
    ),
    attributes: ['id'],
    order: [['id', 'ASC']],
  })) as { id: number } | null;
  return lead?.id ?? null;
}

/**
 * Resolve and persist the bridge for one enrollment.
 * Upserts the profile row so it is safe to call repeatedly.
 */
export async function resolveExplorerLead(
  enrollmentId: string,
  options: { dryRun?: boolean } = {},
): Promise<BridgeResolution> {
  const enrollment = (await Enrollment.findByPk(enrollmentId, {
    attributes: ['id', 'email'],
  })) as { id: string; email: string } | null;

  if (!enrollment) {
    return { enrollment_id: enrollmentId, lead_id: null, email_normalized: '', resolved: false };
  }

  const emailNormalized = normalizeEmail(enrollment.email);
  const leadId = await findLeadByEmail(emailNormalized);

  if (!options.dryRun) {
    const existing = await ExplorerJourneyProfile.findByPk(enrollmentId);
    if (existing) {
      await existing.update({ lead_id: leadId, email_normalized: emailNormalized } as any);
    } else {
      await ExplorerJourneyProfile.create({
        enrollment_id: enrollmentId,
        lead_id: leadId,
        email_normalized: emailNormalized,
        scores_computed_at: new Date(),
      } as any);
    }
  }

  return {
    enrollment_id: enrollmentId,
    lead_id: leadId,
    email_normalized: emailNormalized,
    resolved: leadId !== null,
  };
}

/** Active free Explorers, with the communityMember include pickBestEnrollment needs. */
async function loadActiveExplorers(): Promise<any[]> {
  return (await Enrollment.findAll({
    where: { enrollment_type: 'explorer', status: 'active' },
    attributes: ['id', 'email', 'enrollment_type', 'payment_status', 'created_at'],
    include: [{ model: CommunityMember, as: 'communityMember', attributes: ['mgmt_role'], required: false }],
  })) as any[];
}

/**
 * Resolve every active Explorer, deduping multiple enrollments per email down to
 * the canonical one. Returns counts plus the enrollment IDs that failed to
 * resolve so an operator can act on them.
 */
export async function repairAllExplorerBridges(
  options: { dryRun?: boolean } = {},
): Promise<BridgeRepairReport> {
  const dryRun = options.dryRun === true;
  const explorers = await loadActiveExplorers();

  // Group by normalised email so duplicates collapse to one canonical row.
  const byEmail = new Map<string, any[]>();
  for (const e of explorers) {
    const key = normalizeEmail(e.email);
    const bucket = byEmail.get(key);
    if (bucket) bucket.push(e);
    else byEmail.set(key, [e]);
  }

  let resolved = 0;
  let duplicatesSkipped = 0;
  const unresolvedEnrollmentIds: string[] = [];

  for (const [, candidates] of byEmail) {
    const canonical = candidates.length === 1 ? candidates[0] : pickBestEnrollment(candidates);
    if (candidates.length > 1) duplicatesSkipped += candidates.length - 1;
    if (!canonical) continue;

    const result = await resolveExplorerLead(canonical.id, { dryRun });
    if (result.resolved) resolved++;
    else unresolvedEnrollmentIds.push(canonical.id);
  }

  const report: BridgeRepairReport = {
    scanned: explorers.length,
    resolved,
    unresolved: unresolvedEnrollmentIds.length,
    duplicatesSkipped,
    unresolvedEnrollmentIds,
    dryRun,
  };

  // Enrollment IDs only, and the whole line passes through redactForLogs as a
  // belt-and-braces guard. An unresolved-learner report is exactly the place a
  // careless implementation would dump 154 email addresses into the log stream.
  console.log(
    redactForLogs(
      JSON.stringify({
        event: 'explorer.identity_bridge.repair',
        service: 'explorer-growth',
        outcome: report.unresolved === 0 ? 'success' : 'partial',
        ...report,
      }),
    ),
  );

  return report;
}

/** Explorers whose bridge is missing — the operator-facing health signal. */
export async function findUnbridgedExplorers(): Promise<string[]> {
  const rows = (await ExplorerJourneyProfile.findAll({
    where: { lead_id: { [Op.is]: null as any } },
    attributes: ['enrollment_id'],
  })) as unknown as Array<{ enrollment_id: string }>;
  return rows.map((r) => r.enrollment_id);
}
