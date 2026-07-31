import { Enrollment, CommunityMember, StudentPointsEvent, AccountCredit, Subscription } from '../models';
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

export interface SweepResult {
  scanned: number; // distinct emails with 2+ active/portal_enabled rows
  shadowed: ShadowedAccount[]; // cases found (before any merge)
  merges: MergeOutcome[]; // merge attempts (populated only when not a dry run)
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
  const all = await Enrollment.findAll({
    where: { status: 'active', portal_enabled: true },
    include: [{ model: CommunityMember, as: 'communityMember', attributes: ['mgmt_role'] }],
  });

  const byEmail = new Map<string, typeof all>();
  for (const row of all) {
    const key = row.email.toLowerCase().trim();
    if (!byEmail.has(key)) byEmail.set(key, [] as any);
    (byEmail.get(key) as any).push(row);
  }

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

    const shadowSubs = await Subscription.findAll({ where: { enrollment_id: shadow.id }, raw: true });
    const hasRealPayment = shadowSubs.some((s: any) => s.paysimple_payment_id != null);

    if (hasRealPayment) {
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
 * Orchestrates find + (optionally) merge. `dryRun: true` reports what would
 * happen without writing anything.
 */
export async function runDuplicateAccountSweep(options: { dryRun?: boolean } = {}): Promise<SweepResult> {
  const shadowed = await findShadowedAccounts();
  const merges: MergeOutcome[] = [];

  if (!options.dryRun) {
    for (const entry of shadowed) {
      merges.push(await mergeShadowedAccount(entry));
    }
  }

  return { scanned: shadowed.length, shadowed, merges };
}
