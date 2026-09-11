import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { trackedLinkRedirectParamsSchema } from '../schemas/trackedLinkRedirectSchema';
import { validateDestination, applyUtmParams } from '../services/marketing/trackedLinkDestination';
import {
  classifyUserAgent,
  extractClickIds,
  hashIp,
  clientIpFrom,
} from '../services/marketing/clickClassification';
import { getLinkableHostnames } from '../services/journeyLinkRewriter';
import { sequelize } from '../config/database';

/**
 * `GET /r/:shortCode` — the public tracked-link redirect.
 *
 * PUBLIC AND UNAUTHENTICATED. It must be mounted BEFORE the broad auth guard, the same way
 * `qrRedirectRoutes` and `leadRoutes` are; `leadRoutes.ts` documents that ordering
 * requirement, and a router registered after the guard would 401 every visitor.
 *
 * ── The two halves have opposite failure modes, on purpose ────────────────────────────
 *
 * FAIL-SOFT on the click write. A visitor who clicked a legitimate marketing link must reach
 * the page even if the database is unavailable. Losing a click row costs one data point;
 * blocking the redirect costs the visit, and the person is gone.
 *
 * FAIL-CLOSED on the redirect target. If the destination cannot be re-validated right now,
 * NOTHING is issued — no 302, no Location header. A redirect we are not certain about is how
 * this endpoint becomes an open redirect, and "probably fine" is not a standard worth applying
 * to a URL we are about to send a browser to.
 *
 * ── Why the destination is validated AGAIN here ───────────────────────────────────────
 *
 * It was already validated when the link was created. It is validated a second time at
 * request time because those two moments can disagree: a brand domain can be removed from
 * `brand_domains`, an allowlist rule can tighten, or a row can be written by a path that
 * bypassed the service. Validating only on write leaves every existing row grandfathered past
 * any future fix — and the rows that would benefit most from a tightened rule are precisely
 * the ones written before it.
 */

const router = Router();

/**
 * Generous, because this is a legitimate high-traffic public endpoint: one social post can
 * produce a burst of real clicks from one corporate NAT, and rate-limiting those away would
 * silently destroy the attribution this whole subsystem exists to capture. It is a ceiling
 * against abuse, not a traffic shaper.
 */
const redirectRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // A rate-limited visitor still gets sent somewhere useful rather than an error page; see
  // the handler note below.
  handler: (_req: Request, res: Response) => res.status(429).send('Too Many Requests'),
});

function logJson(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>) {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    service: 'tracked-link-redirect',
    event,
    outcome: level === 'error' ? 'failure' : 'success',
    context,
  };
  if (level === 'error') console.error(JSON.stringify(line));
  else console.warn(JSON.stringify(line));
}

