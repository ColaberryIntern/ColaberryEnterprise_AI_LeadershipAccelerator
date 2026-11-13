/**
 * toolRequestConversationController — Agent Tools Phase 2.
 *
 * Thin HTTP layer over `toolRequestConversationService`. Two questions:
 *   - what tool requests are in flight for THIS AGENT (its dashboard's question), and
 *   - what has been SAID on one request, plus adding to it.
 *
 * It decides nothing. There is no status, verb, grant or `tools_granted` anywhere in this file,
 * for the same reason `toolRequestDecisionController` has no autonomy level: a surface that
 * could both discuss and decide would be a second approval spine.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listToolRequestsForAgent,
  listMessages,
  postMessage,
  MessageRefusedError,
  MESSAGE_BODY_MAX,
} from '../services/agentDomain/toolRequestConversationService';
import {
  recordBuildEvent,
  listBuildEvents,
  BuildEventRefusedError,
  BUILD_NOTE_MAX,
} from '../services/agentDomain/toolRequestBuildProgressService';

function fail(res: Response, err: unknown, next: NextFunction) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  }
  if (err instanceof MessageRefusedError || err instanceof BuildEventRefusedError) {
    // Named rule, so the page can show the person WHICH rule stopped them. Same shape as the
    // tool-grant refusals, which render their `issues` verbatim.
    return res.status(400).json({ error: err.message, issues: [{ rule: err.rule, detail: err.message }] });
  }
  return next(err);
}

/** GET /api/admin/agents/:id/tool-requests — the pipeline for one agent. */
export async function handleListAgentToolRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id || '');
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    res.json(await listToolRequestsForAgent(id));
  } catch (err) {
    fail(res, err, next);
  }
}

/** GET /api/admin/agent-domain-tool-requests/:id/messages — the conversation, oldest first. */
export async function handleListToolRequestMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id || '');
    if (!id) {
      res.status(400).json({ error: 'Request id is required' });
      return;
    }
    res.json({ change_request_id: id, messages: await listMessages(id) });
  } catch (err) {
    fail(res, err, next);
  }
}

/**
 * Strict, so a field this endpoint does not understand is refused by name rather than dropped.
 * Notably absent and absent on purpose: `author_identity`. The author is the verified caller,
 * read server-side; accepting it from the body would let anyone post as anyone.
 */
const postMessageSchema = z.object({
  body: z.string().min(1).max(MESSAGE_BODY_MAX),
}).strict();

/** POST /api/admin/agent-domain-tool-requests/:id/messages — add to the conversation. */
export async function handlePostToolRequestMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id || '');
    if (!id) {
      res.status(400).json({ error: 'Request id is required' });
      return;
    }
    const parsed = postMessageSchema.parse(req.body);

    // The author is the verified caller, never the payload. `req.admin` is what
    // `requireAdmin` attaches, and `toolRequestDecisionController` reads the acting identity
    // the same way for `decided_by_identity` — matched deliberately rather than invented, so
    // a message and a decision on the same request attribute to the same string.
    const authorIdentity = (req as unknown as { admin?: { email?: string } }).admin?.email ?? '';
    if (!authorIdentity) {
      res.status(401).json({ error: 'Could not establish who is posting' });
      return;
    }

    const created = await postMessage({
      changeRequestId: id,
      authorIdentity,
      body: parsed.body,
    });
    res.status(201).json(created);
  } catch (err) {
    fail(res, err, next);
  }
}

/** GET /api/admin/agent-domain-tool-requests/:id/build-events — the milestones, oldest first. */
export async function handleListBuildEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id || '');
    if (!id) {
      res.status(400).json({ error: 'Request id is required' });
      return;
    }
    res.json({ change_request_id: id, build_events: await listBuildEvents(id) });
  } catch (err) {
    fail(res, err, next);
  }
}

/**
 * Strict, and the event vocabulary is an enum rather than a string, so an invented milestone is
 * refused by name at the boundary instead of reaching a CHECK constraint.
 *
 * `actor_identity` is absent on purpose, exactly as on the message schema: the actor is the
 * verified caller, read server-side.
 */
const buildEventSchema = z.object({
  event: z.enum(['started_build', 'handed_over']),
  note: z.string().max(BUILD_NOTE_MAX).optional(),
}).strict();

/** POST /api/admin/agent-domain-tool-requests/:id/build-events — record a milestone. */
export async function handleRecordBuildEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id || '');
    if (!id) {
      res.status(400).json({ error: 'Request id is required' });
      return;
    }
    const parsed = buildEventSchema.parse(req.body);

    const actorIdentity = (req as unknown as { admin?: { email?: string } }).admin?.email ?? '';
    if (!actorIdentity) {
      res.status(401).json({ error: 'Could not establish who is recording this' });
      return;
    }

    const created = await recordBuildEvent({
      changeRequestId: id,
      event: parsed.event,
      actorIdentity,
      note: parsed.note ?? null,
    });
    res.status(201).json(created);
  } catch (err) {
    fail(res, err, next);
  }
}
