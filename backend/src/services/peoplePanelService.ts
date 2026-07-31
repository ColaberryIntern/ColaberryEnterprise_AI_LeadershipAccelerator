import { Op, fn, col } from 'sequelize';
import { Enrollment, Cohort, CommunityMember, Sponsor, SponsorSeat } from '../models';
import { derivePresence } from './communityService';
import { isStaffOrMgmt } from './access/staffAccess';

// Role-aware "People" right-rail panel (flag-gated at the route; see
// PEOPLE_PANEL_ROLES_ENABLED). Presence is the SAME signal the Community tab and the
// cohort rail use — community_members.last_active_at run through derivePresence()
// (online <=90s, away <=10min, else offline) — so there is one heartbeat, not a
// second. The community vocabulary is online|away|offline; the rail speaks
// online|idle|offline, so 'away' maps to 'idle' here (matches cohortPresenceService).
//
// Read-only and idempotent (a GET with no side effects). Every query is bounded by an
// explicit LIMIT and, for the presence scans, by the 10-minute away window — a large
// roster can never fan out unbounded.
//
// Roles: STAFF (cross-cohort view) = the admin-assigned community role 'staff' (via
// isStaffEnrollment, the single source of truth) OR any non-null mgmt_role. Everyone
// else is STUDENT (cohort-scoped view). Resolution fail-SAFES to student, so a DB blip
// never leaks the wider staff view.

export type PanelPresence = 'online' | 'idle' | 'offline';

export interface PanelPerson {
  member_id: string | null; // community_members.id — null if the member row doesn't exist yet
  enrollment_id: string; // stable React key + DM/friend actions
  display_name: string;
  avatar_url: string | null;
  role: string; // community role: student | mentor | staff
  presence: PanelPresence;
  cohort_name?: string; // the person's class, when known
}

export interface PanelClass {
  cohort_id: string;
  name: string;
  members: number; // active enrollments in the cohort
  online: number; // members currently online/idle
}

export interface PanelBusiness {
  sponsor_id: string;
  company: string;
  seats: number; // redeemed seats (people who claimed a seat)
  online: number; // of those, how many are currently online/idle
}

export interface StaffPanel {
  viewer_role: 'staff';
  online: PanelPerson[]; // everyone online/idle across ALL cohorts (capped), online-first then most-recent
  classes: PanelClass[];
  businesses: PanelBusiness[];
}

export interface StudentPanel {
  viewer_role: 'student';
  my_class: PanelPerson[]; // the viewer's cohort-mates, online-first then name
  active_now: PanelPerson[]; // top-N recently-active people OUTSIDE the viewer's cohort
}

export type PeoplePanel = StaffPanel | StudentPanel;

// Bounds — every query is capped so a large roster can never fan out unbounded.
const ONLINE_LIST_CAP = 60; // staff "Online now" display cap
const RECENT_SCAN_CAP = 500; // recently-active scan window (drives online lists + counts)
const CLASSES_CAP = 40; // cohorts listed for staff
const SPONSORS_CAP = 40; // sponsors listed for staff
const ACTIVE_NOW_CAP = 10; // student "Active now" cap
const CLASS_ROSTER_CAP = 200; // student "My class" roster cap
const PRESENCE_AWAY_MS = 10 * 60_000; // matches communityService away window

const PRESENCE_RANK: Record<PanelPresence, number> = { online: 0, idle: 1, offline: 2 };

/** community online|away|offline -> rail online|idle|offline. */
export function toPanelPresence(raw: 'online' | 'away' | 'offline'): PanelPresence {
  return raw === 'away' ? 'idle' : raw;
}

/** Online first (online < idle < offline), then most-recently-active, then name. */
export function sortOnlineThenRecent<T extends { presence: PanelPresence; last: number; name: string }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      PRESENCE_RANK[a.presence] - PRESENCE_RANK[b.presence] || b.last - a.last || a.name.localeCompare(b.name),
  );
}

/** Online first, then name (A->Z). Used for the student "My class" roster. */
export function sortOnlineThenName<T extends { presence: PanelPresence; name: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => PRESENCE_RANK[a.presence] - PRESENCE_RANK[b.presence] || a.name.localeCompare(b.name),
  );
}

// Enriched recently-active row — the shared currency for every presence-derived
// section (staff online + class/business online counts, student active-now).
interface RecentRow {
  member_id: string | null;
  enrollment_id: string;
  name: string;
  avatar_url: string | null;
  role: string;
  cohort_id: string | null;
  cohort_name: string | null;
  last: number; // last_active_at epoch ms (0 if null)
  presence: PanelPresence; // derived + mapped
}

