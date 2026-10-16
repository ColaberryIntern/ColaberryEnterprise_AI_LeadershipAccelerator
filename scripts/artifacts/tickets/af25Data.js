/**
 * AF2.5's facts: who can be granted what, measured against production on 16 Oct 2026.
 *
 * NO GRANT IS ISSUED ANYWHERE IN THIS WORKSTREAM. The ticket says so plainly -- "Do not grant
 * anything until Ali has approved the seven by name on this ticket" -- and the measurement below
 * is the thing that lets him approve them by name instead of in bulk.
 *
 * Every row was resolved by DIRECT LOOKUP against the tables a sign-in actually touches, because
 * the ticket names "treating the roster as proof an account exists" as the way this goes wrong.
 */

const MEASURED_ON = '16 October 2026';
const SEV = { ok: '#2f7d32', watch: '#b26a00', bad: '#b3261e', ink: '#2d3748' };

/**
 * The grant is TWO changes per person, not one.
 *
 * `mgmtBridgeService` refuses unless `member.role === 'staff'` AND the mgmt_role is valid. All
 * seven are `student` today, so setting mgmt_role alone would grant exactly nothing and look like
 * it had worked -- the same shape as AF2.6, where a login existed and every route still 403'd.
 */
const GRANT_SHAPE = {
  one: "community_members.role: 'student' -> 'staff'",
  two: 'community_members.mgmt_role: NULL -> the domain role',
  gate: "mgmtBridgeService: if (!member || member.role !== 'staff' "
    + '|| !isMgmtRole(member.mgmt_role)) return null;',
};

/** What flipping someone to `staff` actually costs, read out of staffAccess.ts's own header. */
const STAFF_SIDE_EFFECTS = {
  buys: 'Full curriculum entitlement. `hasFullCurriculumAccess` treats staff as fully paid, so '
    + 'the paywall never limits them to the free-preview week.',
  doesNotBuy: 'Prerequisite gating. Neither `assertCardUnlocked` nor the feed lock overlay '
    + 'consults it, so a staff member sees the SAME padlocks and must complete the same '
    + 'prerequisites. Staff walk the curriculum as students do, deliberately.',
  watchThis: 'Cross-cohort visibility. `isStaffOrMgmt` is true for the staff role OR any non-null '
    + 'mgmt_role, which widens the People panel beyond their own cohort and lets them open a DM '
    + 'with anyone in it. This one triggers on the mgmt_role alone, so it cannot be avoided by '
    + 'granting only half.',
};

const V = {
  GRANTED: { key: 'GRANTED', label: 'GRANTED + verified', color: SEV.ok },
  CONFIRM: { key: 'CONFIRM', label: 'Confirm email first', color: SEV.watch },
  NO_SURFACE: { key: 'NO_SURFACE', label: 'No surface to grant', color: SEV.bad },
  HELD: { key: 'HELD', label: 'Held by AF6.2', color: SEV.bad },
};

/**
 * Executed 16 Oct 2026 on Ali's instruction: "execute approved grants but don't send out any
 * emails yet. Just collect the information and get it ready for monday."
 *
 * Four written, three deliberately not. No email, no invitation, no notification of any kind.
 */
const EXECUTED = {
  on: '16 October 2026',
  approvedBy: 'Ali Muwwakkil',
  rowsChanged: 4,
  notNotified: 'No email, invitation or notification has been sent to anybody. The grants exist '
    + 'in the database and the interns do not know about them yet.',
  /** Proof the row is not merely a row. */
  verification: [
    ['Bridge mints a token for all four', 'mintMgmtAdminToken returns a token whose sections '
      + 'match the role exactly; before the grant it returned null for all four, which is the '
      + 'control that makes this mean something'],
    ['The JWT claim agrees with the computed sections', 'decoded mgmt_role matches the granted '
      + 'role on all four; the array and the token that travels could disagree, so both checked'],
    ['Nobody reaches another intern surface', '3 of 3 refused, per person, asserted individually'],
    ['The three ungranted still mint NOTHING', 'Ruth, Sarbjit and Mihret all return null'],
    ['The three ungranted rows are byte-identical', 'role and mgmt_role compared before and after'],
  ],
};

/** What each granted intern needs on Monday. Collected, NOT sent. */
const MONDAY_PACK = {
  signIn: 'https://enterprise.colaberry.ai',
  path: 'Sign in to the portal with the address below, then open the Employee nav group and '
    + 'choose Management Portal. That bridges to the admin side with a token scoped to their '
    + 'sections only.',
  caveat: 'Nothing has been sent. These four can sign in today and reach their surface; they '
    + 'simply have not been told.',
};

/**
 * One row per intended builder, from `agent_domain_projects` rather than a roster document.
 * `cmRow` / `enrollments` are counts measured, not assumed.
 */
