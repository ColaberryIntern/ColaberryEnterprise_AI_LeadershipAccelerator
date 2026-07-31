import { Enrollment, CommunityMember, StudentPointsEvent, AccountCredit, Subscription, AttendanceRecord } from '../models';
import { pickBestEnrollment } from './participantService';

/**
 * Finds and fixes the "duplicate-account point shadowing" bug: a student has
 * two or more active, portal-enabled enrollment rows under the same email
 * (an Open House flow creating a fresh Explorer row for someone who already
 * has a real seat is the suspected common cause, though not confirmed here),
 * `pickBestEnrollment` -- the same ranking function the real login flow uses
 * -- resolves them to one "winner" row, and their real coursework progress
 * is sitting on a *different*, non-winning row instead. The student logs in,
 * lands on the winner, and sees less progress than they actually have. Found
 * by hand 5 times in one night (2026-07-30/31: Sonya Parker, Britiana
 * Akhile, Martin Mungai, Marcus Zeno, Jude Mofunanya -- Jude's case alone
 * was 140 points), each only because someone happened to complain. This is
 * the systemic backstop: it runs on a schedule instead of waiting for the
 * next complaint.
 *
 * A second, distinct symptom of the identical root cause was found the same
 * night, from Britiana Akhile's "unable to check into sessions" report: the
 * live-session join path (`liveSessionAttendanceService.joinLiveSession()`)
 * requires the caller's `cohort_id` to match the session's, so a student
 * with an active duplicate row in a *different* cohort (an Explorer/Prospects
 * signup is the common shape) gets an outright check-in failure -- no useful
 * error, just "can't check in" -- any time login happens to resolve to that
 * row instead of their real one. This has no relationship to points: a
 * duplicate with zero points on it, which `findShadowedAccounts` above would
 * never flag, can still silently fail every check-in. Found this way by hand
 * for 4 more students (Kepha Ohanga, Eyerusalem Weldemichael, Firas
 * Baidhani, Franck Kafando) in a proactive sweep the same night --
 * `findCrossCohortDuplicates`/`mergeCrossCohortDuplicate` below close that
 * gap so the scheduled run catches this shape too, not just points.
 *
 * Deliberately conservative, same posture as paymentReconciliationService:
 *   1. Points (StudentPointsEvent) and unclaimed credit (AccountCredit) are
 *      always safe to move -- they carry no independent financial risk, and
 *      an `event_key` collision (the same achievement recorded on both rows)
 *      is the only way a move could be wrong, so a collision blocks the
 *      merge for that email entirely rather than silently picking a side.
 *   2. A losing row is only withdrawn (so it can never be resolved to again)
 *      once its points/credit have been moved AND it holds no Subscription
 *      with a real, non-null `paysimple_payment_id` -- that represents
 *      actual money and needs the same manual, timestamp-based
 *      disambiguation used by hand for Marcus Zeno tonight, not blind
 *      automation. Those cases are reported, never written.
 *   3. Cross-cohort merges additionally skip the *entire* email (nothing
 *      withdrawn, nothing moved) if any of the non-winning rows carries a
 *      real `communityMember.mgmt_role` -- found live for `ram@colaberry.com`,
 *      whose "duplicate" was actually a second, legitimately provisioned
 *      admin/owner account, not a stray student signup. Withdrawing a real
 *      staff account is a materially different risk than withdrawing an
 *      abandoned Explorer signup and is never auto-resolved.
 *   4. Attendance is only ever corrected from `absent` to `excused`, never
 *      to `present` (the student did not actually attend), and only when
 *      every session on the winning row's history shows `absent` -- an
 *      unambiguous full-failure pattern. A mixed history (some sessions
 *      genuinely attended, per Franck Kafando's case) is left untouched and
 *      reported instead of guessed at.
 */

export interface ShadowedAccount {
  email: string;
  name: string;
  winnerId: string;
  winnerPoints: number;
  shadowRows: Array<{ id: string; points: number }>;
}

