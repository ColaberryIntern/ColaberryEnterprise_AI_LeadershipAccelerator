/**
 * postConsentController — the learner's control over which of their posts go public.
 *
 * LEARNER ONLY. The enrollment always comes from the token; no route here accepts one from
 * the request, and ownership of the post is verified in the UPDATE rather than trusted.
 *
 * A post the learner does not own, and a post that does not exist, both return 404. They
 * must be indistinguishable, or the endpoint becomes a way to discover post ids.
 */
import { Request, Response, NextFunction } from 'express';
import { listPostConsent, setPostConsent } from '../services/capstone/postConsentService';

const eid = (req: Request) => req.participant!.sub;

function fail(res: Response, e: any, next: NextFunction) {
  if (e?.status) {
    res.status(e.status).json({ error: e.message || 'error', error_class: e.error_class });
    return;
  }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'post_consent_controller_error', outcome: 'failure',
    error_class: e?.error_class || e?.name || 'Error', context: { message: e?.message },
  }));
  next(e);
}

/** GET /api/portal/career/post-consent */
export async function handleListPostConsent(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ ok: true, posts: await listPostConsent(eid(req)) });
  } catch (e) { fail(res, e, next); }
}

/**
 * PUT /api/portal/career/post-consent/:postId
 *
 * Recompiles the record in the same request, so revoking consent actually takes the post
 * off the published page rather than only changing a column.
 */
export async function handleSetPostConsent(req: Request, res: Response, next: NextFunction) {
  const shared = req.body?.shared;
  if (typeof shared !== 'boolean') {
    res.status(400).json({ error: 'shared must be true or false' });
    return;
  }
  try {
    res.json({ ok: true, ...await setPostConsent(eid(req), String(req.params.postId), shared) });
  } catch (e) { fail(res, e, next); }
}
