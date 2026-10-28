/**
 * The ten canonical AI employee domains — the single source every other part of this factory reads.
 *
 * Run `20261007-school-agent-factory` (T04), session CC-20261006-a4k7.
 *
 * WHAT CONSUMES THIS, AND WHY IT IS DATA RATHER THAN LOGIC
 *   - the `CHECK` constraint in `db/ensureAgentDomainProjectSchema.ts` (set-compared both ways)
 *   - `docs/project-lifecycle/architecture.md` §5.1b, which records this shape's entry point
 *   - the capability matrices, the provisioner, and the admin read surface
 * One list, consumed five ways. A second list is how a taxonomy drifts.
 *
 * EVERY MANAGER FIELD HERE WAS MEASURED IN PRODUCTION, not copied from a document.
 * `HUMAN_OWNERSHIP_MAP.md` is dated 2026-09-15 and had drifted: it recorded Swati Raman as having
 * no admin login, and she now has one. Its working figure of "three of ten managers can reach their
 * employee's surface" measured as **six of ten, across five distinct humans** on 2026-10-08
 * (`.loop-architect/runs/20261007-school-agent-factory/verified-domain-registry.json`). Writing ten
 * projects' blocker lists from the stale figure would have put the wrong gap on four of them.
 *
 * NOTHING HERE IS AN ASSIGNMENT OR A GRANT.
 * `intended_builder` is a plain name. It is deliberately NOT a foreign key to an enrollment,
 * because a `string` cannot be mistaken for an assignment by any code path, and
 * `enrollments.active_project_id` is precisely the field that must stay untouched. There is no
 * `builder`, `assigned_to`, `access_grants`, `active` or `granted` field, and a test asserts none
 * can be added.
 */

/** The ten, and only the ten. The `CHECK` constraint encodes exactly this set. */
export const AGENT_DOMAIN_KEYS = [
  'learner_success',
  'curriculum',
  'marketing',
  'product_experience',
  'admissions',
  'sales',
  'internship',
  'website',
  'platform',
  'executive',
] as const;

export type AgentDomainKey = typeof AGENT_DOMAIN_KEYS[number];

/**
 * Planning state of an intended builder. Mirrors the vocabulary prescribed by
 * `INTENDED_INTERN_ROSTER_2026-10-07.md`. `onboarding_pending` exists so Ruth Kumera's outstanding
 * step stays visible in the data rather than only in prose — an earlier draft dropped it.
 */
export type IntendedBuilderState = 'verified_active' | 'onboarding_pending' | 'unassigned';

/**
 * The entry point this project shape registers under. `discovery`'s own prerequisite is "project
 * registered against a tenant; entry point recorded" (`architecture.md:83`), and
 * `architecture.md:109` forbids a silent bypass — so this literal is explicit, labelled, and
 * recorded in the ADR. A test asserts it appears there, so code and document cannot drift apart.
 */
export const AGENT_DOMAIN_ENTRY_POINT = 'agent_domain_factory_provisioner';

/** The Colaberry organisation of record. Three organisations share the name; this is the one that
 *  holds every manager below. Measured, not picked. */
export const AGENT_DOMAIN_ORG_ID = 'acdfa378-3613-4e6f-850f-1bbfb9d3e789';

export interface AgentDomain {
  readonly seq: number;
  readonly domain_key: AgentDomainKey;
  readonly title: string;
  /** `org_members.id`. Never a name, never an email — an actor reference, per the trust convention. */
  readonly manager_identity_id: string;
  readonly manager_email: string;
  /** MEASURED: does an `admin_users` row exist on the manager's email? */
  readonly can_reach_surface: boolean;
  /** Named, specific, and never a generic block. Null only when there is genuinely no gap. */
  readonly blocker: string | null;
  /** `ai_agents.id`, for the two domains that have an AI employee today. Read-only in this build. */
  readonly agent_id: string | null;
  /** PLANNING ONLY. A name. Never an assignment, never a foreign key. */
  readonly intended_builder: string | null;
  readonly intended_builder_state: IntendedBuilderState;
  /** Capability names this domain will REQUEST. Requested is not granted. */
  readonly requested_capabilities: readonly string[];
}

const MANAGER_NO_LOGIN = (name: string, extra: string): string =>
  `manager_has_no_admin_login: ${name} has an org_members row but no admin_users row, so they cannot `
  + `open their employee's Agent Detail or Talk surface. ${extra}`;

