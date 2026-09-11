/**
 * The email as it was actually sent — fetched from Mandrill on demand.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Most of what a person opens is mail this platform never stored: portal
 * access links, class reminders, digests. Their opens and clicks are on the
 * 360 (from the Mandrill poll), but the message itself is nowhere in our
 * database — `communication_logs` holds no body for any of the top detached
 * subjects (checked 2026-09-11: 0 of 232 "Portal Access Link" outcomes have
 * a logged body). Mandrill does hold it. Checked against the live API the
 * same day: `messages/content` returns the full HTML for messages up to at
 * least 15 days old and answers `Unknown_Message` at 30.
 *
 * So this is a two-step lookup: find the message (`messages/search`, scoped
 * to the RECIPIENT, the subject and the day), then fetch its content. The
 * search result also carries `clicks_detail` with the URL of every click,
 * which is what lets the modal highlight the link that was clicked.
 *
 * ── WHAT IS SCOPED, AND WHAT IS MASKED ──────────────────────────────────────
 *
 * The caller has already passed the person-level gate (stage scope + the
 * communications panel). Here the recipient is pinned again on the Mandrill
 * side: the search is `email:<the person>` and a content record whose `to`
 * is someone else is refused, so a Mandrill id from one person's row cannot
 * be used to read another's mail.
 *
 * Magic-link mail contains a login token in its URL. The rendered copy is for
 * an admin to SEE what was sent, not to use it, so every secret-looking query
 * value (token, key, secret, sig, auth, code) is masked in the HTML, the text
 * and the click URLs before anything leaves this module. Matching a clicked
 * URL to an anchor in the HTML is done on the masked forms, so masking does
 * not break the highlight.
 *
 * ── FAILURE PATH ────────────────────────────────────────────────────────────
 *
 * Every outcome is a stated reason, never a throw: not in Mandrill's search
 * window, content already expired, recipient mismatch, or Mandrill unreachable
 * (10s timeout per call, no retry — this is a click, the admin can click
 * again). The Mandrill error body never reaches the client.
 */
import { maskUrlSecrets } from '../../utils/piiRedaction';

export interface MandrillSearchHit {
  _id: string;
  ts: number;
  subject?: string | null;
  email?: string;
  sender?: string;
  opens?: number;
  clicks?: number;
  clicks_detail?: Array<{ url?: string | null; ts?: number }>;
}

export interface MandrillContent {
  ts?: number;
  subject?: string;
  from_email?: string;
  from_name?: string;
  to?: { email?: string; name?: string } | Array<{ email?: string; name?: string }>;
  html?: string | null;
  text?: string | null;
}

/** POST to a Mandrill API path (without the key) and return the parsed JSON. Injected so tests fake it. */
export type MandrillPost = (path: string, body: Record<string, unknown>) => Promise<unknown>;

export interface AsSentQuery {
  /** The person's address, already resolved and permitted. */
  email: string;
  subject: string;
  /** When the outcome was recorded; the send is at or before this. */
  at: Date;
  /** Known from the poll row when present (rows written after 2026-09-11). */
  mandrillId?: string | null;
}

export type AsSentResult =
  | {
      found: true;
      mandrillId: string;
      subject: string | null;
      from: string | null;
      sentAt: string;
      html: string | null;
      text: string | null;
      opens: number;
      clicks: number;
      /** Masked. Distinct. What Mandrill saw clicked in this message. */
      clickedUrls: string[];
    }
  | {
      found: false;
      reason: 'not_in_search' | 'content_expired' | 'recipient_mismatch' | 'mandrill_unavailable' | 'not_configured';
    };

/** Blank every secret-looking query value. Idempotent, safe on non-URLs. Shared with the poll. */
export const maskSecrets = maskUrlSecrets;

/**
 * Mandrill rewrites every link in a sent email through its click tracker:
 *
 *   http://track.colaberry.com/track/click/<account>/<host>?p=<base64url JSON>
 *
 * and the JSON's `p` field is itself a JSON string carrying the ORIGINAL
 * `url`. Two reasons to unwrap these before the body leaves the server:
 *
 *   1. The clicked URL Mandrill reports is the original, so highlighting has
 *      to compare against the original, not the tracker.
 *   2. The base64 payload contains the original URL VERBATIM — login token
 *      and all — so a mask that only reads query strings would let the
 *      token through, encoded. Found on the first live render, 2026-09-11.
 *
 * A tracker whose payload cannot be decoded keeps its shape but loses the
 * payload (`p=***`), so nothing encoded survives either way.
 */
// `&amp;` as well as `&`: inside an HTML attribute the separator is entity-encoded.
const TRACKED_LINK = /https?:\/\/[^\s"'<>]*?\/track\/click\/[^\s"'<>]*?(?:\?|&amp;|&)p=([A-Za-z0-9_-]+)[^\s"'<>]*/g;

