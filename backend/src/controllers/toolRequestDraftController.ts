import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import {
  draftToolRequest,
  ToolRequestDraftUnavailableError,
} from '../services/agentDomain/toolRequestDraftService';
import { draftTitle } from '../services/agentDomain/toolRequestDrafter';
import { loadMyDomains, resolveOwnerIdentityIds } from '../services/agentDomain/agentDomainProvisionedReader';
import { CHANGE_REQUEST_TITLE_MAX } from '../schemas/agentChangeRequestSchema';

/**
 * AF11.12 — "click a button and it fills out the whole request for you".
 *
 * Ali, to seven builders on 17 Nov 2026: *"Click a button, and then it fills out the whole request
 * for you. And then you look at it and say, oh, yeah, this would be cool, or no, go ahead and do
 * another one, try a different one, right? And then it spins up another one. I'm not expecting you
 * guys to just come up with everything."* And the second mode, in the same breath: *"Or you'll be
 * able to just ask the AI to come up with one randomly."*
 *
 * ## THIS ROUTE FILES NOTHING
 *
 * It returns a body. The form loads it into editable fields and the builder presses the same
 * submit button they always did, which goes to the same filing route, through the same gate, with
 * the same named refusals. Drafting is not a second way in: it is a faster way to the same door.
 *
 * That is also why there is no "draft and file" variant. Ali's own description of the loop has him
 * reading the draft and asking for a different one, and a route that submitted would remove the
 * step the whole feature exists for.
 *
 * ## OWNERSHIP IS CHECKED HERE, THE SAME WAY `-mine` CHECKS IT
 *
 * A draft is written against a domain's capability records, so the caller has to own that domain
 * or they would be reading somebody else's roster through the drafter. `loadMyDomains` is the same
 * resolution `/api/admin/agent-domains-mine` uses — managed OR built, resolved from the verified
 * token — because a builder is recorded as the intended BUILDER of their domain and manages
 * nothing, and scoping by manager alone returned an empty page to all six interns in AF8.3.
 *
 * ## A FAILED DRAFT IS A SENTENCE, NOT A 500
 *
 * The model is reachable or it is not, and when it is not the builder still has a form they can
 * fill in by hand. So `ToolRequestDraftUnavailableError` answers 503 with something readable,
 * rather than a stack trace that reads as the form being broken.
 */

const Body = z.object({
  domain_key: z.string().min(1),
  /** Null or absent means "suggest one", which is Ali's second mode. */
  intent: z.string().trim().max(2000).nullish(),
});

export async function handleDraftToolRequest(req: Request, res: Response): Promise<void> {
  const started = Date.now();
  const email = (req as any).admin?.email ?? '';

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Tell me which domain to draft for.', code: 'bad_request' });
    return;
  }
  const { domain_key: domainKey } = parsed.data;
  const intent = (parsed.data.intent ?? '').trim();
  const mode = intent.length > 0 ? 'from_intent' : 'suggest';

  const identityIds = await resolveOwnerIdentityIds(sequelize, email);
  const mine = await loadMyDomains(sequelize, email, identityIds);
  const owned = mine.find((d) => String(d.domain_key) === domainKey);
  if (!owned) {
    // Same shape and the same two cases `agentDomainRoutes.refuseNotYours` distinguishes: a domain
    // that is somebody else's, and an identity that resolves to no domain at all. Collapsing them
    // sends a builder to argue about permissions when the real problem is an ownership row.
    res.status(403).json({
      error: mine.length === 0
        ? 'This email matches no domain as either accountable manager or intended builder, so '
          + 'there is nothing to draft against. That is an ownership record to fix, not a '
          + 'section grant.'
        : `"${domainKey}" is not one of your domains.`,
      code: 'domain_not_yours',
      your_domains: mine.map((d) => String(d.domain_key)),
    });
    return;
  }

  try {
    const result = await draftToolRequest({
      sequelize,
      domainKey,
      agentId: owned.agent_id ? String(owned.agent_id) : null,
      agentDisplayName: owned.agent_display_name ? String(owned.agent_display_name) : null,
      mode,
      intent,
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'backend',
      event: 'tool_request_drafted',
      outcome: 'success',
      duration_ms: Date.now() - started,
      actor_email: email,
      context: { domain_key: domainKey, mode, grounded_in: result.grounded_in },
    }));

    res.json({
      tool_request: result.detail,
      title: draftTitle(result.detail, CHANGE_REQUEST_TITLE_MAX),
      grounded_in: result.grounded_in,
      /**
       * Said plainly, because a drafted request that gets refused must not read as the AI being
       * broken. The server is still the only authority on whether this is complete.
       */
      note: 'A draft, not a filing. Read it, change what is wrong, then file it. '
        + 'It is checked when you file, exactly like one you typed yourself.',
    });
  } catch (e) {
    const unavailable = e instanceof ToolRequestDraftUnavailableError;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: unavailable ? 'warn' : 'error',
      service: 'backend',
      event: 'tool_request_drafted',
      outcome: 'failure',
      duration_ms: Date.now() - started,
      actor_email: email,
      context: { domain_key: domainKey, mode },
      error_class: unavailable ? 'ToolRequestDraftUnavailable' : 'Unexpected',
    }));
    if (unavailable) {
      res.status(503).json({ error: e.message, code: 'draft_unavailable' });
      return;
    }
    throw e;
  }
}
