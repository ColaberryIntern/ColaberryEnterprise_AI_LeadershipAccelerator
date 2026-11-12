/**
 * Can a domain's manager actually open their employee's Agent Detail page?
 *
 * ## Why this is computed and not read
 *
 * `agent_domain_projects` already carries the answer: `manager_can_reach`, plus a paragraph of
 * `manager_blocker` prose. On 12 November 2026 both were measured against production, and three
 * of the ten rows were simply false:
 *
 *   - `platform`, `product_experience` and `sales` were recorded `false` with the blocker
 *     "has an org_members row but no admin_users row, so they cannot open their employee's
 *     Agent Detail". All three managers could in fact reach it. An `admin_users` row is NOT a
 *     requirement — it is the LEGACY wide login. The scoped path is a staff `community_members`
 *     row carrying a `mgmt_role`, which `mintMgmtAdminToken` turns into an admin token, and all
 *     three had one (`admin`, `product_experience`, `revenue`).
 *
 * A stored boolean describing a live access decision is a cache with no invalidation. It was
 * written once, by hand, from a reading of the code, and it then outlived both the code and the
 * data it described. Two separate conclusions were drawn from it during that audit and both were
 * wrong, in opposite directions, before anyone checked the chain itself.
 *
 * The row that is right for the wrong reason is worth as much as the three that are wrong.
 * `website`'s manager is recorded `true` and does reach the page — but NOT by the path the
 * platform is supposed to use. Their `mgmt_role` is `support`, whose only section is `students`,
 * so the gate refuses their scoped token; what carries them through is a legacy `admin_users`
 * row, which skips sectioning entirely. The stored flag cannot express that, so it reads as
 * healthy while the narrow path is broken and the wide one is load-bearing. `via` below is in
 * the verdict for exactly this case.
 *
 * So this module derives the answer from the three things the request actually passes through,
 * and the audit reports the stored flag only to say where it now disagrees.
 *
 * ## The chain, in the order a request travels it
 *
 *   1. A LOGIN exists that mints an admin token. Two paths, and they differ in a way that
 *      matters: a bridge-minted staff token carries `mgmt_role` and is therefore GATED by
 *      `mgmtSectionGate`, while a legacy `admin_users` login carries no `mgmt_role` and the gate
 *      returns `next()` on its first branch — it skips sectioning entirely. So the narrow login
 *      is the one that gets checked, and the wide one is the one that does not.
 *   2. The SECTION gate. `pathToSection` is imported rather than restated, so this cannot drift
 *      from the table that enforces it; today every one of the 12 manager-gated routers sits
 *      under `/api/admin/agents/:id`, which maps to `dashboard`.
 *   3. `requireAgentManagerOrAdmin`, which does `OrgMember.findOne({ where: { email } })` against
 *      the token's email and then checks the agent is in their downstream. That lookup is an
 *      EXACT match, so a manager whose org_members row and whose login sit on different
 *      addresses is refused with "No linked org member record" — which is Taiwo's real blocker,
 *      not the missing `admin_users` row his stored prose names.
 *
 * ## What this deliberately does NOT claim
 *
 * Step 3's real test is `isAgentInHumanDownstream(orgMember.id, agentId)` — per AGENT. An audit
 * has no single agent id in hand, so `agentsReporting` is used instead: the count of agents
 * naming this org member as `reports_to`. That is a NECESSARY condition, not a sufficient one.
 * A verdict of `canReach` here means "nothing in the chain refuses them for at least one agent
 * that reports to them", and `agentsReporting === 0` is the only thing it can say about the
 * chain itself. Claiming more would be the same mistake as the flag it replaces.
 */

import { pathToSection } from '../../middlewares/mgmtSectionGate';
import { effectiveSections, type SectionKey } from '../../services/access/mgmtRoles';

/**
 * A representative Agent Detail request path.
 *
 * The id is a placeholder: `pathToSection` matches on a static prefix with a '/' boundary and
 * never parses the id, so any well-formed value resolves identically. It is spelled out rather
 * than hardcoding `'dashboard'` so that if someone re-files `/api/admin/agents` under a
 * different section tomorrow, this module follows them instead of quietly disagreeing.
 */
export const AGENT_DETAIL_PATH = '/api/admin/agents/00000000-0000-0000-0000-000000000000';

/** The section the Agent Detail surface sits behind, read from the gate's own table. */
export const REQUIRED_SECTION: SectionKey | null = pathToSection(AGENT_DETAIL_PATH);

/** The legacy `admin_users` roles whose token skips the section gate and holds every section. */
const LEGACY_WIDE_ROLES = new Set(['admin', 'super_admin']);

/** The one legacy role that also bypasses the reporting-chain check in requireAgentManagerOrAdmin. */
const CHAIN_BYPASS_ROLES = new Set(['super_admin']);

/** The bridge path: a staff community_members row carrying a management role. */
export interface BridgeLogin {
  readonly mgmtRole: string;
  readonly extraSections: readonly string[];
  /** The email the minted token will carry — the enrollment's, not the org member's. */
  readonly tokenEmail: string;
}

/** The legacy path: an admin_users row. */
export interface LegacyLogin {
  readonly role: string;
  /** The email the minted token will carry — `admin_users.email`. */
  readonly tokenEmail: string;
}