const PEOPLE = [
  {
    name: 'Sarbjit Kaur', domain: 'marketing', role: 'marketing',
    email: 'sarbjitsaini83@yahoo.com', cmRow: 1, enrollments: 2, verdict: V.CONFIRM,
    note: 'TWO enrollments, different addresses. The community_members row - and therefore any '
      + 'grant - hangs off the yahoo one. The second, sarbjitsaini716@gmail.com, created 4 Aug, '
      + 'has NO community_members row. If she signs in with the gmail address the grant reaches '
      + 'nothing and she is blocked on day one. Same class as the AF2.6 mismatch.',
  },
  {
    name: 'Quincy Nkwain Ninying', domain: 'platform', role: 'platform',
    email: 'qninying@gmail.com', cmRow: 1, enrollments: 1, verdict: V.GRANTED,
    note: '`system` is the widest-consequence section on the platform: tickets, reports, '
      + 'settings, events, automation. Worth approving deliberately rather than as one of a list.',
  },
  {
    name: 'Kalkidan Bezabeh', domain: 'admissions', role: 'lead_intake',
    email: 'kalkidankin@gmail.com', cmRow: 1, enrollments: 1, verdict: V.GRANTED,
    note: 'Gets lead ingestion WITHOUT the internship queue, which is what the new role was '
      + 'added for.',
  },
  {
    name: 'Tashima Diah', domain: 'internship', role: 'internship_review',
    email: 'tash.diah@gmail.com', cmRow: 1, enrollments: 1, verdict: V.GRANTED,
    note: 'The internship queue carries applicant resumes, phone numbers and interview '
      + 'transcripts. Narrowest role that reaches it, and it reaches nothing else.',
  },
  {
    name: 'Victoria Spencer-Auber', domain: 'sales', role: 'revenue',
    email: 'vesauber@gmail.com', cmRow: 1, enrollments: 1, verdict: V.GRANTED,
    note: 'Uses the pre-existing `revenue` role, which also carries `leads`, a narrower slice of '
      + 'the same group. No new role was needed.',
  },
  {
    name: 'Mihret Netsereab', domain: 'product_experience', role: null,
    email: 'mihretnetsereab@gmail.com', cmRow: 1, enrollments: 1, verdict: V.NO_SURFACE,
    note: 'No admin path prefix maps to product_experience, and a scoped role is deny-by-default '
      + 'on an unmapped path. There is nothing to grant. No page was invented to close this.',
  },
  {
    name: 'Ruth Kumera', domain: 'curriculum', role: 'curriculum',
    email: 'rtkumera@gmail.com', cmRow: 1, enrollments: 1, verdict: V.HELD,
    note: 'NOT GRANTED AND NOT ROUTED AROUND. Her onboarding is a separate decision recorded as '
      + 'AF6.2 and it has not been made. Her row is read in this artifact and written by nothing.',
  },
];

const GRANTED_PEOPLE = PEOPLE.filter((p) => p.verdict === V.GRANTED);
/** The sections each minted token actually carried, read back from the bridge. */
const MINTED_SECTIONS = {
  "platform": "dashboard, system",
  "lead_intake": "dashboard, lead_ingestion",
  "internship_review": "dashboard, internship",
  "revenue": "dashboard, leads, revenue"
};
const COUNTS = {
  people: PEOPLE.length,
  granted: GRANTED_PEOPLE.length,
  confirm: PEOPLE.filter((p) => p.verdict === V.CONFIRM).length,
  noSurface: PEOPLE.filter((p) => p.verdict === V.NO_SURFACE).length,
  held: PEOPLE.filter((p) => p.verdict === V.HELD).length,
  holdingAnyGrantToday: 0,
};

/** Ruth's state, snapshotted BEFORE anything, so "unchanged" is checkable afterwards. */
const RUTH_BEFORE = {
  enrollment_id: '1a59bd00-fc9d-43f8-bafc-13b16c72a659',
  email: 'rtkumera@gmail.com',
  active_project_id: 'NULL',
  community_role: 'student',
  mgmt_role: 'NULL',
  enrollments_matching: 1,
};

/**
 * The ticket asks for an assertion that cannot be made, and saying so is part of the deliverable.
 */
const UNASSERTABLE = {
  asked: 'Ruth Kumera state is unchanged: still onboarding_pending, active_project_id still NULL, '
    + 'updated_at still 2026-10-07. Asserted by query before and after.',
  problem: 'NO COLUMN NAMED `onboarding*` EXISTS ANYWHERE IN THIS DATABASE, and `enrollments` has '
    + 'no `updated_at` either - only `created_at`. Two of the three fields the criterion names '
    + 'cannot be queried, before or after.',
  whatIsCheckable: 'active_project_id IS NULL, community role, mgmt_role, and that exactly one '
    + 'enrollment matches her name. All four are captured above and are re-checkable verbatim.',
  recommendation: 'Amend the criterion to the four fields that exist. An assertion written '
    + 'against columns that do not exist cannot fail, which makes it worse than no assertion.',
};

const REVERSAL = {
  command: "UPDATE community_members SET role = 'student', mgmt_role = NULL "
    + 'WHERE display_name IN (<the approved names>) AND mgmt_role IS NOT NULL;',
  why: 'Exact because the baseline is exact: all seven are `student` with `mgmt_role` NULL right '
    + 'now, so the reversal is a restore to a measured state rather than a guess at one.',
  dryRun: 'Not yet run. It cannot be dry-run honestly until a grant exists to reverse, so it is '
    + 'listed as owed rather than claimed.',
};

const HEADLINE = `${COUNTS.granted} of the ${COUNTS.people} are GRANTED and verified. One needs `
  + 'an email confirmed, one has no surface to grant, Ruth stays held, and nobody has been '
  + 'told yet.';

const ASKED = 'Each of the seven interns can sign in on Monday and reach their own portal, '
  + 'department and agent, with the grant recorded and reversible.';
const DELIVERED = 'The grant plan, every account verified by direct lookup rather than from the '
  + 'roster, the two-change shape the grant actually needs, and three things that would have made '
  + 'it fail silently. No grant has been issued.';

module.exports = {
  MEASURED_ON, SEV, V, PEOPLE, GRANTED_PEOPLE, MINTED_SECTIONS, EXECUTED,
  MONDAY_PACK, COUNTS, GRANT_SHAPE, STAFF_SIDE_EFFECTS,
  RUTH_BEFORE, UNASSERTABLE, REVERSAL, HEADLINE, ASKED, DELIVERED,
};
