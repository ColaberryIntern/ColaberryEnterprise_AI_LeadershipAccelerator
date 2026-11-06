/**
 * Public, unauthenticated routes for hire.refactored.ai.
 *
 *   GET  /api/public/hire/talent   the directory (SPEC §4.1)
 *   POST /api/public/hire/intro    an employer asks for an introduction (SPEC §4.4)
 *
 * The static site at hire.refactored.ai calls these cross-origin; CORS is open on the
 * platform. Nothing here takes a session, so nothing here may return more than the public
 * portfolio projection already does - and the intro response returns a status only.
 *
 * `Cache-Control: public, max-age=120` IS what "always live" means for this product: no
 * build step sits between a publish in the admin and the directory, and any change is
 * visible within two minutes.
 */
import express, { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { parseHireTalentQuery } from '../services/hire/hireTalentQuery';
import { getHireTalentDirectory } from '../services/hire/hireTalentDirectory';
import { requestHireIntro } from '../services/hire/hireIntro';
import { getCaseStudySurfaceProfile } from '../services/caseStudy/caseStudySurfaceProfiles';

/**
 * A plain HTML form post (the no-JS fallback on /intro/) is answered with a 303 back to
 * the hire site; a JSON caller gets JSON. The redirect target is FIXED - the hire
 * profile's own address - never taken from the request, so this cannot be an open
 * redirect.
 */
function wantsRedirect(req: Request): boolean {
  return req.is('application/x-www-form-urlencoded') === 'application/x-www-form-urlencoded';
}

function introReturnUrl(params: Record<string, string>): string {
  const base = getCaseStudySurfaceProfile('hire').publicBaseUrl || 'https://hire.refactored.ai';
  return `${base}/intro/?${new URLSearchParams(params).toString()}`;
}

async function getTalent(req: Request, res: Response): Promise<void> {
  const parsed = parseHireTalentQuery(req.query);
  if (!parsed.ok) {
    res.status(400).json({ error: 'Invalid query', detail: parsed.error });
    return;
  }
  const started = Date.now();
  try {
    const body = await getHireTalentDirectory(parsed.query);
    res.set('Cache-Control', 'public, max-age=120');
    res.json(body);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend',
      event: 'public_hire_talent_read_failed', outcome: 'failure',
      error_class: err?.error_class || err?.name || 'Error',
      duration_ms: Date.now() - started,
      context: { message: String(err?.message || '').slice(0, 200) },
    }));
    // Never leak an internal message to an unauthenticated caller.
    res.status(500).json({ error: 'Unable to load talent' });
  }
}

async function postIntro(req: Request, res: Response): Promise<void> {
  const redirect = wantsRedirect(req);
  try {
    const outcome = await requestHireIntro(req.body, { headers: req.headers as Record<string, unknown>, remoteIp: req.ip });
    if (redirect) {
      const ok = outcome.status === 'created' || outcome.status === 'duplicate';
      const raw = req.body?.talentSlug;
      const talent = typeof raw === 'string' && /^[a-z0-9-]{1,159}$/i.test(raw) ? raw : '';
      res.redirect(303, introReturnUrl(ok ? { sent: '1', talent } : { error: '1', talent }));
      return;
    }
    if (outcome.status === 'invalid') { res.status(400).json({ error: 'Invalid request', detail: outcome.error }); return; }
    if (outcome.status === 'not_found') { res.status(404).json({ error: 'Not found' }); return; }
    if (outcome.status === 'failed') { res.status(502).json({ error: 'Unable to send this request just now' }); return; }
    res.status(outcome.http).json({ ok: true, status: outcome.status });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend',
      event: 'public_hire_intro_failed', outcome: 'failure', error_class: err?.name || 'Error',
      context: { message: String(err?.message || '').slice(0, 200) },
    }));
    if (redirect) { res.redirect(303, introReturnUrl({ error: '1' })); return; }
    res.status(500).json({ error: 'Unable to send this request just now' });
  }
}

/**
 * A factory, so each mounted router owns its own rate-limit store (tests mount several).
 * Production mounts exactly one: the default export.
 */
export function createHireRouter(): Router {
  const router = Router();
  // The same per-IP cap the other public lead forms use: 5 per 15 minutes.
  const introLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again in a few minutes.' },
  });
  router.get('/api/public/hire/talent', getTalent);
  router.post('/api/public/hire/intro', introLimiter, express.urlencoded({ extended: false, limit: '10kb' }), postIntro);
  return router;
}

export default createHireRouter();