function toRecentRow(now: Date) {
  return (m: any): RecentRow => {
    const enr = m.enrollment ?? {};
    const cohort = enr.cohort ?? null;
    const lastRaw: Date | null = m.last_active_at ?? null;
    return {
      member_id: m.id ?? null,
      enrollment_id: enr.id ?? m.enrollment_id,
      name: enr.full_name || m.display_name || 'Member',
      avatar_url: enr.avatar_data_url ?? m.avatar_url ?? null,
      role: m.role ?? 'student',
      cohort_id: enr.cohort_id ?? null,
      cohort_name: cohort?.name ?? null,
      last: lastRaw ? new Date(lastRaw).getTime() : 0,
      presence: toPanelPresence(derivePresence(lastRaw, now)),
    };
  };
}

function toPerson(r: RecentRow): PanelPerson {
  return {
    member_id: r.member_id,
    enrollment_id: r.enrollment_id,
    display_name: r.name,
    avatar_url: r.avatar_url,
    role: r.role,
    presence: r.presence,
    ...(r.cohort_name ? { cohort_name: r.cohort_name } : {}),
  };
}

// Community members whose last_active_at falls inside the away window (i.e. the only
// people who can derive to online/idle at all). Ordered most-recent-first at the DB so
// a downstream slice is a true "top N by recency". Bounded by both the window and cap.
async function fetchRecentlyActive(now: Date, cap: number): Promise<RecentRow[]> {
  const threshold = new Date(now.getTime() - PRESENCE_AWAY_MS);
  const rows = await CommunityMember.findAll({
    where: { last_active_at: { [Op.gte]: threshold } },
    attributes: ['id', 'enrollment_id', 'display_name', 'avatar_url', 'role', 'last_active_at'],
    include: [
      {
        model: Enrollment,
        as: 'enrollment',
        attributes: ['id', 'full_name', 'avatar_data_url', 'cohort_id'],
        required: true,
        include: [{ model: Cohort, as: 'cohort', attributes: ['name'], required: false }],
      },
    ],
    order: [['last_active_at', 'DESC']],
    limit: cap,
  });
  return (rows as any[]).map(toRecentRow(now));
}

// STAFF = admin community role 'staff' OR any non-null mgmt_role, via the shared
// isStaffOrMgmt (fails safe to "not staff"), so a DB blip yields the strictly
// smaller, cohort-scoped student view rather than leaking a cross-cohort staff view.
const resolveIsStaff = isStaffOrMgmt;

// All cohorts with a live member count (active enrollments) + online count. Member
// counts come from ONE grouped query (not N per-cohort). Ordered online-first, then
// most members, then name — so the busiest classes lead.
async function buildClasses(onlineByCohort: Map<string, number>): Promise<PanelClass[]> {
  const [cohorts, memberCountRows] = await Promise.all([
    Cohort.findAll({ attributes: ['id', 'name'], order: [['created_at', 'DESC']], limit: CLASSES_CAP }),
    Enrollment.findAll({
      where: { status: 'active' },
      attributes: ['cohort_id', [fn('COUNT', col('id')), 'n']],
      group: ['cohort_id'],
      raw: true,
    }) as unknown as Promise<Array<{ cohort_id: string | null; n: string | number }>>,
  ]);
  const memberByCohort = new Map<string, number>();
  for (const row of memberCountRows) {
    if (row.cohort_id) memberByCohort.set(row.cohort_id, Number(row.n) || 0);
  }
  return (cohorts as any[])
    .map((c) => ({
      cohort_id: c.id as string,
      name: c.name as string,
      members: memberByCohort.get(c.id) ?? 0,
      online: onlineByCohort.get(c.id) ?? 0,
    }))
    .sort((a, b) => b.online - a.online || b.members - a.members || a.name.localeCompare(b.name));
}

// Sponsors (employers) with their redeemed-seat count + how many of those people are
// online now. Best-effort: the whole block is guarded, so if the sponsor/seat join is
// unavailable the panel simply omits businesses rather than failing. "seats" counts
// redeemed SponsorSeat rows (assigned to an enrollment); "online" is those enrollments
// present in the current online set.
async function buildBusinesses(onlineEnrollmentIds: Set<string>): Promise<PanelBusiness[]> {
  try {
    const sponsors = await Sponsor.findAll({
      attributes: ['id', 'company_name'],
      order: [['created_at', 'DESC']],
      limit: SPONSORS_CAP,
      include: [{ model: SponsorSeat, as: 'seats', attributes: ['assigned_enrollment_id', 'status'], required: false }],
    });
    return (sponsors as any[])
      .map((s) => {
        const seats: Array<{ assigned_enrollment_id: string | null }> = s.seats ?? [];
        const assigned = seats.filter((x) => x.assigned_enrollment_id);
        const online = assigned.filter((x) => onlineEnrollmentIds.has(x.assigned_enrollment_id as string)).length;
        return { sponsor_id: s.id as string, company: s.company_name as string, seats: assigned.length, online };
      })
      .sort((a, b) => b.online - a.online || b.seats - a.seats || a.company.localeCompare(b.company));
  } catch (err: any) {
    console.warn('[peoplePanel] businesses unavailable, omitting:', err?.message);
    return [];
  }
}

