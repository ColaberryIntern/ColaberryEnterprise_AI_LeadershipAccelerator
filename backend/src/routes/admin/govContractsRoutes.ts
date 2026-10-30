import { Router, Request, Response } from 'express';
import { requireSection, adminAllowedSections } from '../../middlewares/authMiddleware';
import { resolveGovProjectActor } from '../../middlewares/govProjectAccess';

/**
 * Admin — Government Contracts tab (mgmt-portal M1).
 *
 * The admin Interns hub's "Gov Contracts" tab needs ONE list endpoint: the active government
 * pursuits/projects this caller may see. It is its OWN route gated `requireSection('gov_contracts')`
 * — NOT the existing `/api/admin/factory/*` surface, which is gated `program`. Reusing that would
 * recreate the nav-renders-but-API-403s trap this repo keeps warning about: the tab is gated
 * `gov_contracts`, so its data must be too, or a future `gov_contracts`-only role would see the tab
 * and get a 403 on every call.
 *
 * TWO layers of access, in order:
 *   1. SECTION gate (`requireSection('gov_contracts')`) — may you open the tab at all. owner/admin
 *      hold it (derived from ALL_SECTIONS); no scoped role does yet.
 *   2. ROW scope — a "broad" caller (one who also holds `program`: owner, admin, legacy full admin)
 *      is a management/operator viewer and sees EVERY active pursuit, exactly as the existing gov
 *      cockpit does; a scoped caller sees only the delivery projects they are an active
 *      `DeliveryProjectMember` of (email-resolved identity), mirroring `/api/portal/gov-projects`.
 *
 * Read-only. The list itself is the existing `listGovPipeline` projection (thread-head pursuits in
 * the gov container, newest first); the deep link into the per-pursuit cockpit lives on the client.
 */
const router = Router();

function logFail(event: string, err: unknown, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event,
    outcome: 'failure',
    error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    context: { ...context, message: (err as { message?: string })?.message },
  }));
}

/**
 * GET /api/admin/gov-contracts — the active gov pursuits this caller may see, for the Gov Contracts
 * tab. `scope` echoes whether the list is the full tenant list ('all') or membership-scoped ('member').
 * Fails closed (503) if the gov container is not configured; never discloses another tenant's data.
 */
router.get('/api/admin/gov-contracts', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  try {
    // Inside the try so a DB-level rejection here fails as a clean 500, not an unhandled rejection;
    // an unconfigured container is still the deliberate fail-closed 503.
    // C92: the list body lives in services/factory/govContractsList.ts, shared with the Campus HQ building
    const { listGovContractsFor } = await import('../../services/factory/govContractsList');
    const admin = (req as any).admin ?? {};
    const list = await listGovContractsFor({ email: String(admin.email ?? ''), sections: adminAllowedSections(admin) });
    if (!list) {
      logFail('gov_contracts_scope', new Error('gov container not resolvable'), {});
      res.status(503).json({ error: 'The government contracts workspace is not configured.' });
      return;
    }
    res.json(list);
  } catch (err: unknown) {
    logFail('gov_contracts_list_failed', err, {});
    res.status(500).json({ error: 'Could not list government contracts.' });
  }
});

/**
 * GET /api/admin/gov-contracts/:projectId/cockpit — the SAME student-safe projection the assigned
 * intern sees in their portal cockpit, so an owner/admin can read it in-place from the left-nav
 * (the Interns-hub left-nav redesign). Gated `requireSection('gov_contracts')` — owner/admin hold it,
 * no scoped role does — and it returns the read-only view for ANY non-archived government delivery
 * project, NOT only ones the caller is a member of, so management sees every contract the list shows.
 *
 * View-only by construction: the admin page renders CockpitView read-only (no copilot, no proposal
 * edits), and this asserts no verify identity — `viewerCanVerify=false` so the admin sees exactly the
 * intern's own view, never reviewer controls. The projection itself is already student-safe (never an
 * admin/internal field). 404 when the id is not a (non-archived) government project.
 */
router.get('/api/admin/gov-contracts/:projectId/cockpit', requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  if (typeof projectId !== 'string' || !projectId) {
    res.status(400).json({ error: 'Project id is required' });
    return;
  }
  try {
    const { getStudentGovProjectView } = await import('../../services/factory/govProjectProjection');
    // Resolve the admin's identity only to feed the projection's proposal-share lookup; an owner/admin
    // is not an edit-share member, so it resolves to a read-only view regardless.
    const actor = await resolveGovProjectActor(req);
    const view = await getStudentGovProjectView(projectId, false, actor?.platformIdentityId ?? null);
    if (!view) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ project: view });
  } catch (err: unknown) {
    logFail('gov_contract_cockpit_failed', err, { projectId });
    res.status(500).json({ error: 'Could not load the government contract.' });
  }
});

export default router;