export const AGENT_DOMAINS: readonly AgentDomain[] = Object.freeze([
  {
    seq: 1,
    domain_key: 'learner_success',
    title: 'Learner Success (Reese)',
    manager_identity_id: 'f179c222-284e-4180-a335-cca9e4918b2e',
    manager_email: 'ali@colaberry.com',
    can_reach_surface: true,
    blocker: null,
    agent_id: '97dfbdf4-0e5b-4d86-b060-f4087b61f311',
    intended_builder: null,
    intended_builder_state: 'unassigned',
    requested_capabilities: [],
  },
  {
    seq: 2,
    domain_key: 'curriculum',
    title: 'Curriculum, Learning & Certification (Dara)',
    manager_identity_id: '5db87b51-4554-4e52-93d7-c61f9887352c',
    manager_email: 'swati@colaberry.com',
    can_reach_surface: true,
    blocker: null,
    agent_id: '089e4fd5-0187-46a3-9c56-5db68ef21cca',
    intended_builder: 'Ruth Kumera',
    intended_builder_state: 'onboarding_pending',
    requested_capabilities: [],
  },
  {
    seq: 3,
    domain_key: 'marketing',
    title: 'Marketing Intelligence & Brand',
    manager_identity_id: '4e255894-ac0b-4367-ae06-27459ea05f66',
    manager_email: 'sohail@colaberry.com',
    can_reach_surface: true,
    blocker: null,
    agent_id: null,
    intended_builder: 'Sarbjit Kaur',
    intended_builder_state: 'verified_active',
    requested_capabilities: [],
  },
  {
    seq: 4,
    domain_key: 'product_experience',
    title: 'Product Experience & UI/UX',
    manager_identity_id: 'd2efd70b-4016-4ad6-bd7b-cf0610c93370',
    manager_email: 'aleem@colaberry.com',
    can_reach_surface: false,
    blocker: MANAGER_NO_LOGIN(
      'Mohammed Abdul Aleem',
      'Needs an admin_users row with a scoped mgmt_role, or an alternative surface.',
    ),
    agent_id: null,
    intended_builder: 'Mihret Netsereab',
    intended_builder_state: 'verified_active',
    requested_capabilities: [],
  },
  {
    seq: 5,
    domain_key: 'admissions',
    title: 'Admissions & Applicant Experience',
    manager_identity_id: '1fbb5316-1381-4b8a-81a8-3a7325b39d5f',
    manager_email: 'taiwooludimimu@gmail.com',
    // CORRECTED 2026-10-15. This was `false` and that was WRONG.
    //
    // The original finding said "Taiwo has no admin_users row". He has one:
    // `taiwo@colaberry.com`, role `admin`, created 2026-09-18, display_name "Taiwo Oludimimu".
    // Role `admin` is a LEGACY FULL ADMIN -- `adminAllowedSections` returns ALL_SECTIONS for it,
    // and `requireAdmin` accepts it -- so he reaches all nine admissions routes today.
    //
    // THE FALSE NEGATIVE CAME FROM AN EMAIL MISMATCH, which is worth recording because it is a
    // reusable trap: his `org_members` row carries his PERSONAL address
    // (taiwooludimimu@gmail.com) while he signs in with his WORK one (taiwo@colaberry.com).
    // Matching org_members.email against admin_users.email finds nothing and reads as "no login".
    // The reliable link is `org_members.enrollment_id` -> `enrollments.email`, a real foreign key
    // populated on 29 of 29 rows. `platform_identity_id` would be the proper identity column and
    // is NULL on all 29, so it cannot carry this yet.
    //
    // What is still true, and what is not:
    //   (a) WRONG AS ORIGINALLY STATED. He has a login, and it is a full admin login.
    //   (b) TRUE BUT NOT A BLOCKER FOR HIM. `/api/admin/admissions` really does appear ZERO times
    //       in `mgmtSectionGate` PATH_SECTION. It does not block him, because all nine routes in
    //       `admissionsRoutes.ts` carry `requireAdmin`, NOT `requireSection` -- so the section
    //       gate is not what decides them. It would become a blocker the moment those routes move
    //       to `requireSection`, and there is no `admissions` SECTION KEY to map to either (the
    //       14 keys in SECTION_KEYS do not include one). Recorded for whoever does that work.
    //   (c) STILL TRUE. The mgmt ROLE literally named `admissions` grants the `internship`
    //       section and `mgmtSectionGate.ts:100` attributes it to Dhee -- a role NAME meaning
    //       something other than the domain it is named after. Recorded so nobody later "fixes"
    //       the domain owner to match the role name and undoes the owner's decision.
    can_reach_surface: true,
    blocker: null,
    agent_id: null,
    intended_builder: 'Kalkidan Bezabeh',
    intended_builder_state: 'verified_active',
    requested_capabilities: [],
  },
  {
    seq: 6,
    domain_key: 'sales',
    title: 'Sales, Enrollment & Subscriptions',
    manager_identity_id: 'b4dddf0b-6750-4398-83cf-b70b64ed6b48',
    manager_email: 'roselen@colaberry.com',
    can_reach_surface: false,
    blocker: MANAGER_NO_LOGIN('Roselyn', 'Her team is Customer Support, which the ownership map left blank.'),
    agent_id: null,
    intended_builder: 'Victoria Spencer-Auber',
    intended_builder_state: 'verified_active',
    requested_capabilities: [],
  },
  {
    seq: 7,
    domain_key: 'internship',
    title: 'Internship & Career Readiness',
    manager_identity_id: 'bbf01827-c005-5cb2-8a96-903fe8ddadac',
    manager_email: 'dhee@colaberry.com',
    can_reach_surface: true,
    blocker: null,
    agent_id: null,
    intended_builder: 'Tashima Diah',
    intended_builder_state: 'verified_active',
    requested_capabilities: [],
  },
  {
    seq: 8,
    domain_key: 'website',
    title: 'Website Portfolio & Conversion',
    manager_identity_id: '5ebf1a6f-874f-4e39-a014-828d744eda15',
    manager_email: 'saitejesh@colaberry.com',
    can_reach_surface: true,
    blocker: null,
    agent_id: null,
    intended_builder: null,
    intended_builder_state: 'unassigned',
    requested_capabilities: [],
  },
  {
    seq: 9,
    domain_key: 'platform',
    title: 'Platform Automation & Reliability',
    manager_identity_id: '3df017df-affa-49ab-884f-a99a4bd2ef4e',
    manager_email: 'kesetebirhan@gmail.com',
    can_reach_surface: false,
    blocker: MANAGER_NO_LOGIN(
      'Kesetebirhan Delele',
      'Already the reports_to target for workforce_intelligence_engine.',
    ),
    agent_id: null,
    intended_builder: 'Quincy Nkwain Ninying',
    intended_builder_state: 'verified_active',
    requested_capabilities: [],
  },
  {
    seq: 10,
    domain_key: 'executive',
    title: 'Executive Intelligence & Governance',
    manager_identity_id: 'f179c222-284e-4180-a335-cca9e4918b2e',
    manager_email: 'ali@colaberry.com',
    can_reach_surface: true,
    blocker: null,
    agent_id: null,
    intended_builder: null,
    intended_builder_state: 'unassigned',
    requested_capabilities: [],
  },
] as const);