export function unwrapTrackingLinks(value: string): string {
  if (!value) return value;
  return value.replace(TRACKED_LINK, (whole, payload: string) => {
    try {
      const outer = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { p?: unknown };
      const inner = typeof outer.p === 'string' ? (JSON.parse(outer.p) as { url?: unknown }) : null;
      if (inner && typeof inner.url === 'string' && /^https?:\/\//i.test(inner.url)) return maskUrlSecrets(inner.url);
    } catch {
      // Not a payload we understand; fall through to blanking it.
    }
    return whole.replace(/((?:\?|&amp;|&)p=)[A-Za-z0-9_-]+/, '$1***');
  });
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * Among this recipient's messages, the one this outcome is about: same
 * subject, sent at or before the outcome (a poll records after the fact), the
 * latest such. Falls back to the nearest by time if none precedes it, because
 * clock skew between the poll and Mandrill is real and a near miss beats
 * "not found".
 */
export function pickMessage(hits: MandrillSearchHit[], subject: string, at: Date): MandrillSearchHit | null {
  const want = norm(subject);
  const same = hits.filter((h) => norm(h.subject) === want && typeof h.ts === 'number');
  if (same.length === 0) return null;
  const atSec = Math.floor(at.getTime() / 1000) + 300; // five minutes of slack
  const before = same.filter((h) => h.ts <= atSec).sort((a, b) => b.ts - a.ts);
  if (before.length) return before[0];
  return same.sort((a, b) => Math.abs(a.ts - atSec) - Math.abs(b.ts - atSec))[0];
}

const isoDay = (d: Date) => d.toISOString().split('T')[0];

function recipientOf(content: MandrillContent): string {
  const to = content.to;
  if (Array.isArray(to)) return norm(to[0]?.email);
  return norm(to?.email);
}

function isApiError(v: unknown): v is { status: 'error'; name?: string } {
  return !!v && typeof v === 'object' && (v as { status?: string }).status === 'error';
}

export async function fetchMessageAsSent(q: AsSentQuery, post: MandrillPost | null): Promise<AsSentResult> {
  if (!post) return { found: false, reason: 'not_configured' };
  const email = norm(q.email);
  if (!email) return { found: false, reason: 'not_in_search' };

  try {
    // Search first even when an id is known: it is the recipient-scoped
    // lookup, and it is where clicks_detail lives.
    const from = new Date(q.at.getTime() - 2 * 86400000);
    const to = new Date(q.at.getTime() + 86400000);
    const hitsRaw = await post('messages/search.json', {
      query: `email:${email}`,
      date_from: isoDay(from),
      date_to: isoDay(to),
      limit: 200,
    });
    if (!Array.isArray(hitsRaw)) return { found: false, reason: 'mandrill_unavailable' };
    const hits = hitsRaw as MandrillSearchHit[];

    const hit = q.mandrillId
      ? hits.find((h) => h._id === q.mandrillId) ?? pickMessage(hits, q.subject, q.at)
      : pickMessage(hits, q.subject, q.at);
    if (!hit) return { found: false, reason: 'not_in_search' };
    // The search was scoped to this recipient; a hit for anyone else is a
    // contract violation on Mandrill's side and is refused rather than shown.
    if (hit.email && norm(hit.email) !== email) return { found: false, reason: 'recipient_mismatch' };

    const content = await post('messages/content.json', { id: hit._id });
    if (isApiError(content)) {
      return { found: false, reason: content.name === 'Unknown_Message' ? 'content_expired' : 'mandrill_unavailable' };
    }
    const c = content as MandrillContent;
    const recipient = recipientOf(c);
    if (recipient && recipient !== email) return { found: false, reason: 'recipient_mismatch' };

    const clicked: string[] = [];
    for (const d of hit.clicks_detail ?? []) {
      const u = typeof d?.url === 'string' ? maskSecrets(d.url.slice(0, 500)) : '';
      if (u && !clicked.includes(u)) clicked.push(u);
    }

    return {
      found: true,
      mandrillId: hit._id,
      subject: c.subject ?? hit.subject ?? null,
      from: c.from_email ?? hit.sender ?? null,
      sentAt: new Date((c.ts ?? hit.ts) * 1000).toISOString(),
      // Unwrap FIRST: the tracker payload carries the original URL encoded,
      // where the query-string mask cannot see it.
      html: typeof c.html === 'string' ? maskSecrets(unwrapTrackingLinks(c.html)) : null,
      text: typeof c.text === 'string' ? maskSecrets(unwrapTrackingLinks(c.text)) : null,
      opens: hit.opens ?? 0,
      clicks: hit.clicks ?? 0,
      clickedUrls: clicked,
    };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.warn(JSON.stringify({
      level: 'warn', service: 'backend', event: 'mandrill_message_content_failed',
      error_class: e?.name || 'Error', message: e?.message,
      // Subject only. Never the recipient.
      context: { subject: q.subject.slice(0, 120) },
    }));
    return { found: false, reason: 'mandrill_unavailable' };
  }
}

/**
 * The production `post`: Mandrill's REST API with the account key, bounded at
 * 10 seconds. Null when the key is not configured, so the caller can say so.
 */
export function mandrillPoster(apiKey: string | undefined, timeoutMs = 10000): MandrillPost | null {
  if (!apiKey) return null;
  return async (path, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(`https://mandrillapp.com/api/1.0/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: apiKey, ...body }),
        signal: controller.signal,
      });
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  };
}
