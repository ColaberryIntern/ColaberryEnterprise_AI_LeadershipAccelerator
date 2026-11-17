import { Router } from 'express';
import { requireSection } from '../../middlewares/authMiddleware';
import { handleDraftToolRequest } from '../../controllers/toolRequestDraftController';

/**
 * AF11.12 — the draft route, in its own file.
 *
 * ## Why not a line on `toolRequestConversationRoutes.ts`
 *
 * Same reasoning that file records for itself, and `assignExistingToolRoutes.ts` after it: the
 * files under `/api/admin/agent-domain-tool-requests` are pinned BY NAME by
 * `toolRequestDecisionGrantsNothing.test.ts`, whose single checkable claim is that the decision
 * subtree mentions no grant-shaped column. Adding unrelated routes to a pinned file erodes what
 * the pin means. And this route answers a different question from a different key: the others are
 * keyed by request or by agent, this one by DOMAIN, and it has no request to be keyed by — the
 * request does not exist yet. That is the whole point of it.
 *
 * ## `requireSection('dashboard')`, and getting this wrong is the bug that has shipped three times
 *
 * The audience for this route is the builder FILLING a form. No Agent Factory builder role carries
 * `program`: `mgmtRoles.ts` grants it to `curriculum`, `admin` and `owner` only, while Sarbjit,
 * Mihret and the rest hold `dashboard` plus their own department. So this sits on `dashboard`,
 * beside `/api/admin/agent-domain-datasets` and `/api/admin/agent-domain-actors`, which are the
 * other two things read while filling the same form.
 *
 * It is NOT `requireAdmin`, and `requireAdmin` would not have saved it either: bridge-minted staff
 * tokens carry the role `admin`, so a builder passes that check and is stopped later by the
 * section gate, which is exactly how AF11.9's front door looked fine and answered 403 for every
 * builder it was built for.
 *
 * ## The gate row has to be declared BEFORE the broad one
 *
 * `pathToSection` returns the FIRST match in array order, and
 * `/api/admin/agent-domain-tool-requests` is already mapped to `program`. A `/draft` row placed
 * after it would never be reached, and the route would 403 for its entire audience while the
 * classification test still passed. `mgmtSectionGate.ts` carries the row above the broad one for
 * that reason, and the test asserts reachability BY ROLE rather than mere classification, because
 * classification is the thing that was already true when this last broke.
 *
 * ## Nothing here decides anything
 *
 * No status, no verb, no grant. A draft is a suggestion the builder edits and then files through
 * the ordinary route, so the ladder is unchanged and this adds no second way in.
 */

const router = Router();

/** POST — draft a tool request for one of your own domains. Returns a body; files nothing. */
router.post(
  '/api/admin/agent-domain-tool-requests/draft',
  requireSection('dashboard'),
  handleDraftToolRequest,
);

export default router;
