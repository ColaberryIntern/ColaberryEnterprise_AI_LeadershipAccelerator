/**
 * The admin read surface for the ten agent-domain projects.
 *
 * Run `20261007-school-agent-factory` (T15), session CC-20261006-a4k7.
 *
 * Read-only. It provisions nothing, approves nothing, and writes nothing — every handler here is a
 * SELECT or a computation over committed code-only data.
 *
 * ## Why the guard is per route and not per file
 *
 * `scripts/lint-route-auth.js` is a required CI check and it is PER FILE: it asks only whether a
 * source file contains the substring `requireSection` anywhere. So an unguarded route in an
 * otherwise-guarded file passes it, and a file whose header comment merely mentions the guard
 * passes with no real guards at all. That was verified by deleting a guard from one route and
 * watching the lint still report every admin route file as auth-guarded. This router's own test
 * therefore enumerates each route and asserts each one individually carries its guard.
 *
 * ## The section split, and why it is not cosmetic
 *
 * `mgmtRoles.ts` keeps `internship` as its own section key rather than folding it into `program`,
 * and says why in the source: the internship queue carries "an applicant's resume, phone number
 * and interview transcript", so "reviewing an internship application is a materially wider grant
 * than editing curriculum, and the two should not travel together".
 *
 * Intern NAMES are applicant data. They are served only under `requireSection('internship')`. The
 * `program` section sees the same ten projects with `intended_builder_state` — enough to know a
 * domain is waiting on onboarding, without learning who. An earlier draft exposed names under
 * `program`, which is the grant this split exists to prevent.
 *
 * ## Authorization state is the gate's answer, not this router's opinion
 *
 * `/authorization` calls `resolveAgentDomainBuildAuthorization`, the DB-backed reader around the
 * repo's own pure `assertBuildAuthorized`. Until this route existed that function had exactly one
 * reference in the repository — its own definition — so "a build is refused in production" was a
 * unit fact about a function nothing called. All ten domains report `authorized: false` with reason
 * `no_authorization`, because the authorization table is empty and nobody has approved a build.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { readAdmissionsSignals } from '../../services/agentDomain/admissionsSignalsReader';
import {
  AGENT_DOMAINS,
  AGENT_DOMAIN_KEYS,
  getAgentDomain,
  isAssignablePlanningState,
} from '../../services/agentDomain/agentDomainRegistry';
import {
  allDomainCounts,
  countsForDomain,
  loadDomainMatrix,
  loadUnresolvedBucket,
} from '../../services/agentDomain/capabilityRecord';
import {
  coverageForDomain,
  renderCoverageSummary,
  coverageForAllDomains,
} from '../../services/agentDomain/coverageMatrix';
import {
  derivedAnchorId,
  derivedProjectId,
  planProvision,
} from '../../services/agentDomain/agentDomainProvisionPlan';
import { reachFor, resolveManagerReach } from '../../services/agentDomain/managerReachResolver';
import type { ManagerReachVerdict } from '../../services/access/agentManagerReach';
import {
  loadAgentDomainBuildAuthorizationsByDomain,
  resolveAgentDomainBuildAuthorization,
  resolveAllFromRows,
} from '../../services/agentDomain/agentDomainBuildAuthorization';
import {
  loadProvisionedDomains,
  loadProvisionedDomainsForOwner,
  loadMyDomains,
  resolveOwnerIdentityIds,
  summariseProvisioned,
} from '../../services/agentDomain/agentDomainProvisionedReader';
import { AUTONOMY_SET_BY_NOT_RECORDED } from '../../services/agentDomain/agentDomainSnapshot';
import { sequelize } from '../../config/database';

const router = Router();

/** Every param and query is validated before any data access. Malformed input is 400, not 500. */
const DomainParam = z.object({
  domainKey: z.enum(AGENT_DOMAIN_KEYS as unknown as [string, ...string[]]),
});

