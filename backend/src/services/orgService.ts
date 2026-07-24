// Free-trial Organization / Manager layer. A manager registers free → gets a
// management org AND their own free student enrollment (dual account) → invites
// teammates (free member accounts, tagged with a team/department) → reads
// aggregated metrics for the org over the EXISTING student ledgers.
//
// Idempotency: registerManager and inviteMembers are keyed on email (via
// createFreeAccount's email idempotency + the org_members (org_id, email) unique
// index), so re-running either lands the same state with no duplicate rows and
// no duplicate invite emails. Failure-first: metric reads degrade a section to
// null/empty rather than failing the whole request; invite email sends are
// best-effort and never fail the invite.

import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Organization, OrgMember, Enrollment } from '../models';
import { createFreeAccount } from './freeSignupService';
import { sendOrgInviteEmail } from './emailService';
import { assertMemberInOrg } from '../middlewares/orgAuth';

const INVITE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LEVEL_RANKS = 9; // student_level ranks 0..8

// ── Pure helpers ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-case, trim, de-dupe, and keep only syntactically valid emails. */
export function normalizeEmails(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  for (const e of list) {
    const clean = String(e || '').toLowerCase().trim();
    if (clean && EMAIL_RE.test(clean)) seen.add(clean);
  }
  return Array.from(seen);
}

/** Derive a human display name from an email local-part (invited members have no
 *  name yet, and createFreeAccount requires a non-empty full_name). */
export function displayNameFromEmail(email: string): string {
  const local = String(email || '').split('@')[0] || 'Teammate';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Teammate';
}

/** Run a parameterized SELECT and return the raw rows. Guards empty id-lists so
 *  `IN (:ids)` never renders an invalid `IN ()`. */
async function selectRows<T = any>(sql: string, replacements: Record<string, unknown>): Promise<T[]> {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT }) as Promise<T[]>;
}

