/**
 * Admin - the two things built ON TOP of a settled decomposition: the human/AI flow diagram and
 * the delivery stories. READ ONLY.
 *
 * ── WHY THIS FILE EXISTS AT ALL (L10.9) ──────────────────────────────────────
 *
 * `renderHumanAiFlowSvg` and `bridgeFactoryToDelivery` were built, tested, merged and deployed,
 * and on 2026-11-06 a `git grep` found that NEITHER HAD A SINGLE REFERENCE outside its own file
 * and its tests. The generation path itself is wired - `factoryDecomposeRun` calls
 * `factoryGenerateIfEnabled` - so the spine produced and persisted a correct decomposition and
 * then stopped. L10.5 and L10.8 were both held open on that one gap, which is this file.
 *
 * Deployed and production-verified are different states, and a module nothing calls can never
 * reach the second.
 *
 * ── ITS OWN ROUTER, deliberately ─────────────────────────────────────────────
 *
 * Not more handlers bolted onto `factoryRoutes.ts`, which is already past this repo's 500-line
 * hard ceiling - the same call `caseStudyServiceLinkRoutes` made and for the same reason. These
 * two routes are one responsibility (expose what the decomposition feeds) and they share one
 * loader, so they belong together and nowhere near the view route.
 *
 * ── THE GATE ─────────────────────────────────────────────────────────────────
 *
 * `requireSection('program')`, like every other `/api/admin/factory` route. The path prefix is
 * already mapped to 'program' in mgmtSectionGate's PATH_SECTION, so these inherit it rather than
 * needing a new mapping. The route-auth lint (a required CI check) enforces the guard.
 *
 * Admin auth is BEARER-TOKEN ONLY, with no cookie path. That is why `/flow` returns the SVG
 * inside JSON for the admin page to render, rather than serving `image/svg+xml` at a URL a person
 * could open in a browser tab: such a tab would carry no Authorization header and 401. An
 * endpoint nobody can open would have repeated this file's own bug one layer up.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { renderHumanAiFlowSvg } from '../../services/factory/visual/humanAiFlowSvg';
import { bridgeFactoryToDelivery } from '../../services/factory/factoryDeliveryBridge';
import { PROFILE_MANDATORY_CHECKS } from '../../modules/delivery/releaseChecks';

const router = Router();

const idParam = z.object({ deliveryProjectId: z.string().uuid() });

/**
 * The release profile, VALIDATED against the real table rather than passed through.
 *
 * `mandatoryChecksFor` falls back to the full `RELEASE_CHECKS` list for a key it does not know,
 * which the bridge documents as "silently widens an unknown key". Silent widening at an HTTP
 * boundary means a typo in a query string quietly changes which checks a release is judged
 * against, and the response looks ordinary. So an unknown key is a 400 here.
 */
const PROFILE_KEYS = Object.keys(PROFILE_MANDATORY_CHECKS);
const deliveryQuery = z.object({
  profileKey: z.enum(PROFILE_KEYS as [string, ...string[]]).default('commercial_standard'),
});

function logFail(event: string, err: any, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event,
    outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
    context: { ...context, message: err?.message },
  }));
}

/**
 * Load the decomposition the way the rest of the system loads it.
 *
 * `loadFactoryProject` is imported rather than reimplemented. Its own header says the duplication
 * with `factoryRoutes` is deliberate at two copies and that "extracting it for both is the right
 * move the moment a third caller appears" - this is that third caller, so it reuses the existing
 * one instead of adding a third. That also means the diagram and the command-center view resolve
 * the SAME document by the same track-selection rule; two rules would let the picture and the
 * page disagree about which decomposition they are showing, which is worse than either being
 * wrong on its own.
 *
 * Imported lazily INSIDE the handler, following the `projectApprovalService` lesson that a
 * module-level model import drags Sequelize initialisation into every path that merely
 * references this file.
 */
async function loadProject(deliveryProjectId: string) {
  const { loadFactoryProject } = await import('../../services/lifecycle/generation/gatherCompositionInput');
  return loadFactoryProject(deliveryProjectId);
}

/**
 * GET /api/admin/factory/contract/:deliveryProjectId/flow
 *
 * The human/AI flow as a standalone SVG string, rendered from the STORED decomposition.
 *
 * The SVG is returned in JSON rather than as `image/svg+xml` for the auth reason in the header.
 * It is not folded into the command-center view either: that response is loaded on every page
 * visit and the diagram is not always wanted, so this keeps a large string off the common path
 * and leaves the existing response shape untouched.
 */
router.get(
  '/api/admin/factory/contract/:deliveryProjectId/flow',
  requireSection('program'),
  async (req: Request, res: Response) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid delivery project id.', issues: parsed.error.issues });
      return;
    }
    const { deliveryProjectId } = parsed.data;
    try {
      const loaded = await loadProject(deliveryProjectId);
      if (!loaded.ok) {
        res.status(404).json({ error: 'No decomposition has been generated for this contract yet.' });
        return;
      }
      const svg = renderHumanAiFlowSvg(loaded.project);
      res.json({
        svg,
        documentVersion: loaded.documentVersion,
        trackType: loaded.trackType,
        approvalStatus: loaded.approvalStatus,
      });
    } catch (err: any) {
      logFail('factory_flow_svg_failed', err, { deliveryProjectId });
      res.status(500).json({ error: 'Could not render the flow for this contract.' });
    }
  },
);

/**
 * GET /api/admin/factory/contract/:deliveryProjectId/delivery
 *
 * The delivery stories, their contract issues, the traceability gaps and the release verdict.
 *
 * `checkResults` is deliberately NOT accepted from the request. The bridge's own contract says it
 * never manufactures check results, and a caller that could post them could declare its own
 * release green. With none supplied the gate reports what is missing, which is the honest answer
 * for a contract whose pipeline has not run.
 *
 * `blockToRequirement` is likewise not supplied, so the bridge raises
 * REQUIREMENT_LINK_UNAVAILABLE and the stories trace to SOURCE BLOCK ids. That is a real
 * limitation and it is surfaced rather than hidden: no map exists to supply yet.
 */
router.get(
  '/api/admin/factory/contract/:deliveryProjectId/delivery',
  requireSection('program'),
  async (req: Request, res: Response) => {
    const parsedId = idParam.safeParse(req.params);
    if (!parsedId.success) {
      res.status(400).json({ error: 'Invalid delivery project id.', issues: parsedId.error.issues });
      return;
    }
    const parsedQuery = deliveryQuery.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        error: `Unknown release profile. Known profiles: ${PROFILE_KEYS.join(', ')}.`,
        issues: parsedQuery.error.issues,
      });
      return;
    }
    const { deliveryProjectId } = parsedId.data;
    const { profileKey } = parsedQuery.data;
    try {
      const loaded = await loadProject(deliveryProjectId);
      if (!loaded.ok) {
        res.status(404).json({ error: 'No decomposition has been generated for this contract yet.' });
        return;
      }
      const result = bridgeFactoryToDelivery({ project: loaded.project, profileKey });
      res.json({
        ...result,
        profileKey,
        documentVersion: loaded.documentVersion,
        trackType: loaded.trackType,
      });
    } catch (err: any) {
      logFail('factory_delivery_bridge_failed', err, { deliveryProjectId, profileKey });
      res.status(500).json({ error: 'Could not build the delivery view for this contract.' });
    }
  },
);

export default router;
