import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getTotalsForEnrollments, levelForPoints } from './pointsService';
import { IS_STAFF_SQL } from './staffDetection';
import { pickBestDuplicate } from './emailIdentity';

/* ------------------------------------------------------------------ */
/*  Explorer roster — the drill-down list behind the "Explorer" bucket */
/*  on /admin/revenue's subscriber-tenure funnel. Scoped to the exact  */
/*  same population as that bucket's count (active, non-staff Explorers */
/*  with no $50 Open House deposit — depositors and staff get their own */
/*  buckets elsewhere), each tagged with their existing points-based    */
/*  engagement level so this can feed campaign targeting without        */
/*  inventing a new scoring scheme.                                      */
/* ------------------------------------------------------------------ */

export interface ExplorerRosterRow {
  enrollment_id: string;
  full_name: string;
  email: string;
  signed_up_at: string | null;
  points: number;
  level: number;
  level_name: string;
}

interface ExplorerRow {
  enrollment_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
}

export async function getExplorerRoster(): Promise<ExplorerRosterRow[]> {
  // enrolled_at is only ever set on conversion to a paying member
  // (subscriptionService.grantMembership) — always null for a pure Explorer,
  // so created_at (when the Open House signup created this row) is the real
  // "how long have they been an Explorer" signal.
  const rows = (await sequelize.query(
    `SELECT e.id AS enrollment_id, e.full_name, e.email, e.created_at
       FROM enrollments e
       LEFT JOIN community_members cm ON cm.enrollment_id = e.id
       LEFT JOIN LATERAL (
         SELECT enrollment_id FROM account_credits
          WHERE enrollment_id = e.id AND reason = 'open_house_deposit' AND status = 'available'
          LIMIT 1
       ) ac ON true
      WHERE e.enrollment_type = 'explorer' AND e.status = 'active' AND ac.enrollment_id IS NULL AND NOT ${IS_STAFF_SQL}`,
    { type: QueryTypes.SELECT }
  )) as ExplorerRow[];

  // A Gmail "+alias" re-signup or an unresolved exact-email duplicate must not
  // show up as two Explorers — collapse by email identity, keeping the
  // earliest signup (no subscription/payment data exists at this stage to
  // rank by, so tenure order is the only meaningful tiebreak).
  const deduped = pickBestDuplicate(rows, (r) => ({
    email: r.email, hasActiveSubscription: false, paymentStatusPaid: false, isExplorer: true, createdAt: r.created_at,
  }));

  const totals = await getTotalsForEnrollments(deduped.map((r) => r.enrollment_id));

  const roster: ExplorerRosterRow[] = deduped.map((r) => {
    const points = totals.get(r.enrollment_id) ?? 0;
    const { level, name } = levelForPoints(points);
    return {
      enrollment_id: r.enrollment_id,
      full_name: r.full_name || r.email || '—',
      email: r.email || '',
      signed_up_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      points,
      level,
      level_name: name,
    };
  });

  roster.sort((a, b) => b.points - a.points); // most engaged first — most actionable for outreach
  return roster;
}