/** The enrollment ids on an org's roster (members that have a linked enrollment). */
async function orgEnrollmentIds(orgId: string): Promise<string[]> {
  const members = await OrgMember.findAll({ where: { org_id: orgId }, attributes: ['enrollment_id'] });
  return members.map((m) => m.enrollment_id).filter((id): id is string => !!id);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface RegisterManagerInput {
  name: string;
  company?: string | null;
  email: string;
}

export interface RegisterManagerResult {
  jwt: string;
  organization: { id: string; name: string; owner_enrollment_id: string };
  enrollment: { id: string; full_name: string; email: string; tier: string };
}

export interface OrgOverview {
  member_count: number;
  level_distribution: Array<{ rank: number; count: number }>;
  avg_readiness: number;
  builder_xp_by_week: Array<{ week: string; xp: number }>;
  evidence_this_week: number;
  attendance_rate: number; // 0..1
  evaluations_passed_this_month: number;
  level_ups_last_30d: number;
}

export interface RosterMember {
  enrollment_id: string;
  name: string;
  team: string | null;
  level: string;
  rank: number;
  readiness: number; // 0..100
  builder_xp_week: number;
  streak: number;
  total_points: number; // canonical points-economy total (student_points_events)
}

export interface MemberDetail {
  enrollment_id: string;
  name: string;
  team: string | null;
  engagement: unknown | null;
  skill_xp: unknown | null;
  readiness: unknown | null;
  promotion: { level: string; rank: number; next_level: string | null; gaps: string[] } | null;
  skill_genome: unknown | null;
  section_progress: unknown | null;
  evidence_by_source: Array<{ source_type: string; count: number }>;
  evaluations: Array<{ week_number: number; overall_score: number | null; progress_summary: string | null; evaluated_at: string }>;
  project_count: number;
}

export interface FeedItem {
  who: string;
  kind: 'promotion' | 'evidence' | 'evaluation' | 'artifact' | 'streak';
  text: string;
  when: string; // ISO
  enrollment_id: string;
}

// ── Register a manager (dual account) ────────────────────────────────────────

export async function registerManager(input: RegisterManagerInput): Promise<RegisterManagerResult> {
  const name = (input.name || '').trim();
  const email = (input.email || '').toLowerCase().trim();
  if (!name || !email) throw new Error('name and email are required');

  // 1) The manager's own free student enrollment (idempotent by email).
  const free = await createFreeAccount({ full_name: name, email });
  const ownerEnrollmentId = free.enrollment.id;
  const orgName = (input.company || '').trim() || name;

  // 2) Find-or-create the management org (idempotent on owner_enrollment_id).
  const [organization] = await Organization.findOrCreate({
    where: { owner_enrollment_id: ownerEnrollmentId },
    defaults: { owner_enrollment_id: ownerEnrollmentId, name: orgName } as any,
  });

  // 3) Find-or-create the manager's roster row (idempotent on (org_id, email)).
  await OrgMember.findOrCreate({
    where: { org_id: organization.id, email },
    defaults: {
      org_id: organization.id,
      enrollment_id: ownerEnrollmentId,
      email,
      role: 'manager',
      invite_status: 'active',
      joined_at: new Date(),
    } as any,
  });

  return {
    jwt: free.jwt,
    organization: { id: organization.id, name: organization.name, owner_enrollment_id: organization.owner_enrollment_id },
    enrollment: free.enrollment,
  };
}

// ── Invite teammates (free member accounts) ──────────────────────────────────

export interface InviteMembersInput {
  emails: unknown;
  team?: string | null;
}

export async function inviteMembers(
  orgId: string,
  managerEnrollmentId: string,
  input: InviteMembersInput,
): Promise<OrgMember[]> {
  const emails = normalizeEmails(input.emails);
  const team = typeof input.team === 'string' && input.team.trim() ? input.team.trim().slice(0, 120) : null;
  const organization = await Organization.findByPk(orgId);
  const results: OrgMember[] = [];

  for (const email of emails) {
    // 1) Free member account (idempotent by email).
    const free = await createFreeAccount({ full_name: displayNameFromEmail(email), email });
    const enrollmentId = free.enrollment.id;

    // 2) Roster row (idempotent on (org_id, email)).
    const [member, created] = await OrgMember.findOrCreate({
      where: { org_id: orgId, email },
      defaults: {
        org_id: orgId,
        enrollment_id: enrollmentId,
        email,
        team,
        role: 'member',
        invite_status: 'invited',
        invited_by: managerEnrollmentId,
      } as any,
    });

    // Reconcile a pre-existing row that never got its enrollment linked (still
    // idempotent — same end state on re-run). Never downgrade an active member.
    const patch: Record<string, unknown> = {};
    if (!member.enrollment_id && enrollmentId) patch.enrollment_id = enrollmentId;
    if (team && member.team !== team) patch.team = team;
    if (Object.keys(patch).length) await member.update(patch);

    // 3) Best-effort invite email — only on first creation (no re-send storms),
    //    and never fatal to the invite.
    if (created) {
      try {
        const token = crypto.randomUUID();
        const enr = await Enrollment.findByPk(enrollmentId);
        if (enr) {
          await (enr as any).update({
            portal_token: token,
            portal_token_expires_at: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
          });
          await sendOrgInviteEmail({
            to: email,
            fullName: (enr as any).full_name || displayNameFromEmail(email),
            orgName: organization?.name || 'your team',
            token,
          });
        }
      } catch (err: any) {
        console.warn('[Org] invite email skipped (non-fatal):', err?.message);
      }
    }

    results.push(member);
  }

  return results;
}

// ── Aggregated overview ──────────────────────────────────────────────────────

export async function getOverview(orgId: string): Promise<OrgOverview> {
  const ids = await orgEnrollmentIds(orgId);
  const empty: OrgOverview = {
    member_count: ids.length,
    level_distribution: Array.from({ length: LEVEL_RANKS }, (_, rank) => ({ rank, count: 0 })),
    avg_readiness: 0,
    builder_xp_by_week: [],
    evidence_this_week: 0,
    attendance_rate: 0,
    evaluations_passed_this_month: 0,
    level_ups_last_30d: 0,
  };
  if (ids.length === 0) return empty;

  const [levels, readiness, xpWeeks, evidence, attendance, evals, levelUps] = await Promise.all([
    selectRows<{ rank: number; count: number }>(
      `SELECT rank, COUNT(*)::int AS count FROM student_level WHERE enrollment_id IN (:ids) GROUP BY rank`,
      { ids },
    ),
    selectRows<{ avg: number | null }>(
      `SELECT AVG(architect_readiness) AS avg FROM student_level WHERE enrollment_id IN (:ids)`,
      { ids },
    ),
    selectRows<{ week: string; xp: number }>(
      `SELECT to_char(created_at, 'IYYY-IW') AS week, COALESCE(SUM(amount),0)::int AS xp
         FROM xp_events
        WHERE stream='builder' AND enrollment_id IN (:ids) AND created_at >= NOW() - INTERVAL '8 weeks'
        GROUP BY 1 ORDER BY 1`,
      { ids },
    ),
    selectRows<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM evidence_records
        WHERE enrollment_id IN (:ids) AND created_at >= NOW() - INTERVAL '7 days'`,
      { ids },
    ),
    selectRows<{ present: number; total: number }>(
      `SELECT COUNT(*) FILTER (WHERE status='present')::int AS present, COUNT(*)::int AS total
         FROM attendance_records WHERE enrollment_id IN (:ids)`,
      { ids },
    ),
    selectRows<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM runtime_assessment_attempts
        WHERE enrollment_id IN (:ids) AND kind='evaluation' AND passed=true
          AND submitted_at >= date_trunc('month', NOW())`,
      { ids },
    ),
    selectRows<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM student_level
        WHERE enrollment_id IN (:ids) AND promoted_at >= NOW() - INTERVAL '30 days'`,
      { ids },
    ),
  ]);

  const dist = empty.level_distribution.map((d) => ({ ...d }));
  for (const row of levels) {
    const r = Number(row.rank);
    if (r >= 0 && r < LEVEL_RANKS) dist[r].count = Number(row.count);
  }
  const att = attendance[0] || { present: 0, total: 0 };

  return {
    member_count: ids.length,
    level_distribution: dist,
    avg_readiness: Math.round(Number(readiness[0]?.avg ?? 0)),
    builder_xp_by_week: xpWeeks.map((w) => ({ week: w.week, xp: Number(w.xp) })),
    evidence_this_week: Number(evidence[0]?.count ?? 0),
    attendance_rate: att.total > 0 ? Number((att.present / att.total).toFixed(3)) : 0,
    evaluations_passed_this_month: Number(evals[0]?.count ?? 0),
    level_ups_last_30d: Number(levelUps[0]?.count ?? 0),
  };
}

// ── Roster ───────────────────────────────────────────────────────────────────

export async function getRoster(orgId: string): Promise<RosterMember[]> {
  const members = await OrgMember.findAll({
    where: { org_id: orgId },
    include: [{ model: Enrollment, as: 'enrollment', required: false }],
    order: [['created_at', 'ASC']],
  });

  const ids = members.map((m) => m.enrollment_id).filter((id): id is string => !!id);
  if (ids.length === 0) {
    return members.map((m) => ({
      enrollment_id: m.enrollment_id || '',
      name: m.email,
      team: m.team,
      level: 'builder',
      rank: 0,
      readiness: 0,
      builder_xp_week: 0,
      streak: 0,
      total_points: 0,
    }));
  }

  const [levels, xp, streaks, points] = await Promise.all([
    selectRows<{ enrollment_id: string; level_slug: string; rank: number; architect_readiness: number }>(
      `SELECT enrollment_id, level_slug, rank, architect_readiness FROM student_level WHERE enrollment_id IN (:ids)`,
      { ids },
    ),
    selectRows<{ enrollment_id: string; xp: number }>(
      `SELECT enrollment_id, COALESCE(SUM(amount),0)::int AS xp FROM xp_events
        WHERE stream='builder' AND enrollment_id IN (:ids) AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY enrollment_id`,
      { ids },
    ),
    selectRows<{ enrollment_id: string; streak: number }>(
      `SELECT enrollment_id, COUNT(*)::int AS streak FROM student_points_events
        WHERE event_type='daily_streak' AND enrollment_id IN (:ids) GROUP BY enrollment_id`,
      { ids },
    ),
    // Canonical points-economy total (same ledger the HUD's "N pts" badge sums),
    // all streams and all time — this is a person's ACTIVE standing, distinct
    // from the builder-only weekly velocity above.
    selectRows<{ enrollment_id: string; total: number }>(
      `SELECT enrollment_id, COALESCE(SUM(points),0)::int AS total FROM student_points_events
        WHERE enrollment_id IN (:ids) GROUP BY enrollment_id`,
      { ids },
    ),
  ]);

  const levelMap = new Map(levels.map((l) => [l.enrollment_id, l]));
  const xpMap = new Map(xp.map((x) => [x.enrollment_id, Number(x.xp)]));
  const streakMap = new Map(streaks.map((s) => [s.enrollment_id, Number(s.streak)]));
  const pointsMap = new Map(points.map((p) => [p.enrollment_id, Number(p.total)]));

  return members.map((m) => {
    const enr: any = (m as any).enrollment;
    const lvl = m.enrollment_id ? levelMap.get(m.enrollment_id) : undefined;
    return {
      enrollment_id: m.enrollment_id || '',
      name: enr?.full_name || m.email,
      team: m.team,
      level: lvl?.level_slug || 'builder',
      rank: Number(lvl?.rank ?? 0),
      readiness: Math.round(Number(lvl?.architect_readiness ?? 0)),
      builder_xp_week: m.enrollment_id ? (xpMap.get(m.enrollment_id) ?? 0) : 0,
      streak: m.enrollment_id ? (streakMap.get(m.enrollment_id) ?? 0) : 0,
      total_points: m.enrollment_id ? (pointsMap.get(m.enrollment_id) ?? 0) : 0,
    };
  });
}

// ── Per-member drill-down (reuses existing per-student services) ─────────────

export async function getMemberDetail(orgId: string, enrollmentId: string): Promise<MemberDetail> {
  const member = await assertMemberInOrg(orgId, enrollmentId); // throws 404 if not in org
  const enr: any = await Enrollment.findByPk(enrollmentId);

  const detail: MemberDetail = {
    enrollment_id: enrollmentId,
    name: enr?.full_name || member.email,
    team: member.team,
    engagement: null,
    skill_xp: null,
    readiness: null,
    promotion: null,
    skill_genome: null,
    section_progress: null,
    evidence_by_source: [],
    evaluations: [],
    project_count: 0,
  };

  // Engagement / skill_xp / readiness (points drill-down).
  try {
    const { getPointsDrilldown } = await import('./pointsDrilldownService');
    const dd = await getPointsDrilldown(enrollmentId);
    detail.engagement = dd.engagement;
    detail.skill_xp = dd.skill_xp;
    detail.readiness = dd.readiness;
  } catch (err: any) { console.warn('[Org] drilldown degraded:', err?.message); }

  // Promotion status (gaps to next level).
  try {
    const { getPromotionStatus } = await import('./progression/promotionService');
    const st = await getPromotionStatus(enrollmentId);
    detail.promotion = { level: st.level, rank: st.rank, next_level: st.next_level, gaps: st.gaps };
  } catch (err: any) { console.warn('[Org] promotion degraded:', err?.message); }

  // Skill genome.
  try {
    const { getSkillGenome } = await import('./skillGenomeService');
    detail.skill_genome = await getSkillGenome(enrollmentId);
  } catch (err: any) { console.warn('[Org] genome degraded:', err?.message); }

  // Pre/post assessment growth — needs the student's latest (program, week).
  try {
    const latest = await selectRows<{ program_id: string; week: number }>(
      `SELECT program_id, week FROM runtime_assessment_attempts
        WHERE enrollment_id = :id AND program_id IS NOT NULL AND week IS NOT NULL
        ORDER BY submitted_at DESC NULLS LAST LIMIT 1`,
      { id: enrollmentId },
    );
    if (latest[0]) {
      const { getSectionProgress } = await import('./runtime/assessmentService');
      detail.section_progress = await getSectionProgress(enrollmentId, latest[0].program_id, latest[0].week);
    }
  } catch (err: any) { console.warn('[Org] section progress degraded:', err?.message); }

  // Evidence counts by source_type.
  try {
    detail.evidence_by_source = await selectRows<{ source_type: string; count: number }>(
      `SELECT source_type, COUNT(*)::int AS count FROM evidence_records
        WHERE enrollment_id = :id GROUP BY source_type ORDER BY count DESC`,
      { id: enrollmentId },
    );
  } catch (err: any) { console.warn('[Org] evidence degraded:', err?.message); }

  // Weekly architect evaluations.
  try {
    const rows = await selectRows<{ week_number: number; overall_score: number | null; progress_summary: string | null; evaluated_at: Date }>(
      `SELECT week_number, overall_score, progress_summary, evaluated_at FROM architect_evaluations
        WHERE enrollment_id = :id ORDER BY week_number DESC LIMIT 12`,
      { id: enrollmentId },
    );
    detail.evaluations = rows.map((r) => ({
      week_number: Number(r.week_number),
      overall_score: r.overall_score == null ? null : Number(r.overall_score),
      progress_summary: r.progress_summary ?? null,
      evaluated_at: new Date(r.evaluated_at).toISOString(),
    }));
  } catch (err: any) { console.warn('[Org] evaluations degraded:', err?.message); }

  // Projects.
  try {
    const rows = await selectRows<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM projects WHERE enrollment_id = :id`,
      { id: enrollmentId },
    );
    detail.project_count = Number(rows[0]?.count ?? 0);
  } catch (err: any) { console.warn('[Org] projects degraded:', err?.message); }

  return detail;
}