/** Fields that would make this list an assignment or a grant rather than a plan. None may exist. */
export const FORBIDDEN_AUTHORITY_FIELDS = Object.freeze([
  'builder',
  'assigned_to',
  'access_grants',
  'enrollment_id',
  'active',
  'granted',
  'autonomy_level',
  'tools_granted',
]);

export function getAgentDomain(key: string): AgentDomain | undefined {
  return AGENT_DOMAINS.find((d) => d.domain_key === key);
}

/**
 * The human name a domain's `projects.name` carries. AF2.7 item 3.
 *
 * The provisioner used to write `name: plan.domain_key`, so all ten landed in production reading
 * `admissions`, `product_experience`, `learner_success` — snake_case machine keys on a surface
 * where every other student project carries a real name (CoreOps, HosPulse, Ambit, Ledgerly).
 * Interns see this on their own project page and on the admin Delivery board.
 *
 * It lives HERE, beside the titles, because two callers must agree exactly: the provisioner that
 * names a NEW row, and the repair that renames the ten rows already in production. Two copies of
 * this rule is how the repair silently writes a different name than the next provision does.
 *
 * Falls back to the key for an unknown domain rather than throwing: a name is cosmetic, and a
 * provisioner that refuses to create a project over a display string would be the worse failure.
 */
export function domainProjectName(key: string): string {
  return getAgentDomain(key)?.title ?? key;
}

/** Domains whose manager genuinely cannot reach the surface. Measured, not averaged. */
export function blockedDomains(): readonly AgentDomain[] {
  return AGENT_DOMAINS.filter((d) => !d.can_reach_surface);
}

/**
 * A domain is assignable only when its intended builder is verified active. `onboarding_pending`
 * never is — which is what keeps Ruth Kumera's outstanding step from being routed around.
 * This reports planning readiness; it grants nothing and is not an assignment.
 */
export function isAssignablePlanningState(d: AgentDomain): boolean {
  return d.intended_builder_state === 'verified_active';
}
