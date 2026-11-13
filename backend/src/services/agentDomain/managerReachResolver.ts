/**
 * Resolve, from live data, whether each domain's manager can open their employee's Agent Detail.
 *
 * ## Why this exists at all
 *
 * `agentDomainRegistry.ts` used to answer this with two hand-typed fields per domain,
 * `can_reach_surface` and `blocker`, under a comment reading *"MEASURED: does an `admin_users`
 * row exist on the manager's email?"*
 *
 * Both halves of that were wrong.
 *
 * The question was wrong: an `admin_users` row is the LEGACY wide login. The scoped path is a
 * staff `community_members` row carrying a `mgmt_role`, which needs no `admin_users` row at all,
 * and three managers held one while being recorded as locked out.
 *
 * And "MEASURED" described a measurement taken once, on 2026-10-08, then frozen into source. The
 * registry's own docblock describes catching `HUMAN_OWNERSHIP_MAP.md` in exactly this state —
 * stale, confident, and wrong on four domains — and then froze its own answer the same way one
 * level down. The literals flowed outward from there into the database (the provisioner writes
 * them), into the portal, into the phase report, into the story prose handed to builders, and
 * into an audit that reported them as fact.
 *
 * A constant cannot hold the answer to a question about live access. This module is the answer
 * being computed instead, in one place, so the surfaces cannot disagree with each other.
 *
 * ## One query, deliberately
 *
 * The audit and the admin read surfaces both call this. They used to have separate ideas of what
 * reachability meant, and that is how two surfaces end up contradicting each other in front of
 * the same person.
 */

import { QueryTypes, type Sequelize } from 'sequelize';
import {
  assessManagerReach,
  type ManagerAccessFacts,
  type ManagerReachVerdict,
} from '../access/agentManagerReach';

/** Raw facts per domain. No judgement here: that lives in the pure module. */
interface ManagerFactRow {
  domain_key: string;
  recorded_can_reach: boolean | null;
  org_member_email: string | null;
  agents_reporting: number | string | null;
  bridge_mgmt_role: string | null;
  bridge_extra_sections: unknown;
  bridge_token_email: string | null;
  legacy_role: string | null;
  legacy_token_email: string | null;
}

/**
 * The three inputs the access chain actually turns on, per domain.
 *
 *   - `org_members.email`, the EXACT string `requireAgentManagerOrAdmin` matches the token
 *     against. `manager_identity_id` holds an `org_members.id` — not a platform identity, which
 *     a zero-row join established before anything was concluded from it.
 *   - the staff `community_members` row behind the bridge mint, plus the enrollment email its
 *     token would carry. A person may hold several enrollments and only one is the staff one.
 *   - the legacy `admin_users` row, whose token carries no `mgmt_role` and therefore skips the
 *     section gate entirely.
 *
 * Plus `agents_reporting`: how many agents name them as `reports_to`. The real downstream test is
 * per agent, so this is a necessary condition only, and the pure module documents it as such.
 */
const FACTS_SQL = `
  SELECT p.domain_key,
         p.manager_can_reach AS recorded_can_reach,
         om.email            AS org_member_email,
         (SELECT COUNT(*) FROM ai_agents a
           WHERE a.reports_to_org_member_id::text = om.id::text) AS agents_reporting,
         b.mgmt_role           AS bridge_mgmt_role,
         b.mgmt_extra_sections AS bridge_extra_sections,
         b.email               AS bridge_token_email,
         au.role               AS legacy_role,
         au.email              AS legacy_token_email
    FROM agent_domain_projects p
    LEFT JOIN org_members om ON om.id::text = p.manager_identity_id::text
    LEFT JOIN LATERAL (
      SELECT cm.mgmt_role, cm.mgmt_extra_sections, e.email
        FROM enrollments e
        JOIN community_members cm ON cm.enrollment_id = e.id
       WHERE LOWER(e.email) = LOWER(om.email)
         AND cm.role = 'staff'
         AND cm.mgmt_role IS NOT NULL
       ORDER BY (cm.mgmt_role IS NOT NULL) DESC
       LIMIT 1
    ) b ON TRUE
    LEFT JOIN admin_users au ON LOWER(au.email) = LOWER(om.email)
   ORDER BY p.domain_key
`;

/** Turn one raw row into the pure module's input. */
export function factsFromRow(r: ManagerFactRow): ManagerAccessFacts {
  return {
    domainKey: String(r.domain_key),
    orgMemberEmail: r.org_member_email ?? null,
    agentsReporting: Number(r.agents_reporting ?? 0),
    bridge: r.bridge_mgmt_role && r.bridge_token_email
      ? {
        mgmtRole: r.bridge_mgmt_role,
        // A Postgres text[] that may be null or empty. Guarded rather than cast: the pure
        // module drops anything that is not a real section key, so an unexpected value
        // narrows access rather than widening it.
        extraSections: Array.isArray(r.bridge_extra_sections)
          ? r.bridge_extra_sections.map((x) => String(x))
          : [],
        tokenEmail: r.bridge_token_email,
      }
      : null,
    legacy: r.legacy_role && r.legacy_token_email
      ? { role: r.legacy_role, tokenEmail: r.legacy_token_email }
      : null,
    recordedCanReach: r.recorded_can_reach === true,
  };
}

/**
 * Every domain's verdict, keyed by `domain_key`.
 *
 * A Map rather than an array because every caller looks one domain up by key, and an array makes
 * each of them write the same `find`.
 */
export async function resolveManagerReach(
  sequelize: Sequelize,
): Promise<Map<string, ManagerReachVerdict>> {
  const rows = await sequelize.query<ManagerFactRow>(FACTS_SQL, { type: QueryTypes.SELECT });
  const out = new Map<string, ManagerReachVerdict>();
  for (const row of rows ?? []) {
    const verdict = assessManagerReach(factsFromRow(row));
    out.set(verdict.domainKey, verdict);
  }
  return out;
}

/**
 * The verdict for one domain when the map has no row for it.
 *
 * Reported as a refusal with a named blocker, never as `true`. A domain missing from
 * `agent_domain_projects` is a provisioning gap, and defaulting it to reachable would turn an
 * unprovisioned domain into a silent all-clear — the same failure as the constant this replaces,
 * which is why `blocker` is never null here.
 */
export function unknownReach(domainKey: string): ManagerReachVerdict {
  return {
    domainKey,
    canReach: false,
    via: null,
    blocker: 'org_member_missing',
    detail: 'no agent_domain_projects row for this domain, so no manager relationship can be resolved.',
    // There is no stored row to agree or disagree with, so neither is claimed.
    recordedCanReach: false,
    disagreesWithRecord: false,
  };
}

/** One domain's verdict, with the never-silently-true default applied. */
export function reachFor(
  map: Map<string, ManagerReachVerdict>,
  domainKey: string,
): ManagerReachVerdict {
  return map.get(domainKey) ?? unknownReach(domainKey);
}
