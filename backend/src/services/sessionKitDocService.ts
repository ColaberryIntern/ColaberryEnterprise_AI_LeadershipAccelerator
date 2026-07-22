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
import { buildSessionKit } from './sessionKitService';
import { buildKitSpec } from './classKit/kitSpec';
import { renderKitHtml } from './classKit/kitHtml';

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

  return renderKitHtml(spec, { live: { enabled: false } });
}