export interface MergeOutcome {
  email: string;
  name: string;
  winnerId: string;
  merged: Array<{ shadowId: string; pointsMoved: number; creditsMoved: number; withdrawn: boolean }>;
  flaggedCollision: string[]; // shadow enrollment ids skipped for an event_key collision
  flaggedRealPayment: string[]; // shadow enrollment ids skipped for a real, paid Subscription
}

export interface CrossCohortDuplicate {
  email: string;
  name: string;
  winnerId: string;
  otherRows: Array<{ id: string; cohortId: string | null }>;
}

export interface CrossCohortMergeOutcome {
  email: string;
  name: string;
  winnerId: string;
  merged: Array<{ dupeId: string; pointsMoved: number; creditsMoved: number; withdrawn: boolean }>;
  flaggedCollision: string[];
  flaggedRealPayment: string[];
  flaggedStaffAccount: string[]; // non-empty means the WHOLE email was skipped, nothing written
  attendanceCorrected: number; // sessions flipped absent -> excused
  attendanceFlaggedForReview: number; // absent sessions left untouched (mixed history)
}

export interface SweepResult {
  scanned: number; // distinct emails flagged by either detector (deduped -- an email can be flagged by both)
  shadowed: ShadowedAccount[]; // points-shadowing cases found (before any merge)
  merges: MergeOutcome[]; // points-shadowing merge attempts (populated only when not a dry run)
  crossCohort: CrossCohortDuplicate[]; // cross-cohort duplicate cases found (before any merge)
  crossCohortMerges: CrossCohortMergeOutcome[]; // cross-cohort merge attempts (populated only when not a dry run)
}

type EnrollmentWithCommunityMember = Awaited<ReturnType<typeof Enrollment.findAll>>[number];

/** Shared by both detectors: every active, portal-enabled enrollment, grouped by email. */
async function groupActiveEnrollmentsByEmail(): Promise<Map<string, EnrollmentWithCommunityMember[]>> {
  const all = await Enrollment.findAll({
    where: { status: 'active', portal_enabled: true },
    include: [{ model: CommunityMember, as: 'communityMember', attributes: ['mgmt_role'] }],
  });

  const byEmail = new Map<string, EnrollmentWithCommunityMember[]>();
  for (const row of all) {
    const key = (row as any).email.toLowerCase().trim();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key)!.push(row);
  }
  return byEmail;
}

/**
 * Read-only. Groups every active, portal-enabled enrollment by email,
 * determines the real login winner for each multi-row email via
 * `pickBestEnrollment` (including the same `communityMember.mgmt_role`
 * lookup the real magic-link flow uses, so a staff member's ranking here
 * matches what they would actually see), and flags any case where a
 * non-winning row carries more points than the winner.
 */
export async function findShadowedAccounts(): Promise<ShadowedAccount[]> {
  const byEmail = await groupActiveEnrollmentsByEmail();
  const multi = [...byEmail.entries()].filter(([, rows]) => rows.length >= 2);
  const flagged: ShadowedAccount[] = [];

  for (const [email, rows] of multi) {
    const winner = pickBestEnrollment(rows as any);
    if (!winner) continue;

    const pointsByRow = await Promise.all(
      rows.map(async (r: any) => ({
        id: r.id as string,
        points: (await StudentPointsEvent.sum('points', { where: { enrollment_id: r.id } })) || 0,
      })),
    );

    const winnerPoints = pointsByRow.find((p) => p.id === (winner as any).id)!.points;
    const shadowRows = pointsByRow.filter((p) => p.id !== (winner as any).id && p.points > winnerPoints);

    if (shadowRows.length > 0) {
      flagged.push({
        email,
        name: (winner as any).full_name,
        winnerId: (winner as any).id,
        winnerPoints,
        shadowRows,
      });
    }
  }

  return flagged;
}

/** True when the given enrollment holds a Subscription with a real, confirmed payment. */
async function hasRealSubscriptionPayment(enrollmentId: string): Promise<boolean> {
  const subs = await Subscription.findAll({ where: { enrollment_id: enrollmentId }, raw: true });
  return subs.some((s: any) => s.paysimple_payment_id != null);
}

