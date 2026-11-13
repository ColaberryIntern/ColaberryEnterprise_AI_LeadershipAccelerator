/**
 * Commercialization Command Center routes (/admin/commercialization). Read-only,
 * admin-gated. Backs C8.1's board design; see commercializationTiles.ts for why each
 * tile reports what it does.
 *
 * The section gate for this prefix is declared in mgmtSectionGate.ts PATH_SECTION as
 * 'revenue'. That gate is deny-by-default for scoped roles, so an unmapped prefix here
 * would 403 a revenue identity with nothing explaining why.
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetCommercializationBoard,
  handleGetDayNinetyReport,
  handleGetFunnelSnapshot,
  handleGetHypothesisHealth,
  handleGetLivePopulation,
} from '../../controllers/commercializationController';
import {
  handleGetRevenueRoomBoard,
  handleGetRevenueRoomDrilldown,
} from '../../controllers/revenueRoomController';
import {
  handleConfirmBidValue,
  handleGetBidValueHistory,
  handleGetRevenueFlowBoard,
} from '../../controllers/revenueFlowController';

const router = Router();

router.get('/api/admin/commercialization/board', requireAdmin, handleGetCommercializationBoard);
// R1 - the Revenue Room board (frontend route /admin/revenue-room). Mounted under this
// prefix rather than a new one because mgmtSectionGate.ts is deny-by-default and
// adminNav.ts carries a matching list; see revenueRoomController.ts for the full reason.
router.get('/api/admin/commercialization/revenue-room', requireAdmin, handleGetRevenueRoomBoard);
// R4 - the drill-down behind one card: its timeline, or (for the government card, which is
// an aggregate of many bids) the roster of bids inside it. `?bid=<delivery_project_id>`
// turns that aggregate into the one bid's own timeline. Declared AFTER the board route so
// the literal path above is never shadowed by this parameterized one.
router.get(
  '/api/admin/commercialization/revenue-room/:cardKey',
  requireAdmin,
  handleGetRevenueRoomDrilldown,
);
// R16 - the Revenue Flow board: the big-picture dashboard plus the dated, classified events
// behind each number. `?window=<days>` narrows the timeline; it defaults to 180, which is
// wider than the oldest real datum production holds.
router.get('/api/admin/commercialization/revenue-flow', requireAdmin, handleGetRevenueFlowBoard);
// R16 - the only write on this surface: record what a government bid is worth. `confirmedBy`
// comes from the session and is NOT accepted from the body; see revenueFlowController's
// header for why that is the difference between a confirmation and a string. Declared with a
// literal `bid-value` segment so it can never be shadowed by a parameterized sibling.
router.post(
  '/api/admin/commercialization/revenue-flow/bid-value',
  requireAdmin,
  handleConfirmBidValue,
);
// R16 - the price history of one bid. Separate from the drill-down because a revision is
// worth reading on its own: the first estimate against the final one is often the most
// informative line on the page.
router.get(
  '/api/admin/commercialization/revenue-flow/bid-value/:deliveryProjectId',
  requireAdmin,
  handleGetBidValueHistory,
);
// C8.4's funnel snapshot had no route of its own: it was observable only indirectly,
// through the shape of the hypothesis response. R1 needs it directly for the drill-down,
// and a service that can only be read as a side effect of another endpoint is a service
// nobody can verify.
router.get('/api/admin/commercialization/funnel', requireAdmin, handleGetFunnelSnapshot);
// C8.6 - hypothesis health, computed from the C8.4 funnel.
router.get('/api/admin/commercialization/hypotheses', requireAdmin, handleGetHypothesisHealth);
// C8.10 - Colaberry Live population and delivered minutes for one month. Mounted under
// this prefix deliberately rather than under a new /api/admin/live one: the figure exists
// to make the C2.3 license break-even falsifiable, which is commercialization work, and
// the prefix is already classified in the deny-by-default section gate.
router.get('/api/admin/commercialization/live-population', requireAdmin, handleGetLivePopulation);
// C8.12 - the day-90 impact report for one sponsor or one cohort. Admin-gated rather than
// mounted on the sponsor portal: the report is assembled and reviewed internally before
// anyone sends it, and this prefix is already classified in the deny-by-default section
// gate. Exposing it directly to a sponsor token is a separate decision, not a wiring step.
router.get('/api/admin/commercialization/day-90-report', requireAdmin, handleGetDayNinetyReport);

export default router;