async function buildStaffPanel(now: Date): Promise<StaffPanel> {
  const recent = await fetchRecentlyActive(now, RECENT_SCAN_CAP);

  // Online now — everyone online/idle across all cohorts (a member in the away window
  // can still derive to 'offline' exactly at the boundary, so drop those), sorted
  // online-first then most-recent, capped for the rail.
  const onlineRows = recent.filter((r) => r.presence !== 'offline');
  const online = sortOnlineThenRecent(onlineRows).slice(0, ONLINE_LIST_CAP).map(toPerson);

  // Online-by-cohort + online-by-enrollment, from the same scan (no extra query).
  const onlineByCohort = new Map<string, number>();
  const onlineEnrollmentIds = new Set<string>();
  for (const r of onlineRows) {
    onlineEnrollmentIds.add(r.enrollment_id);
    if (r.cohort_id) onlineByCohort.set(r.cohort_id, (onlineByCohort.get(r.cohort_id) ?? 0) + 1);
  }

  const [classes, businesses] = await Promise.all([
    buildClasses(onlineByCohort),
    buildBusinesses(onlineEnrollmentIds),
  ]);

  return { viewer_role: 'staff', online, classes, businesses };
}

// The viewer's cohort-mates (excluding the viewer), each with a live presence state.
// Ordered online-first then name. Guests/explorers with no cohort get an empty list
// (and no DB round-trip) — the value for them lives in active_now.
async function buildMyClass(enrollmentId: string, cohortId: string | null, now: Date): Promise<PanelPerson[]> {
  if (!cohortId) return [];
  const rows = await Enrollment.findAll({
    where: { cohort_id: cohortId, status: 'active', id: { [Op.ne]: enrollmentId } },
    attributes: ['id', 'full_name', 'avatar_data_url'],
    include: [
      { model: CommunityMember, as: 'communityMember', attributes: ['id', 'avatar_url', 'role', 'last_active_at'], required: false },
      { model: Cohort, as: 'cohort', attributes: ['name'], required: false },
    ],
    limit: CLASS_ROSTER_CAP,
  });
  const enriched = (rows as any[]).map((e) => {
    const cm = e.communityMember ?? null;
    const presence = toPanelPresence(derivePresence(cm?.last_active_at ?? null, now));
    const name = e.full_name || 'Classmate';
    const person: PanelPerson = {
      member_id: cm?.id ?? null,
      enrollment_id: e.id,
      display_name: name,
      avatar_url: e.avatar_data_url ?? cm?.avatar_url ?? null,
      role: cm?.role ?? 'student',
      presence,
      ...(e.cohort?.name ? { cohort_name: e.cohort.name } : {}),
    };
    return { person, name, presence };
  });
  return sortOnlineThenName(enriched).map((x) => x.person);
}

// Top-N recently-active people OUTSIDE the viewer's cohort, most-recent first. The
// recency scan is already DB-ordered, so filtering out the viewer + their own cohort
// preserves order and a slice is a true top-N. For a cohortless viewer, "outside" is
// everyone, which is exactly the discovery value for those users.
async function buildActiveNow(enrollmentId: string, cohortId: string | null, now: Date): Promise<PanelPerson[]> {
  const recent = await fetchRecentlyActive(now, RECENT_SCAN_CAP);
  return recent
    .filter((r) => r.enrollment_id !== enrollmentId && (!cohortId || r.cohort_id !== cohortId))
    .slice(0, ACTIVE_NOW_CAP)
    .map(toPerson);
}

async function buildStudentPanel(enrollmentId: string, cohortId: string | null, now: Date): Promise<StudentPanel> {
  const [my_class, active_now] = await Promise.all([
    buildMyClass(enrollmentId, cohortId, now),
    buildActiveNow(enrollmentId, cohortId, now),
  ]);
  return { viewer_role: 'student', my_class, active_now };
}

/**
 * Role-aware People panel for the portal right rail. Staff/admin get a cross-cohort
 * view (online-now first, then classes, then businesses); students get a cohort-first
 * view (their class first, then recently-active people outside it). Read-only.
 */
export async function getPeoplePanel(
  enrollmentId: string,
  cohortId: string | null | undefined,
  now: Date = new Date(),
): Promise<PeoplePanel> {
  const isStaff = await resolveIsStaff(enrollmentId);
  return isStaff ? buildStaffPanel(now) : buildStudentPanel(enrollmentId, cohortId ?? null, now);
}
