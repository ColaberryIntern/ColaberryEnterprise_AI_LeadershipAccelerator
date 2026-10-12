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
import {
  loadAgentDomainBuildAuthorizationsByDomain,
  resolveAgentDomainBuildAuthorization,
  resolveAllFromRows,
} from '../../services/agentDomain/agentDomainBuildAuthorization';

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
 * `manager_can_reach` and `blocker` are passed through exactly as measured. Neither is defaulted:
 * a false reachability with a named reason is the finding, and defaulting it to `true` would turn
 * four real blockers into silent readiness.
 */
function publicDomainView(domainKey: string) {
  const d = getAgentDomain(domainKey)!;
  const counts = countsForDomain(domainKey);
  return {
    domain_key: d.domain_key,
    title: d.title,
    seq: d.seq,
    manager_identity_id: d.manager_identity_id,
    manager_can_reach: d.can_reach_surface,
    blocker: d.blocker,
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
  (_req: Request, res: Response) => {
    res.json({
      domains: AGENT_DOMAIN_KEYS.map((k) => publicDomainView(k)),
      total: AGENT_DOMAINS.length,
      // Said out loud rather than left to inference from four null blockers.
      reachable: AGENT_DOMAINS.filter((d) => d.can_reach_surface).length,
      blocked: AGENT_DOMAINS.filter((d) => !d.can_reach_surface).length,
    });
  },
);

router.get(
  '/api/admin/agent-domains/:domainKey',
  requireSection('program'),
  (req: Request, res: Response) => {
    const parsed = DomainParam.safeParse(req.params);
    if (!parsed.success) return badRequest(res, parsed.error);
    const key = parsed.data.domainKey;
    const m = loadDomainMatrix(key);
    const plan = planProvision(key);
    res.json({
      ...publicDomainView(key),
      accountable_human: m.accountable_human,
      researched_at: m.researched_at,
      releases: plan.releases.map((r) => ({ cluster: r.cluster, title: r.title, position: r.position })),
      story_count: plan.stories.length,
      // A planned project is not a provisioned one. Nothing here claims it exists in the database.
      provisioned: false,
      provisioning_note:
        'These are the ids provisioning WOULD use, derived from the domain key. No row has been '
        + 'written: T19 is the provisioning step and it has not run.',
    });
  },
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

export default router;
