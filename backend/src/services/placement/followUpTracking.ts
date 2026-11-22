import crypto from 'crypto';

/**
 * Career Prep v27, CP10.3 (kit F8): an open or click on an employer's follow-up, from the Mandrill webhook
 * (controllers/mandrillWebhookController.ts calls this for every open and click that is not a campaign email).
 *
 * KEYED on the message metadata `follow_up_id` (followUpScheduler.ts sets it), and counted once per Mandrill event: the
 * event key is sha256 of the message id, the event type, its timestamp and (for a click) its url, so a webhook batch
 * Mandrill delivers twice counts once. Only a follow-up that was really sent can be counted.
 * NOTHING ELSE KEPT: no IP, user agent, location or address; a click's url only decides "the message's link" or "other".
 * NEVER THROWS: the webhook answers Mandrill whatever happens here; a database error is logged with its class.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The store (and with it the database connection) loads on the first follow-up event, not when the webhook controller
// loads: the controller's own tests mock its models but not the database, and must keep loading without one.
const store = () => import('./followUpStore');

export type EngagementOutcome = 'counted' | 'not_counted' | 'ignored' | 'error';

interface MandrillEventLike { event?: unknown; _id?: unknown; ts?: unknown; url?: unknown; msg?: { _id?: unknown; metadata?: Record<string, unknown> } }

export async function recordFollowUpEngagement(raw: unknown): Promise<EngagementOutcome> {
  const e = (raw ?? {}) as MandrillEventLike;
  const kind = e.event === 'open' ? 'open' : e.event === 'click' ? 'click' : null;
  const followUpId = e.msg?.metadata?.follow_up_id;
  const messageId = typeof e._id === 'string' ? e._id : typeof e.msg?._id === 'string' ? e.msg._id : '';
  if (!kind || typeof followUpId !== 'string' || !UUID.test(followUpId) || !messageId || (typeof e.ts !== 'number' && typeof e.ts !== 'string')) return 'ignored';
  const url = kind === 'click' && typeof e.url === 'string' ? e.url.slice(0, 2000) : '';
  const eventKey = crypto.createHash('sha256').update([messageId, kind, String(e.ts), url].join('\n')).digest('hex');
  try {
    return (await (await store()).recordEngagement(eventKey, followUpId, kind, url)) ? 'counted' : 'not_counted'; // already counted, or not a sent follow-up
  } catch (err) {
    const name = (err as Error)?.name;
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'employer_follow_up_engagement_failed',
      outcome: 'failure', error_class: name && name !== 'Error' ? name : 'DatabaseError', context: { follow_up_id: followUpId, kind } }));
    return 'error';
  }
}