// ── Activity feed ─────────────────────────────────────────────────────────────

export async function getFeed(orgId: string): Promise<FeedItem[]> {
  const members = await OrgMember.findAll({
    where: { org_id: orgId },
    include: [{ model: Enrollment, as: 'enrollment', required: false }],
  });
  const ids = members.map((m) => m.enrollment_id).filter((id): id is string => !!id);
  if (ids.length === 0) return [];

  const nameFor = new Map<string, string>();
  for (const m of members) {
    if (m.enrollment_id) nameFor.set(m.enrollment_id, (m as any).enrollment?.full_name || m.email);
  }
  const who = (id: string) => nameFor.get(id) || 'A teammate';

  const [promotions, evidence, evaluations, artifacts, streaks] = await Promise.all([
    selectRows<{ enrollment_id: string; level_slug: string; promoted_at: Date }>(
      `SELECT enrollment_id, level_slug, promoted_at FROM student_level
        WHERE enrollment_id IN (:ids) AND promoted_at IS NOT NULL ORDER BY promoted_at DESC LIMIT 15`,
      { ids },
    ),
    selectRows<{ enrollment_id: string; source_type: string; created_at: Date }>(
      `SELECT enrollment_id, source_type, created_at FROM evidence_records
        WHERE enrollment_id IN (:ids) ORDER BY created_at DESC LIMIT 15`,
      { ids },
    ),
    selectRows<{ enrollment_id: string; submitted_at: Date }>(
      `SELECT enrollment_id, submitted_at FROM runtime_assessment_attempts
        WHERE enrollment_id IN (:ids) AND kind='evaluation' AND passed=true AND submitted_at IS NOT NULL
        ORDER BY submitted_at DESC LIMIT 15`,
      { ids },
    ),
    selectRows<{ enrollment_id: string; title: string; kind: string; created_at: Date }>(
      `SELECT enrollment_id, title, kind, created_at FROM runtime_portfolio_artifacts
        WHERE enrollment_id IN (:ids) ORDER BY created_at DESC LIMIT 15`,
      { ids },
    ),
    selectRows<{ enrollment_id: string; created_at: Date }>(
      `SELECT enrollment_id, created_at FROM student_points_events
        WHERE enrollment_id IN (:ids) AND event_type='daily_streak' ORDER BY created_at DESC LIMIT 15`,
      { ids },
    ),
  ]);

  const items: FeedItem[] = [];
  for (const p of promotions) {
    items.push({ who: who(p.enrollment_id), kind: 'promotion', text: `was promoted to ${p.level_slug}`, when: new Date(p.promoted_at).toISOString(), enrollment_id: p.enrollment_id });
  }
  for (const e of evidence) {
    items.push({ who: who(e.enrollment_id), kind: 'evidence', text: `shipped ${e.source_type.replace(/_/g, ' ')} evidence`, when: new Date(e.created_at).toISOString(), enrollment_id: e.enrollment_id });
  }
  for (const ev of evaluations) {
    items.push({ who: who(ev.enrollment_id), kind: 'evaluation', text: `passed a weekly evaluation`, when: new Date(ev.submitted_at).toISOString(), enrollment_id: ev.enrollment_id });
  }
  for (const a of artifacts) {
    items.push({ who: who(a.enrollment_id), kind: 'artifact', text: `published "${a.title}"`, when: new Date(a.created_at).toISOString(), enrollment_id: a.enrollment_id });
  }
  for (const s of streaks) {
    items.push({ who: who(s.enrollment_id), kind: 'streak', text: `kept their daily streak going`, when: new Date(s.created_at).toISOString(), enrollment_id: s.enrollment_id });
  }

  return items
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .slice(0, 15);
}
