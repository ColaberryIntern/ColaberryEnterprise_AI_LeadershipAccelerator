// ============================================================================
// sessionKitDocService — renders the full interactive Class Kit teaching deck
// (the Open-House-style HTML that runs a class) for one live session.
//
// Reuses buildSessionKit for the session facts + student check-in QR + cohort +
// meeting link, then buildKitSpec (run of show + slides from the week blueprint)
// and renderKitHtml (self-contained deck). Returns a complete HTML document the
// admin opens in a new tab and shares on screen while teaching.
//
// Live pulse is off here (the deck runs standalone). Wiring the live-state feed
// is a follow-up; renderKitHtml already accepts a { live } config for it.
// ============================================================================
import { env } from '../config/env';
import { buildSessionKit } from './sessionKitService';
import { buildKitSpec } from './classKit/kitSpec';
import { renderKitHtml } from './classKit/kitHtml';
import { mintKitToken } from './classKit/kitToken';

/**
 * Render the Class Kit deck HTML for a session. Returns null if the session does
 * not exist (caller maps that to a 404). Deterministic: the same session yields
 * the same deck, so it is safe to re-open and safe to cache.
 */
export async function renderSessionKitDoc(sessionId: string): Promise<string | null> {
  const kit = await buildSessionKit(sessionId);
  if (!kit) return null;

  const spec = buildKitSpec({
    session: kit.session,
    cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url,
    qrSvg: kit.qr_svg,
    meetLink: kit.meeting_link,
  });

  // Enable the live pulse: the deck (opened via document.write into an about:blank
  // window) polls the session-scoped live-state endpoint with a short-lived kit
  // token. The endpoint must be ABSOLUTE — a relative URL won't resolve from an
  // about:blank document — and it stays same-origin as the admin page (which
  // inherited that origin), so the fetch needs no CORS and no cookies.
  const base = (env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/+$/, '');
  return renderKitHtml(spec, {
    live: {
      enabled: true,
      endpoint: `${base}/api/portal/sessions/${sessionId}/live-state`,
      token: mintKitToken(sessionId),
      pollMs: 4000,
    },
  });
}
