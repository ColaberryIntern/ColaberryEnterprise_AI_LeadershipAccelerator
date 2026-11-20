import { Request, Response } from 'express';
import { z } from 'zod';
import { requestClientLink, statusForToken } from '../services/enterpriseIntake/enterpriseClientPortal';

const requestSchema = z.object({ email: z.string().trim().email().max(255) });

/**
 * POST /api/enterprise/client/request-link { email }
 * Always the same 200 for a well-formed email, known or not, so this cannot be used to learn
 * who has asked us for a pilot. The answer goes out BEFORE the lookup and the send, so the time
 * it takes says nothing either (Phase 5 review: a known email used to wait on SMTP). A send
 * failure is logged, never shown.
 */
export async function handleRequestClientLink(req: Request, res: Response): Promise<void> {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  res.json({ ok: true, message: 'If we have a pilot request for that email, a link is on its way.' });
  requestClientLink(parsed.data.email).catch((err) =>
    console.error(JSON.stringify({ level: 'error', service: 'enterprise-client-portal', event: 'client_link_failed', outcome: 'failure', context: { message: String((err as Error)?.message || err).slice(0, 200) } })),
  );
}

/** GET /api/enterprise/client/status, with `Authorization: Bearer <token from the emailed link>`. */
export async function handleClientStatus(req: Request, res: Response): Promise<void> {
  const header = String(req.headers.authorization || '');
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const status = token ? await statusForToken(token) : null;
  if (!status) {
    res.status(401).json({ error: 'This link has expired. Ask for a new one.' });
    return;
  }
  res.json(status);
}