export interface ManagerAccessFacts {
  readonly domainKey: string;
  /**
   * `org_members.email` for the identity the agents report to. This is the EXACT string
   * `requireAgentManagerOrAdmin` matches the token email against.
   */
  readonly orgMemberEmail: string | null;
  /** How many agents name this org member as their `reports_to`. */
  readonly agentsReporting: number;
  readonly bridge: BridgeLogin | null;
  readonly legacy: LegacyLogin | null;
  /** The stored flag, carried through only so the audit can report disagreement. */
  readonly recordedCanReach: boolean;
}

export type ReachBlocker =
  | 'no_admin_login'
  | 'section_not_held'
  | 'org_member_missing'
  | 'org_member_email_mismatch'
  | 'no_agent_reports_to_them'
  | 'section_unmapped';

export interface ManagerReachVerdict {
  readonly domainKey: string;
  readonly canReach: boolean;
  /** Which login carries them through, when one does. */
  readonly via: 'bridge' | 'legacy' | null;
  readonly blocker: ReachBlocker | null;
  /** One sentence naming the mechanism, for a human reading the report. */
  readonly detail: string;
  /** True when the computed answer contradicts the stored `manager_can_reach`. */
  readonly disagreesWithRecord: boolean;
}

interface PathAttempt {
  readonly via: 'bridge' | 'legacy';
  readonly ok: boolean;
  readonly blocker: ReachBlocker | null;
  readonly detail: string;
}

/**
 * Walk one login down the chain.
 *
 * `gated` is the whole difference between the two paths: a token carrying `mgmt_role` is capped
 * to its sections, and a legacy token is not gated at all.
 */
function attempt(
  facts: ManagerAccessFacts,
  via: 'bridge' | 'legacy',
  tokenEmail: string,
  sections: readonly SectionKey[],
  gated: boolean,
  bypassesChain: boolean,
): PathAttempt {
  if (gated) {
    if (!REQUIRED_SECTION) {
      // The prefix is not in PATH_SECTION. For a scoped token that is deny-by-default, so it
      // is a refusal and not an unknown — the same asymmetry mgmtSectionGate's own comments
      // keep warning about, where an unmapped path passes for admin and 403s for everyone else.
      return {
        via,
        ok: false,
        blocker: 'section_unmapped',
        detail: `${AGENT_DETAIL_PATH} is not classified in PATH_SECTION, so a scoped token is denied by default.`,
      };
    }
    if (!sections.includes(REQUIRED_SECTION)) {
      return {
        via,
        ok: false,
        blocker: 'section_not_held',
        detail: `their management role does not hold the '${REQUIRED_SECTION}' section that ${AGENT_DETAIL_PATH} sits behind.`,
      };
    }
  }

  if (!facts.orgMemberEmail) {
    return {
      via,
      ok: false,
      blocker: 'org_member_missing',
      detail: 'no org_members row exists for this domain\'s manager, so no management relationship can be resolved.',
    };
  }

  // EXACT match, deliberately: `OrgMember.findOne({ where: { email } })` is a plain equality in
  // Postgres, so a case difference or a second address refuses them just as a missing row would.
  if (facts.orgMemberEmail !== tokenEmail) {
    return {
      via,
      ok: false,
      blocker: 'org_member_email_mismatch',
      detail: `their login is ${tokenEmail} but their org_members row is ${facts.orgMemberEmail}; the lookup is an exact match, so it finds nothing.`,
    };
  }

  if (!bypassesChain && facts.agentsReporting === 0) {
    return {
      via,
      ok: false,
      blocker: 'no_agent_reports_to_them',
      detail: 'no agent names them as its reports_to, so nothing is in their reporting chain.',
    };
  }

  return { via, ok: true, blocker: null, detail: `reaches it via their ${via} login.` };
}

/**
 * Compute whether this manager can open Agent Detail for an agent that reports to them.
 *
 * Both logins are tried, because a person may hold either or both, and a pass on one is a pass.
 * When neither works the FIRST attempt's blocker is reported: attempts are ordered bridge-first
 * so the report names the narrow login's obstacle rather than the wide one's, which is the
 * obstacle worth fixing.
 */
export function assessManagerReach(facts: ManagerAccessFacts): ManagerReachVerdict {
  const attempts: PathAttempt[] = [];

  if (facts.bridge) {
    attempts.push(attempt(
      facts,
      'bridge',
      facts.bridge.tokenEmail,
      effectiveSections(facts.bridge.mgmtRole, facts.bridge.extraSections),
      true,
      false,
    ));
  }

  if (facts.legacy) {
    const wide = LEGACY_WIDE_ROLES.has(facts.legacy.role);
    attempts.push(attempt(
      facts,
      'legacy',
      facts.legacy.tokenEmail,
      // A legacy admin/super_admin holds every section; anything else (e.g. 'sales') holds
      // none of the admin sections, but it is moot because a legacy token skips the gate.
      wide && REQUIRED_SECTION ? [REQUIRED_SECTION] : [],
      false,
      CHAIN_BYPASS_ROLES.has(facts.legacy.role),
    ));
  }

  const passed = attempts.find((a) => a.ok);
  const canReach = !!passed;

  let blocker: ReachBlocker | null = null;
  let detail: string;
  if (passed) {
    detail = passed.detail;
  } else if (attempts.length === 0) {
    blocker = 'no_admin_login';
    detail = 'they hold neither a staff management role nor an admin_users row, so no admin token can be minted for them.';
  } else {
    blocker = attempts[0].blocker;
    detail = attempts[0].detail;
  }

  return {
    domainKey: facts.domainKey,
    canReach,
    via: passed ? passed.via : null,
    blocker,
    detail,
    disagreesWithRecord: canReach !== facts.recordedCanReach,
  };
}
