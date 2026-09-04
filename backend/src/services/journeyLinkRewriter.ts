import { BrandDomain } from '../models';
import { buildJourneyUrl } from '../modules/attribution/journeyLinkService';

/**
 * Append a per-recipient journey token to links that point at our own brands.
 *
 * WHY AT SEND TIME, AND NOWHERE ELSE. A `jx` token lives 30 minutes. Sequence bodies are
 * rendered at ENROLLMENT — `replaceVars` in sequenceService — and stored on
 * `ScheduledEmail` to be sent days or weeks later under `delay_days` or cohort T-minus
 * scheduling. A token minted there would be expired long before the mail was sent, let
 * alone clicked. So this runs against the composed HTML immediately before handing it to
 * the mailer, which is the same place and for the same reason that
 * `buildUnsubscribeUrl` mints its signed per-recipient URL.
 *
 * WHY NOT `generateTrackedLink`, THE OBVIOUS PLACE. That builds ONE link per campaign and
 * stores it on the campaign row, so every recipient receives the same URL. A token there
 * would put one person's identity into everybody's email, and any recipient could bind
 * their browser to another's journey — precisely the attack the token design exists to
 * prevent. Per-recipient means per-recipient.
 *
 * THE ALLOWLIST IS THE SECURITY PROPERTY. A token is only ever appended to a hostname
 * registered in `brand_domains`. Appending one to a third-party URL would hand our
 * visitor and lead identifiers to whoever runs that host, in a query string that lands in
 * their access logs. The rewrite is therefore opt-in by hostname, never opt-out.
 */

/** Purposes whose hostnames are ours to send people to. */
const LINKABLE_PURPOSES = ['web', 'app'] as const;

/** 5 minutes. Long enough that a send batch queries once; short enough that registering a
 *  new domain takes effect without a deploy. */
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { hosts: Set<string>; expiresAt: number } | null = null;

/** Hostnames we own, lowercased. Cached, and fail-safe to empty. */
export async function getLinkableHostnames(now: Date = new Date()): Promise<Set<string>> {
  if (cache && cache.expiresAt > now.getTime()) return cache.hosts;
  try {
    const rows = await BrandDomain.findAll({
      attributes: ['hostname', 'purpose'],
      where: { purpose: LINKABLE_PURPOSES as unknown as string[] },
    });
    const hosts = new Set(
      rows.map((r) => String(r.hostname || '').trim().toLowerCase()).filter(Boolean),
    );
    cache = { hosts, expiresAt: now.getTime() + CACHE_TTL_MS };
    return hosts;
  } catch {
    // Fail SAFE, meaning fail to an EMPTY allowlist: a lookup failure must never widen
    // what we are willing to append identifiers to. The cost is a mail with no journey
    // token, which loses attribution and nothing else.
    return new Set();
  }
}

/** Test seam. Nothing in production calls this. */
export function __resetLinkableHostnameCache(): void {
  cache = null;
}

export interface JourneyRewriteContext {
  leadId?: number | null;
  visitorId?: string | null;
  campaignId?: string | null;
  originBrandId?: string | null;
}

const HREF_PATTERN = /href="(https?:\/\/[^"]+)"/gi;

/**
 * Rewrite every same-org link in `html` to carry a freshly-minted token for this
 * recipient. Returns the html unchanged when there is nobody to mint for.
 */
export async function rewriteLinksWithJourneyToken(
  html: string,
  context: JourneyRewriteContext,
): Promise<string> {
  // Nothing to bind means nothing to mint. A token whose payload is all nulls would add a
  // query parameter, a support question, and no information.
  if (!html || (!context.leadId && !context.visitorId)) return html;

  const hosts = await getLinkableHostnames();
  if (hosts.size === 0) return html;

  return html.replace(HREF_PATTERN, (whole, rawUrl: string) => {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      // Unparseable: leave exactly as authored rather than guessing at intent.
      return whole;
    }

    if (!hosts.has(url.hostname.toLowerCase())) return whole;

    // Already carries one — from a template, or a previous pass. Replacing it would
    // silently invalidate whatever minted it.
    if (url.searchParams.has('jx')) return whole;

    // The unsubscribe link carries its own signature and is deliberately not a journey:
    // someone leaving is not a visit to attribute, and rewriting it risks disturbing a
    // one-click unsubscribe that has to keep working under RFC 8058.
    if (url.pathname.startsWith('/api/unsubscribe')) return whole;

    try {
      const rewritten = buildJourneyUrl(url.toString(), {
        leadId: context.leadId ?? null,
        visitorId: context.visitorId ?? null,
        campaignId: context.campaignId ?? null,
        originBrandId: context.originBrandId ?? null,
      });
      return `href="${rewritten}"`;
    } catch {
      // Minting must never take a send down. Attribution is the thing worth losing here.
      return whole;
    }
  });
}