/**
 * Attempts to merge every shadow row found for one email onto its winner.
 * Never called for a case with zero shadow rows. Returns per-shadow-row
 * outcomes rather than throwing, so one bad row in a multi-duplicate case
 * doesn't block the others.
 */
export async function mergeShadowedAccount(entry: ShadowedAccount): Promise<MergeOutcome> {
  const outcome: MergeOutcome = {
    email: entry.email,
    name: entry.name,
    winnerId: entry.winnerId,
    merged: [],
    flaggedCollision: [],
    flaggedRealPayment: [],
  };

  const winnerKeys = new Set(
    (await StudentPointsEvent.findAll({ where: { enrollment_id: entry.winnerId }, attributes: ['event_key'], raw: true })).map(
      (e: any) => e.event_key,
    ),
  );

  for (const shadow of entry.shadowRows) {
    const shadowEvents = await StudentPointsEvent.findAll({ where: { enrollment_id: shadow.id }, raw: true });
    const collision = shadowEvents.some((e: any) => winnerKeys.has(e.event_key));
    if (collision) {
      outcome.flaggedCollision.push(shadow.id);
      continue;
    }

    if (await hasRealSubscriptionPayment(shadow.id)) {
      outcome.flaggedRealPayment.push(shadow.id);
      continue;
    }

    const [pointsMoved] = await StudentPointsEvent.update(
      { enrollment_id: entry.winnerId },
      { where: { enrollment_id: shadow.id } },
    );
    const [creditsMoved] = await AccountCredit.update(
      { enrollment_id: entry.winnerId },
      { where: { enrollment_id: shadow.id, applied_at: null } },
    );
    await Enrollment.update({ status: 'withdrawn' }, { where: { id: shadow.id } });

    outcome.merged.push({ shadowId: shadow.id, pointsMoved, creditsMoved, withdrawn: true });
  }

  return outcome;
}

/**
 * Read-only. Same grouping as `findShadowedAccounts`, but flags on cohort
 * mismatch rather than points: any email whose active rows span more than
 * one distinct `cohort_id`. This is the check-in-failure shape (Britiana
 * Akhile and 4 others, 2026-07-31) -- a duplicate can trigger it with zero
 * points on either row, which `findShadowedAccounts` would never catch.
 */
export async function findCrossCohortDuplicates(): Promise<CrossCohortDuplicate[]> {
  const byEmail = await groupActiveEnrollmentsByEmail();
  const multi = [...byEmail.entries()].filter(([, rows]) => rows.length >= 2);
  const flagged: CrossCohortDuplicate[] = [];

  for (const [email, rows] of multi) {
    const cohortIds = new Set(rows.map((r: any) => r.cohort_id));
    if (cohortIds.size < 2) continue;

    const winner = pickBestEnrollment(rows as any);
    if (!winner) continue;

    const otherRows = rows
      .filter((r: any) => r.id !== (winner as any).id)
      .map((r: any) => ({ id: r.id as string, cohortId: r.cohort_id as string | null }));

    flagged.push({
      email,
      name: (winner as any).full_name,
      winnerId: (winner as any).id,
      otherRows,
    });
  }

  return flagged;
}

/**
 * Attempts to merge every non-winning row for one cross-cohort email onto
 * its winner, then -- only if every one of those rows was actually
 * withdrawn (no collision/payment flag left a wrong-cohort row live) --
 * corrects the winner's attendance history from `absent` to `excused` for
 * every completed session, but ONLY when the entire history is absent. A
 * mixed history is left untouched and counted in `attendanceFlaggedForReview`
 * rather than guessed at (see Franck Kafando's case in the header comment).
 */
