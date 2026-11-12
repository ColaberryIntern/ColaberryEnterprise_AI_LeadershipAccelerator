/**
 * Agent Tools Phase 2 — the tool-request pipeline for one agent, and the conversation on a
 * request.
 *
 * Its own file rather than more lines on `toolRequestDecisionRoutes.ts`, for two reasons. That
 * file is covered by `toolRequestDecisionGrantsNothing.test.ts`, which asserts by name that it
 * mentions no grant-shaped column; keeping discussion out of it preserves that file's single,
 * checkable claim. And these two routes answer different questions from different keys: one is
 * keyed by AGENT, the other by REQUEST.
 *
 * Nothing here decides anything. No status, no verb, no grant.
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListAgentToolRequests,
  handleListToolRequestMessages,
  handlePostToolRequestMessage,
} from '../../controllers/toolRequestConversationController';

const router = Router();

/** GET — every tool request filed for this agent, with decisions and conversation. */
router.get('/api/admin/agents/:id/tool-requests', requireAdmin, handleListAgentToolRequests);

/** GET — the conversation on one request, oldest first. */
router.get(
  '/api/admin/agent-domain-tool-requests/:id/messages',
  requireAdmin,
  handleListToolRequestMessages,
);

/** POST — add one message. The author is the verified caller, never the body. */
router.post(
  '/api/admin/agent-domain-tool-requests/:id/messages',
  requireAdmin,
  handlePostToolRequestMessage,
);

export default router;
