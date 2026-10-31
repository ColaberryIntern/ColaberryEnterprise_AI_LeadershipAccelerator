import { Router } from 'express';

import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  getKnowledgeDocumentHandler,
  getKnowledgeDocumentsHandler,
  postKnowledgeDecisionHandler,
  postKnowledgeRetireHandler,
} from '../../controllers/explorerKnowledgeReviewController';

/**
 * Explorer knowledge review — the surface that decides what an uploaded document may say.
 *
 * ## Why a THIRD router rather than two more lines in explorerKnowledgeRoutes
 *
 * That file pins itself to exactly one route, and its test says why in as many words: "A
 * second write appearing here fails this, which is the whole reason the upload did not go
 * into explorerGrowthRoutes and loosen ITS count." Adding the review writes there would
 * loosen the second pin for the same reason the first was left alone, and a pin that has
 * been loosened once protects less for every change after it.
 *
 * The split is not only bookkeeping. The two routers make genuinely different safety
 * claims, and keeping them apart is what lets each claim stay checkable:
 *
 *   - `explorerKnowledgeRoutes` — ONE write, and nothing it stores can reach a learner.
 *   - this file — reads, plus the ONLY writes that CAN make text reachable.
 *
 * Collapsing them would leave one router whose honest description is "some of these writes
 * are safe", which is not a claim a test can hold.
 *
 * ## PATH PREFIX
 *
 * Every route declares the FULL path including `/api/admin`, because `adminRoutes` mounts
 * its children with `router.use(child)` and NO prefix. Every sibling file does the same.
 *
 * ## PATH-SCOPED GUARD, NEVER A BARE router.use(requireAdmin)
 *
 * `router.use(BASE, requireAdmin)` binds the guard to this prefix only. A bare
 * `router.use(requireAdmin)` applies to every route registered AFTER this router in
 * `adminRoutes`, including public ones — the shape behind two production outages here. It
 * also satisfies `scripts/lint-route-auth.js`.
 *
 * ## Sharing a prefix with the upload router is deliberate and safe
 *
 * Both routers guard the same BASE, so a request passes two identical `requireAdmin`
 * checks. That costs one function call and keeps each file independently correct: neither
 * depends on the other being mounted, or on being mounted second. The paths do not
 * collide — `adminRoutes.test.ts` asserts no duplicate `method path` pair, and the only
 * shared path here is `/documents`, where the upload owns POST and this file owns GET.
 */

const router = Router();

const BASE = '/api/admin/explorer-growth/knowledge';

/** Path-scoped, mounted before any route below it. */
router.use(BASE, requireAdmin);

/** The queue. Filterable by confidence so "what is waiting on me" is one request. */
router.get(`${BASE}/documents`, getKnowledgeDocumentsHandler);

/** One document and a page of its passages — the only endpoint that returns stored text. */
router.get(`${BASE}/documents/:id`, getKnowledgeDocumentHandler);

/**
 * The verdict. `grounded` here is the single step in the whole subsystem that makes a
 * document's text quotable, which is why it is a POST to its own path rather than a PATCH
 * on the document: it is an event with an actor, not a field edit.
 */
router.post(`${BASE}/documents/:id/decision`, postKnowledgeDecisionHandler);

/** Withdrawal. Separate from a decision because it is not a judgement about the content. */
router.post(`${BASE}/documents/:id/retire`, postKnowledgeRetireHandler);

export default router;