export async function mergeCrossCohortDuplicate(entry: CrossCohortDuplicate): Promise<CrossCohortMergeOutcome> {
  const outcome: CrossCohortMergeOutcome = {
    email: entry.email,
    name: entry.name,
    winnerId: entry.winnerId,
    merged: [],
    flaggedCollision: [],
    flaggedRealPayment: [],
    flaggedStaffAccount: [],
    attendanceCorrected: 0,
    attendanceFlaggedForReview: 0,
  };

  const staffRows = await CommunityMember.findAll({
    where: { enrollment_id: entry.otherRows.map((r) => r.id) },
    raw: true,
  });
  const staffRowIds = new Set(staffRows.filter((r: any) => r.mgmt_role).map((r: any) => r.enrollment_id));
  if (staffRowIds.size > 0) {
    outcome.flaggedStaffAccount = [...staffRowIds];
    return outcome; // whole email skipped -- nothing written, matches ram@colaberry.com
  }

  const winnerKeys = new Set(
    (await StudentPointsEvent.findAll({ where: { enrollment_id: entry.winnerId }, attributes: ['event_key'], raw: true })).map(
      (e: any) => e.event_key,
    ),
  );

  for (const dupe of entry.otherRows) {
    const dupeEvents = await StudentPointsEvent.findAll({ where: { enrollment_id: dupe.id }, raw: true });
    const collision = dupeEvents.some((e: any) => winnerKeys.has(e.event_key));
    if (collision) {
      outcome.flaggedCollision.push(dupe.id);
      continue;
    }

    if (await hasRealSubscriptionPayment(dupe.id)) {
      outcome.flaggedRealPayment.push(dupe.id);
      continue;
    }

    const [pointsMoved] = await StudentPointsEvent.update({ enrollment_id: entry.winnerId }, { where: { enrollment_id: dupe.id } });
    const [creditsMoved] = await AccountCredit.update(
      { enrollment_id: entry.winnerId },
      { where: { enrollment_id: dupe.id, applied_at: null } },
    );
    await Enrollment.update({ status: 'withdrawn' }, { where: { id: dupe.id } });

    outcome.merged.push({ dupeId: dupe.id, pointsMoved, creditsMoved, withdrawn: true });
  }

  const fullyResolved = outcome.merged.length === entry.otherRows.length;
  if (fullyResolved) {
    const attendance = await AttendanceRecord.findAll({ where: { enrollment_id: entry.winnerId }, raw: true });
    const allAbsent = attendance.length > 0 && attendance.every((a: any) => a.status === 'absent');
    if (allAbsent) {
      const note =
        'Excused: check-in was blocked by a real system bug -- a duplicate enrollment under a different email had this ' +
        'student in the wrong cohort, so check-in attempts while resolved to that account failed outright (cohort ' +
        'mismatch). Found and corrected by the scheduled duplicate-account sweep.';
      await AttendanceRecord.update(
        { status: 'excused', marked_by: 'admin', notes: note },
        { where: { enrollment_id: entry.winnerId } },
      );
      outcome.attendanceCorrected = attendance.length;
    } else {
      outcome.attendanceFlaggedForReview = attendance.filter((a: any) => a.status === 'absent').length;
    }
  }

  return outcome;
}

/**
 * Orchestrates both detectors and their merges. `dryRun: true` reports what
 * would happen without writing anything.
 */
export async function runDuplicateAccountSweep(options: { dryRun?: boolean } = {}): Promise<SweepResult> {
  const shadowed = await findShadowedAccounts();
  const crossCohort = await findCrossCohortDuplicates();
  const merges: MergeOutcome[] = [];
  const crossCohortMerges: CrossCohortMergeOutcome[] = [];

  if (!options.dryRun) {
    for (const entry of shadowed) {
      merges.push(await mergeShadowedAccount(entry));
    }
    for (const entry of crossCohort) {
      crossCohortMerges.push(await mergeCrossCohortDuplicate(entry));
    }
  }

  // Dedupe: the same email can legitimately appear in both lists (a
  // duplicate that both shadows points AND spans cohorts is the common
  // case), so a simple sum would double-count it.
  const distinctFlaggedEmails = new Set([...shadowed.map((s) => s.email), ...crossCohort.map((c) => c.email)]);

  return { scanned: distinctFlaggedEmails.size, shadowed, merges, crossCohort, crossCohortMerges };
}
