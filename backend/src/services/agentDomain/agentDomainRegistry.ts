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
 * THIS LIST NO LONGER ANSWERS WHETHER A MANAGER CAN REACH THEIR EMPLOYEE'S SURFACE.
 *
 * It used to, via `can_reach_surface` and `blocker`, under a comment that read "MEASURED: does an
 * `admin_users` row exist on the manager's email?" Both halves were wrong, and the way they were
 * wrong is worth keeping here.
 *
 * The QUESTION was wrong. An `admin_users` row is the legacy wide login. The scoped path is a
 * staff `community_members` row carrying a `mgmt_role` and needs no `admin_users` row at all, so
 * three managers were recorded as locked out while holding a working login.
 *
 * And "MEASURED" meant measured ONCE, on 2026-10-08, then frozen into source. The paragraph that
 * used to sit here described catching `HUMAN_OWNERSHIP_MAP.md` in precisely that state — stale,
 * confident, wrong on four domains — and then this file froze its own answer the same way, one
 * level down. The literals flowed outward into the database (the provisioner writes them), the
 * portal, the phase report, the story prose handed to builders, and an audit that reported them
 * as fact. Four separate surfaces agreed with each other because they all read one stale constant.
 *
 * A constant cannot hold the answer to a question about live access. Reachability is computed by
 * `resolveManagerReach` in `managerReachResolver.ts`, from the access chain a request actually
 * travels. What remains below is a static CATALOG: identifiers, titles, sequence, planning state.
 * If a field's honest answer can change without this file changing, it does not belong here.
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
  /**
   * NOT the access key, and not authoritative. `requireAgentManagerOrAdmin` matches the token
   * against the `org_members.email` belonging to `manager_identity_id` above, which is what every
   * live reader uses. No production code path reads this field; it is retained for display only.
   * The `platform` entry still carries an address its org row does not, which is the reason
   * nothing should start trusting it.
   */
  readonly manager_email: string;
  /** `ai_agents.id`, for the two domains that have an AI employee today. Read-only in this build. */
  readonly agent_id: string | null;
  /** PLANNING ONLY. A name. Never an assignment, never a foreign key. */
  readonly intended_builder: string | null;
  readonly intended_builder_state: IntendedBuilderState;
  /** Capability names this domain will REQUEST. Requested is not granted. */
  readonly requested_capabilities: readonly string[];
}


export const AGENT_DOMAINS: readonly AgentDomain[] = Object.freeze([
  {
    seq: 1,
    domain_key: 'learner_success',
    title: 'Learner Success (Reese)',
    manager_identity_id: 'f179c222-284e-4180-a335-cca9e4918b2e',
    manager_email: 'ali@colaberry.com',
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

/*
 * `blockedDomains()` used to live here, filtering the catalog by a hardcoded `can_reach_surface`.
 * It is gone rather than rewritten: a static list cannot answer which managers are blocked, and
 * the only caller it ever had was its own test. `resolveManagerReach` in
 * `managerReachResolver.ts` answers that question from live data.
 */

/**
 * A domain is assignable only when its intended builder is verified active. `onboarding_pending`
 * never is — which is what keeps Ruth Kumera's outstanding step from being routed around.
 * This reports planning readiness; it grants nothing and is not an assignment.
 */
export function isAssignablePlanningState(d: AgentDomain): boolean {
  return d.intended_builder_state === 'verified_active';
}
