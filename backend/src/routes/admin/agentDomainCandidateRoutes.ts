/**
 * The candidate list, on the platform rather than in seven separate repositories.
 *
 * ## Why these are self-scoped reads on `dashboard`, not `program`
 *
 * `agent-domains-mine` records the principle these routes follow: *"Section access decides whether
 * you may ask; ownership decides what comes back."* Every route here resolves the caller's own
 * identity from their verified token and filters to the domains they manage or build, so a
 * stranger who reaches one learns nothing. Gating them on `program` would protect nothing and
 * would 403 every builder they exist for — the exact failure AF8.3 measured, where all six interns
 * got a 403 from a route built for them.
 *
 * ## Why there IS a new `PATH_SECTION` row
 *
 * `matchesPrefix` needs an exact match or a `/` boundary. `/api/admin/agent-domain-candidates` is
 * not a boundary match for `/api/admin/agent-domains-mine` or `/api/admin/agent-domains`, so
 * without its own row it falls through to a deny-by-default 403 with nothing in the response
 * explaining why. The row is purely additive: before it, these paths were denied for every scoped
 * role, so no role loses anything.
 *
 * ## The writes
 *
 * Three, all narrow, all Zod-validated, all scoped at the query rather than after the fetch:
 * put a candidate on the list, record what the front door said about it, and record that it has
 * been done by hand. None of them can express a DECISION — no approve, no decline, no status.
 * That lives on `agent_domain_change_requests` and only there.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { sequelize } from '../../config/database';
import {
  loadMyDomains,
  resolveOwnerIdentityIds,
} from '../../services/agentDomain/agentDomainProvisionedReader';
import {
  createCandidate,
  listCandidates,
  markProvenByHand,
  setProductState,
} from '../../services/agentDomain/candidateService';
import { CANDIDATE_PRODUCT_STATES, CANDIDATE_SOURCES } from '../../db/ensureAgentDomainCandidateSchema';

const router = Router();

/**
 * Wraps an async handler so a rejection becomes a 500 instead of nothing at all.
 *
 * Express 4 does not route a rejected promise to the error handler, this repo has no
 * `express-async-errors`, and `server.ts` installs no `unhandledRejection` handler. A sibling
 * router shipped without this and returned NOTHING to the caller when its database mock rejected.
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
        event: 'agent_domain_candidate_surface_failed',
        error_class,
        outcome: 'failure',
        context: { path: req.path },
      }));
      if (!res.headersSent) {
        res.status(500).json({ error: 'Could not read candidate state.', error_class });
      }
    });
  };
}

/** The domains this caller manages or builds, by the SAME definition `-mine` uses. */
async function myDomainKeys(email: string): Promise<string[]> {
  const identityIds = await resolveOwnerIdentityIds(sequelize, email);
  const rows = await loadMyDomains(sequelize, email, identityIds);
  return rows.map((r) => String(r.domain_key));
}

const createSchema = z.object({
  domain_key: z.string().trim().min(1).max(120),
  title: z.string().trim().min(3).max(300),
  source: z.enum(CANDIDATE_SOURCES as unknown as [string, ...string[]]),
  source_note: z.string().trim().max(2000).nullable().optional(),
});

const productStateSchema = z.object({
  product_state: z.enum(CANDIDATE_PRODUCT_STATES as unknown as [string, ...string[]]),
  matched_feature_key: z.string().trim().max(200).nullable().optional(),
});

const provenSchema = z.object({
  // An explicit timestamp, so a builder can record a session they ran yesterday. Defaults to now.
  proven_at: z.string().datetime().optional(),
});

/** Why a write did not land, said in words rather than as a bare 404. */
function refuseNotYours(res: Response, mine: string[]): void {
  res.status(404).json({
    error: 'No such candidate in a domain you own.',
    reason: mine.length === 0
      ? 'You are not recorded as the manager or the builder of any domain. That is an ownership '
        + 'gap in `org_members`, not a permissions problem.'
      : `You own ${mine.join(', ')}. This candidate is either in another domain or does not exist, `
        + 'and those two are deliberately not told apart here.',
    your_domains: mine,
  });
}

router.get(
  '/api/admin/agent-domain-candidates-mine',
  requireSection('dashboard'),
  guarded(async (req: Request, res: Response) => {
    const email = req.admin?.email ?? '';
    const mine = await myDomainKeys(email);
    const result = await listCandidates(mine);
    res.json({ caller_email: email, ...result });
  }),
);

router.post(
  '/api/admin/agent-domain-candidates-mine',
  requireSection('dashboard'),
  guarded(async (req: Request, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid candidate.', issues: parsed.error.issues });
      return;
    }
    const mine = await myDomainKeys(req.admin?.email ?? '');
    if (!mine.includes(parsed.data.domain_key)) {
      refuseNotYours(res, mine);
      return;
    }
    const { candidate, created } = await createCandidate({
      domain_key: parsed.data.domain_key,
      title: parsed.data.title,
      source: parsed.data.source as never,
      source_note: parsed.data.source_note ?? null,
    });
    res.status(created ? 201 : 200).json({
      created,
      id: String(candidate.id),
      note: created
        ? 'On the list.'
        : 'Already on the list for this domain, so nothing changed. Titles are unique per domain '
          + 'so a repeated seed cannot double the list.',
    });
  }),
);

router.patch(
  '/api/admin/agent-domain-candidates-mine/:id/product-state',
  requireSection('dashboard'),
  guarded(async (req: Request, res: Response) => {
    const parsed = productStateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid product state.', issues: parsed.error.issues });
      return;
    }
    const mine = await myDomainKeys(req.admin?.email ?? '');
    const row = await setProductState(
      String(req.params.id),
      mine,
      parsed.data.product_state as never,
      parsed.data.matched_feature_key ?? null,
    );
    if (!row) {
      refuseNotYours(res, mine);
      return;
    }
    res.json({ id: String(row.id), product_state: row.product_state });
  }),
);

router.patch(
  '/api/admin/agent-domain-candidates-mine/:id/proven-by-hand',
  requireSection('dashboard'),
  guarded(async (req: Request, res: Response) => {
    const parsed = provenSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid timestamp.', issues: parsed.error.issues });
      return;
    }
    const mine = await myDomainKeys(req.admin?.email ?? '');
    const at = parsed.data.proven_at ? new Date(parsed.data.proven_at) : new Date();
    const row = await markProvenByHand(String(req.params.id), mine, at);
    if (!row) {
      refuseNotYours(res, mine);
      return;
    }
    res.json({
      id: String(row.id),
      proven_by_hand_at: at.toISOString(),
      note: 'Recorded. This is the first rung, and it is not the gate: the gate asks whether the '
        + 'agent does this under watch.',
    });
  }),
);

export default router;