const CoverageQuery = z.object({
  // `unknown` is a real answer and is never collapsed into zero, so it is a selectable state.
  state: z.enum(['draft', 'confirmed', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

function badRequest(res: Response, err: z.ZodError): void {
  // Zod 4 exposes `issues`, not `errors`.
  res.status(400).json({
    error: 'Invalid request',
    issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

/**
 * The shape every caller sees, with no applicant data in it.
 *
 * `manager_can_reach` and `blocker` are COMPUTED per request and passed in, never read from the
 * catalog. They used to come from two hand-typed fields on the registry entry, under a comment
 * claiming they were measured; they were measured once, in October, and then went stale while
 * this endpoint kept serving them as current. Three managers were reported as locked out here
 * while holding a working scoped login.
 *
 * Still not defaulted, for the original reason: a false reachability with a named reason is the
 * finding, and defaulting it to `true` would turn a real blocker into silent readiness. That is
 * why `reachFor` answers a missing row with a refusal rather than an optimistic `true`.
 */
function publicDomainView(domainKey: string, reach: ManagerReachVerdict) {
  const d = getAgentDomain(domainKey)!;
  const counts = countsForDomain(domainKey);
  return {
    domain_key: d.domain_key,
    title: d.title,
    seq: d.seq,
    manager_identity_id: d.manager_identity_id,
    manager_can_reach: reach.canReach,
    blocker: reach.blocker,
    // The mechanism, which the old boolean could not express: a manager who gets in ONLY via a
    // legacy full-admin login reads as healthy while their scoped path is broken.
    manager_reach_via: reach.via,
    agent_id: d.agent_id,
    // The STATE, never the name. See the section split in this file's header.
    intended_builder_state: d.intended_builder_state,
    assignable_planning_state: isAssignablePlanningState(d),
    derived_project_id: derivedProjectId(domainKey),
    derived_anchor_id: derivedAnchorId(domainKey),
    counts,
  };
}

/**
 * Wraps an async handler so a rejection becomes a 500 instead of nothing at all.
 *
 * Express 4 does NOT route a rejected promise to the error handler, this repo has no
 * `express-async-errors`, and `server.ts` installs no `unhandledRejection` handler. A verifier
 * mocked the database to reject and this route returned NOTHING to the caller while raising an
 * unhandled rejection. Every sibling router in this folder wraps its async handlers for the same
 * reason; this one did not.
 *
 * The error body is deliberately generic -- the upstream message can carry connection details --
 * while the full error is logged with its class, per the Observability Framework.
 */
function guarded(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => void {
  return (req, res) => {
    handler(req, res).catch((err: unknown) => {
      const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({
        level: 'error',
        service: 'backend',
        event: 'agent_domain_read_surface_failed',
        error_class,
        outcome: 'failure',
        context: { path: req.path },
      }));
      if (!res.headersSent) {
        res.status(500).json({ error: 'Could not read agent-domain state.', error_class });
      }
    });
  };
}

// ─────────────────────────────── program section ───────────────────────────────

/** The ten projects. No intern names. */
router.get(
  '/api/admin/agent-domains',
  requireSection('program'),
  guarded(async (_req: Request, res: Response) => {
    // ONE resolve for the whole list rather than one per domain: the facts come from a single
    // query, and ten copies of it would make the endpoint's cost scale with the catalog.
    const reach = await resolveManagerReach(sequelize);
    const views = AGENT_DOMAIN_KEYS.map((k) => publicDomainView(k, reachFor(reach, k)));
    res.json({
      domains: views,
      total: AGENT_DOMAINS.length,
      // Said out loud rather than left to inference from the blockers. Counted off the COMPUTED
      // views, so the totals cannot disagree with the rows directly above them -- they used to be
      // filtered from the catalog independently, which is two chances to be wrong instead of one.
      reachable: views.filter((v) => v.manager_can_reach).length,
      blocked: views.filter((v) => !v.manager_can_reach).length,
      // A manager who reaches the page only through a legacy full-admin login is not the same as
      // one whose own scoped role works, and a reachable count cannot say so.
      reachable_only_via_legacy: views.filter((v) => v.manager_reach_via === 'legacy').length,
    });
  }),
);

router.get(
  '/api/admin/agent-domains/:domainKey',
  requireSection('program'),
  guarded(async (req: Request, res: Response) => {
    const parsed = DomainParam.safeParse(req.params);
    if (!parsed.success) return badRequest(res, parsed.error);
    const key = parsed.data.domainKey;
    const m = loadDomainMatrix(key);
    const plan = planProvision(key);
    const reach = await resolveManagerReach(sequelize);
    res.json({
      ...publicDomainView(key, reachFor(reach, key)),
      accountable_human: m.accountable_human,
      researched_at: m.researched_at,
      releases: plan.releases.map((r) => ({ cluster: r.cluster, title: r.title, position: r.position })),
      story_count: plan.stories.length,
      // This handler reads the REGISTRY and the capability files. It does not query the database,
      // so it must not report a provisioning state as though it had checked one.
      //
      // It used to return `provisioned: false` with "T19 is the provisioning step and it has not
      // run". Provisioning DID run, on 14 Oct 2026 at commit fa7f636bc, and the ten rows exist.
      // So the field was a hardcoded false that had quietly become a false statement to every
      // caller -- the failure mode of asserting a fact a handler never measured.
      provisioned_state: 'not checked by this route',
      provisioning_note:
        'These are the DERIVED ids, computed from the domain key. For the live database row -- '
        + 'stage, release and story counts, verified count, authorization count -- call '
        + 'GET /api/admin/agent-domains-provisioned, which queries it.',
    });
  }),
);

/** The capability -> story coverage matrix for one domain. */
router.get(
  '/api/admin/agent-domains/:domainKey/coverage',
  requireSection('program'),
  (req: Request, res: Response) => {
    const p = DomainParam.safeParse(req.params);
    if (!p.success) return badRequest(res, p.error);
    const q = CoverageQuery.safeParse(req.query);
    if (!q.success) return badRequest(res, q.error);

    let rows = coverageForDomain(p.data.domainKey);
    if (q.data.state) rows = rows.filter((r) => r.validation_state === q.data.state);
    const summary = renderCoverageSummary(rows);
    res.json({
      domain_key: p.data.domainKey,
      summary,
      rows: q.data.limit ? rows.slice(0, q.data.limit) : rows,
      returned: q.data.limit ? Math.min(q.data.limit, rows.length) : rows.length,
      matching: rows.length,
    });
  },
);

/** Programme-wide counts, three figures kept apart and never summed. */
router.get(
  '/api/admin/agent-domains-summary',
  requireSection('program'),
  (_req: Request, res: Response) => {
    const bucket = loadUnresolvedBucket();
    const coverage = renderCoverageSummary(coverageForAllDomains());
    res.json({
      per_domain: allDomainCounts(),
      coverage,
      legacy: {
        // 225 + 21 = 246. Kept apart because the 21 belong to no domain, which is the point.
        domained_rows: allDomainCounts().reduce((n, c) => n + c.legacy_rows_analyzed, 0),
        unresolved_rows: bucket.legacy_row_count,
        unresolved_needs_owner_decision: bucket.needs_owner_decision,
      },
      disclosure:
        'Zero capabilities are confirmed, because no manager has validated one. Coverage over an '
        + 'empty confirmed set is not complete coverage, and the summary above says so.',
    });
  },
);

/**
 * The ten provisioned projects, read FROM THE DATABASE.
 *
 * Every sibling route above answers from the registry and the capability files, so they report the
 * same thing whether or not anything was ever provisioned. This one queries the rows.
 */
router.get(
  '/api/admin/agent-domains-provisioned',
  requireSection('program'),
  guarded(async (_req: Request, res: Response) => {
    const rows = await loadProvisionedDomains(sequelize);
    res.json({ summary: summariseProvisioned(rows), domains: rows });
  }),
);

/**
 * The provisioned projects THE CALLER OWNS.
 *
 * Scoped by the caller's own email from the verified JWT, resolved to `org_members` ids inside the
 * org of record, and matched against `manager_identity_id`. The email is never taken from the
 * request body or a query param -- only from the token the gate already verified.
 *
 * ALI IS A LEGACY FULL ADMIN AND THEREFORE HOLDS EVERY SECTION, so `requireSection('program')`
 * admits him to this route as it admits him to all of them. That is exactly why this route scopes
 * by IDENTITY rather than by section: section access decides whether you may ask, ownership
 * decides what you get back. He owns two domains (executive and learner_success) and this returns
 * two, not ten -- which is also what makes the route testable as something other than "admin sees
 * everything".
 *
 * A caller who resolves to no `org_members` row gets an EMPTY list and a stated reason, never the
 * full set. Treating "no filter" as "no restriction" is how a scoping bug becomes a disclosure.
 */
router.get(
  '/api/admin/agent-domains-mine',
  // 'dashboard', not 'program'. This route is self-scoped: it resolves the caller's own identity
  // from their verified token and returns only what they own, so a stranger learns nothing by
  // reaching it. Gating it on 'program' protected nothing and blocked every intern it was built
  // for — all six returned 403 when walked through production for AF8.3.
  //
  // The sibling route above still returns ALL TEN domains to anyone who can reach it, so it
  // keeps 'program'. The difference is what the handler gives back, not who asks.
  requireSection('dashboard'),
  guarded(async (req: Request, res: Response) => {
    const email = req.admin?.email ?? '';
    const identityIds = await resolveOwnerIdentityIds(sequelize, email);
    // Managed AND built. Scoping by manager alone returned an empty page to all six interns,
    // who are recorded as the intended BUILDER of their domain and manage nothing.
    const rows = await loadMyDomains(sequelize, email, identityIds);
    const managed = rows.filter((r) => identityIds.includes(String(r.manager_identity_id ?? '')));
    res.json({
      caller_email: email,
      resolved_identities: identityIds.length,
      // Said separately so the page can be honest about WHY a domain is yours. "You build this"
      // and "you are accountable for this" are different claims and the intern needs the first.
      as_manager: managed.length,
      as_builder: rows.length - managed.length,
      summary: summariseProvisioned(rows),
      domains: rows,
      // AF3.9. Each row now carries the agent's `enabled`, `autonomy_level`,
      // `autonomy_level_set_at`, `autonomy_level_source` and `tools_granted`, which the Command
      // Center story's third and fourth acceptance criteria need and this route did not return.
      // This names the one field that is genuinely absent from the schema, so a page labels the gap
      // instead of drawing a blank that reads as a bug in the page.
      not_recorded: [AUTONOMY_SET_BY_NOT_RECORDED],
      note: rows.length === 0
        ? 'This email matches no domain as either accountable manager or intended builder, so '
          + 'there is nothing to show. That is why the list is empty; it is not a failure to load.'
        : 'Scoped to the domains you are the accountable manager for, plus those you are the '
          + 'intended builder of. Section access decides whether you may ask; these two '
          + 'relationships decide what comes back.',
    });
  }),
);

/**
 * The two self-scoped siblings of `/api/admin/agent-domains/:domainKey` and its `/coverage`.
 *
 * ## The report that produced them
 *
 * Kalkidan Bezabeh, 5 Nov 2026, 9:10 AM CT, with a freshly minted token: both of those routes
 * answer **403 `section_not_permitted`** for a builder. Her token carries `dashboard`,
 * `lead_ingestion` and `agents`; `mgmtSectionGate` maps both paths to `program`. Her reading was
 * exactly right. STORY-000's panels 2, 3 and 4 — capability inventory, autonomy ladder, per-rung
 * behaviour — have no other source, so every builder is blocked on three of five panels.
 *
 * ## Why NOT the two fixes she proposed, and this instead
 *
 * She asked whether the routes could move to `agents`, or `program` be granted to builders. Both
 * would work and both hand over more than she asked for:
 *
 *   - **Moving them to `agents`** does not scope anything. They take the domain key from the PATH
 *     and check nothing, so every builder could read all ten domains, including each one's
 *     `accountable_human`. That is the same disclosure with a different section on it.
 *   - **Granting `program`** additionally hands over the programme-wide reads and the ten-domain
 *     list. It is also a governance change — widening a role — for what is really a missing route.
 *
 * The header of `agent-domains-mine` already records the principle: *"Section access decides
 * whether you may ask; ownership decides what comes back."* So these are new routes rather than a
 * re-section of the old ones, and the old ones are untouched — the audience that reads all ten
 * domains still needs `program` to do it.
 *
 * ## No new `PATH_SECTION` row, and that is checked rather than assumed
 *
 * `matchesPrefix` requires an exact match or a `/` boundary, so `/api/admin/agent-domains-mine/
 * admissions` matches the existing `-mine` row and resolves to `dashboard`, while
 * `/api/admin/agent-domains` cannot swallow it. A test asserts that mapping by name, because the
 * gate is deny-by-default and getting this wrong ships the 403 it is meant to remove.
 */

/**
 * Is this domain the caller's, by the SAME definition `-mine` uses?
 *
 * Managed or built, resolved from the verified token. Returning the whole list rather than a
 * boolean so the refusal can distinguish two cases the caller needs to tell apart: a domain that
 * belongs to somebody else, and an identity we cannot resolve to any domain at all. Collapsing
 * them sends a builder to argue about permissions when the real problem is an `org_members` row.
 */
async function myDomainKeys(email: string): Promise<string[]> {
  const identityIds = await resolveOwnerIdentityIds(sequelize, email);
  const rows = await loadMyDomains(sequelize, email, identityIds);
  return rows.map((r) => String(r.domain_key));
}

function refuseNotYours(res: Response, key: string, mine: string[]): void {
  // 403 and not 404: the domain keys are already public to anyone holding `program`, so hiding
  // existence buys nothing, and "that is not yours" is the sentence that tells her what to do.
  res.status(403).json({
    error: mine.length === 0
      ? 'This email matches no domain as either accountable manager or intended builder, so there '
        + 'is nothing you can read here. That is an ownership record to fix, not a section grant.'
      : `"${key}" is not one of your domains.`,
    code: 'domain_not_yours',
    your_domains: mine,
  });
}

/** Your own domain's detail. Same body as the `program` route, for a domain you own. */
router.get(
  '/api/admin/agent-domains-mine/:domainKey',
  requireSection('dashboard'),
  guarded(async (req: Request, res: Response) => {
    const parsed = DomainParam.safeParse(req.params);
    if (!parsed.success) return badRequest(res, parsed.error);
    const key = parsed.data.domainKey;

    const mine = await myDomainKeys(req.admin?.email ?? '');
    if (!mine.includes(key)) return refuseNotYours(res, key, mine);

    const m = loadDomainMatrix(key);
    const plan = planProvision(key);
    const reach = await resolveManagerReach(sequelize);
    res.json({
      ...publicDomainView(key, reachFor(reach, key)),
      accountable_human: m.accountable_human,
      researched_at: m.researched_at,
      releases: plan.releases.map((r) => ({ cluster: r.cluster, title: r.title, position: r.position })),
      story_count: plan.stories.length,
      // Carried over verbatim from the `program` route rather than paraphrased. This handler reads
      // the REGISTRY and the capability files and queries no provisioning state, so it must not
      // report one -- the field here used to be a hardcoded `provisioned: false` that had become a
      // false statement to every caller.
      provisioned_state: 'not checked by this route',
      provisioning_note:
        'These are the DERIVED ids, computed from the domain key. For the live database row -- '
        + 'stage, release and story counts, verified count, authorization count -- call '
        + 'GET /api/admin/agent-domains-mine, which queries it and is already scoped to you.',
    });
  }),
);

/** The capability -> story coverage matrix for a domain you own. STORY-000's panels 2, 3 and 4. */
router.get(
  '/api/admin/agent-domains-mine/:domainKey/coverage',
  requireSection('dashboard'),
  guarded(async (req: Request, res: Response) => {
    const p = DomainParam.safeParse(req.params);
    if (!p.success) return badRequest(res, p.error);
    const q = CoverageQuery.safeParse(req.query);
    if (!q.success) return badRequest(res, q.error);
    const key = p.data.domainKey;

    const mine = await myDomainKeys(req.admin?.email ?? '');
    if (!mine.includes(key)) return refuseNotYours(res, key, mine);

    let rows = coverageForDomain(key);
    if (q.data.state) rows = rows.filter((r) => r.validation_state === q.data.state);
    const summary = renderCoverageSummary(rows);
    res.json({
      domain_key: key,
      summary,
      rows: q.data.limit ? rows.slice(0, q.data.limit) : rows,
      returned: q.data.limit ? Math.min(q.data.limit, rows.length) : rows.length,
      matching: rows.length,
    });
  }),
);

// ─────────────────────────────── internship section ───────────────────────────────

/**
 * Intern names. A MATERIALLY WIDER GRANT, and therefore its own section.
 *
 * It returns the intended builder's name and nothing else about them — no enrollment id, no email,
 * no application state, no resume. `intended_builder` in the registry is deliberately a plain name
 * and not a foreign key, so there is nothing here to join against a person's record.
 */
router.get(
  '/api/admin/agent-domains-builders',
  requireSection('internship'),
  (_req: Request, res: Response) => {
    res.json({
      builders: AGENT_DOMAINS.map((d) => ({
        domain_key: d.domain_key,
        intended_builder: d.intended_builder,
        intended_builder_state: d.intended_builder_state,
        assignable_planning_state: isAssignablePlanningState(d),
      })),
      disclosure:
        'INTENDED assignments only. No access has been granted and no assignment is active: this '
        + 'phase records who a domain is intended for, and activating that is a separate decision. '
        + 'A builder whose state is not verified_active must not be routed around.',
    });
  },
);

// ─────────────────────────────── authorization state ───────────────────────────────

/**
 * Build-authorization state for all ten domains, answered BY THE GATE.
 *
 * This is the gate's only live caller. Before this route it had one reference in the repository,
 * its own definition, so the refusal was a unit fact rather than a behaviour.
 */
router.get(
  '/api/admin/agent-domains-authorization',
  requireSection('program'),
  guarded(async (_req: Request, res: Response) => {
    // ONE query for all ten, then the pure resolver over the rows. This was ten queries for a
    // table keyed on `agent_domain_project_id` where every id is derived and known up front --
    // and `resolveAllFromRows` existed for exactly this and had no production caller.
    const anchorIdByDomain = Object.fromEntries(
      AGENT_DOMAIN_KEYS.map((k) => [k, derivedAnchorId(k)]),
    );
    const rowsByDomain = await loadAgentDomainBuildAuthorizationsByDomain(anchorIdByDomain);
    const states = resolveAllFromRows(rowsByDomain);
    res.json({
      states,
      authorized_count: states.filter((s) => s.authorized).length,
      disclosure:
        'Resolved through assertBuildAuthorized, the same gate the delivery path uses, over one '
        + 'query rather than ten. All ten are '
        + 'expected to report not authorized with reason no_authorization, because the '
        + 'authorization table is empty: no human has approved a build.',
    });
  }),
);

/**
 * One domain's authorization state, through the SINGLE-domain resolver.
 *
 * This route exists because the batch rewrite above left
 * `resolveAgentDomainBuildAuthorization` with no caller -- which swapped WHICH function was dead
 * rather than fixing the thing that failed T11 attempt 1. The detail view genuinely wants a
 * per-domain answer, so wiring it beats deleting it.
 */
router.get(
  '/api/admin/agent-domains/:domainKey/authorization',
  requireSection('program'),
  guarded(async (req: Request, res: Response) => {
    const parsed = DomainParam.safeParse(req.params);
    if (!parsed.success) return badRequest(res, parsed.error);
    const key = parsed.data.domainKey;
    const state = await resolveAgentDomainBuildAuthorization(derivedAnchorId(key), key);
    res.json({
      ...state,
      disclosure:
        'Resolved through assertBuildAuthorized, the same gate the delivery path uses. Expected to '
        + 'report not authorized with reason no_authorization: the table is empty because no human '
        + 'has approved a build.',
    });
  }),
);

/**
 * The admissions domain's visitor signals, anonymised, for its own builder.
 *
 * Requested by Kalkidan Bezabeh on 9 Nov 2026 while starting
 * `admissions.CAP.page_event_admissions_enrichment`, whose criterion is "20
 * sampled visitor summaries match the underlying page events with zero
 * fabricated page titles". She asked for the narrow route rather than the wide
 * grant, and was right to: the existing visitor routes are `requireAdmin`, map
 * to the `campaigns` section, and return whole model rows including IP address,
 * user agent and a `lead` include carrying a real name — and still would not
 * have returned the interest tags, which no route exposed for any role.
 *
 * Path sits under `/api/admin/agent-domains-mine/`, so `pathToSection` already
 * resolves it to `dashboard` by prefix and no new PATH_SECTION row is needed.
 *
 * `domainKey` is a literal rather than the shared DomainParam: this is an
 * admissions-shaped payload (admissions_memory.interests), so asking for it
 * under another domain key is a malformed request, not a permission problem.
 * Ownership is still checked, so holding `dashboard` is not enough — the caller
 * must own admissions.
 */
const AdmissionsSignalsParam = z.object({ domainKey: z.literal('admissions') });

const AdmissionsSignalsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  events_per_visitor: z.coerce.number().int().min(1).max(200).optional(),
});

router.get(
  '/api/admin/agent-domains-mine/:domainKey/admissions-signals',
  requireSection('dashboard'),
  guarded(async (req: Request, res: Response) => {
    const p = AdmissionsSignalsParam.safeParse(req.params);
    if (!p.success) return badRequest(res, p.error);
    const q = AdmissionsSignalsQuery.safeParse(req.query);
    if (!q.success) return badRequest(res, q.error);

    const key = p.data.domainKey;
    const mine = await myDomainKeys(req.admin?.email ?? '');
    if (!mine.includes(key)) return refuseNotYours(res, key, mine);

    const page = await readAdmissionsSignals({
      limit: q.data.limit ?? 20,
      eventsPerVisitor: q.data.events_per_visitor ?? 50,
    });

    res.json({
      domain_key: key,
      visitors: page.visitors,
      returned: page.returned,
      matching: page.matching,
      not_recorded: [
        'ip_address', 'user_agent', 'fingerprint', 'lead_id', 'page_url',
        'event_data', 'questions_asked', 'conversation_summaries', 'personality_notes',
      ],
      disclosure:
        'Anonymised by design. anon_id is a keyed HMAC of the visitor id, stable within this '
        + 'surface and not reversible to a visitor; it rotates if the signing secret rotates, so '
        + 'nothing should be joined on it across a rotation. page_path and page_title are returned '
        + 'in place of page_url, which carries the query string the tracker writes an email into. '
        + 'page_title is null when the event recorded none, never an empty string, because the '
        + 'capability this serves is measured on fabricating no titles.',
    });
  }),
);

export default router;