router.get('/r/:shortCode', redirectRateLimiter, async (req: Request, res: Response) => {
  const parsed = trackedLinkRedirectParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    // 404 rather than 400. A malformed code and an unknown code are indistinguishable to a
    // visitor, and returning a different status for "wrong shape" would let someone probe the
    // code alphabet without ever guessing a real one.
    return res.status(404).send('Not Found');
  }
  const { shortCode } = parsed.data;

  try {
    const { TrackedLink, LinkClick } = await import('../models');

    const link = await TrackedLink.findOne({ where: { short_code: shortCode } });
    if (!link) return res.status(404).send('Not Found');

    // 410 Gone, not 404: the code existed and was deliberately retired. The distinction is
    // for the operator reading logs, not the visitor - both see a dead link.
    if (link.status !== 'active') {
      logJson('warn', 'redirect_refused_inactive', { shortCode, status: link.status });
      return res.status(410).send('Gone');
    }

    // The second application of the allowlist. See the header.
    const allowedHosts = await getLinkableHostnames();
    const destination = validateDestination(link.destination_url, allowedHosts);
    if (!destination.ok) {
      // Deliberately NOT a redirect of any kind. This is the fail-closed half.
      logJson('error', 'redirect_refused_destination', {
        shortCode,
        code: destination.code,
        // The rejected URL is logged so an operator can fix it. It is a destination somebody
        // configured, not visitor data.
        destination: String(link.destination_url).slice(0, 300),
      });
      return res.status(410).send('Gone');
    }

    // Forward the platform click IDs the ad network appended, so the landing page and its
    // own tag can see them. Without this the click ID dies at the redirect and the platform
    // cannot reconcile its click with our conversion.
    const clickIds = extractClickIds(req.query as Record<string, unknown>);
    const forward: Record<string, string> = {};
    for (const key of ['fbclid', 'gclid', 'msclkid', 'ttclid'] as const) {
      const v = clickIds[key];
      if (v) forward[key] = v;
    }
    for (const [k, v] of Object.entries(clickIds.click_ids)) forward[k] = v;

    const { url: finalUrl } = applyUtmParams(destination.url as string, forward);

    const verdict = classifyUserAgent(req.headers['user-agent'] as string | undefined);

    // FAIL-SOFT: fire-and-forget, exactly as qrRedirectRoutes does. The redirect below does
    // not await this and is not conditional on it.
    //
    // Wrapped in try/catch AS WELL AS `.catch()`, because those cover different failures and
    // only one of them was covered originally. `.catch()` handles a REJECTED PROMISE. It does
    // nothing for a SYNCHRONOUS throw — if `LinkClick.create` throws before returning a
    // promise (an uninitialised model, a bad argument), there is no promise to attach a
    // handler to, the exception escapes into the request handler, and the visitor gets a 500
    // from the exact code path that exists to guarantee they never do. Found by a test written
    // for that specific shape.
    try {
      LinkClick.create({
        tracked_link_id: link.id,
        tenant_id: link.tenant_id ?? null,
        brand_id: link.brand_id ?? null,
        campaign_id: link.campaign_id ?? null,
        occurred_at: new Date(),
        ip_hash: hashIp(clientIpFrom(req.headers as Record<string, unknown>, req.ip)),
        user_agent: (req.headers['user-agent'] as string | undefined) ?? null,
        referrer: ((req.headers.referer || req.headers.referrer) as string | undefined) ?? null,
        visitor_fingerprint: null,
        session_id: null,
        is_bot: verdict.isBot,
        bot_reason: verdict.reason,
        fbclid: clickIds.fbclid,
        gclid: clickIds.gclid,
        msclkid: clickIds.msclkid,
        ttclid: clickIds.ttclid,
        click_ids: clickIds.click_ids,
      })
        // The link's own counters. Declared on the model since T001 and written by nothing
        // until the live verification of T032 showed a human click leaving click_count at 0:
        // a column with no writer, exactly the producer-without-consumer shape this build
        // kept finding. Bot clicks are recorded above but not counted here, so the count
        // means "people", the same rule the registry's trusted click metrics follow. The
        // increment is a SQL expression, not a read-modify-write, so concurrent clicks add.
        ?.then?.(() => (verdict.isBot ? undefined : TrackedLink.update(
          {
            click_count: sequelize.literal('click_count + 1'),
            first_click_at: sequelize.literal('COALESCE(first_click_at, NOW())'),
            last_click_at: new Date(),
          },
          { where: { id: link.id } },
        )))
        ?.catch?.((err: Error) => {
        logJson('error', 'click_write_failed', {
          shortCode,
          error_class: err?.constructor?.name ?? 'Error',
          message: err?.message,
        });
      });
    } catch (err: any) {
      // Synchronous throw. Logged and swallowed - the visitor still gets their redirect.
      logJson('error', 'click_write_threw', {
        shortCode,
        error_class: err?.constructor?.name ?? 'Error',
        message: err?.message,
      });
    }

    return res.redirect(302, finalUrl);
  } catch (err: any) {
    // An unexpected failure reaches here. Still fail CLOSED on the target: we have no
    // validated destination to send anyone to, so nothing is issued.
    logJson('error', 'redirect_failed', {
      shortCode,
      error_class: err?.constructor?.name ?? 'Error',
      message: err?.message,
    });
    return res.status(500).send('Internal Error');
  }
});

export default router;
