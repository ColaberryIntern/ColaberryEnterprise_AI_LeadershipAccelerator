import { Request, Response } from 'express';
import RawLeadPayload from '../models/RawLeadPayload';
import ProjectUnderstandingRecord from '../models/ProjectUnderstandingRecord';
import { prototypeHtml, PROTOTYPE_TTL_DAYS } from '../services/delivery/appPrototypeService';

/**
 * GET /api/flotation/app/:token/:key
 *
 * One generated concept, rendered on its own so a prospect can open it on a phone from a QR
 * code during the conversation.
 *
 * ## The CSP is the point of this file
 *
 * This serves model-written HTML from our own origin. The generator already refuses a
 * concept containing a script tag, an inline handler, a `javascript:` URL or an embedded
 * frame - but a generator gate is one layer, and one layer is not enough to bet a
 * prospect's browser on.
 *
 * `sandbox` with no allow-tokens means: no scripts, no forms, no popups, no top-level
 * navigation, and a unique opaque origin, so nothing here can touch anything of ours.
 * `default-src 'none'` means it cannot fetch, and cannot phone anywhere. Inline styles are
 * the single exception, because the concept's design is a `<style>` block and without it
 * there is nothing to look at.
 */
const CONCEPT_CSP = [
  "sandbox",
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

function chrome(title: string, body: string): string {
  // Deliberately minimal, and deliberately labelled. Somebody arriving here from a QR code
  // with no other context should be able to tell in one line that this is a concept rather
  // than a product they can sign up for.
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} — concept</title>
<style>
  body { margin: 0; background: #F7F6F4; font-family: ui-sans-serif, system-ui, sans-serif; }
  .concept-banner {
    padding: 10px 16px; background: #1A1917; color: #F7F6F4;
    font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
  }
  .concept-banner b { color: #E4703C; font-weight: 600; }
</style>
</head><body>
<div class="concept-banner"><b>Concept</b> &nbsp;AI Flotation &mdash; illustrative, not a working product</div>
${body}
</body></html>`;
}

export async function handleFlotationApp(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params.token || '').trim();
    const key = String(req.params.key || '').trim();
    if (!token || !key) {
      res.status(404).type('html').send(chrome('Not found', '<p style="padding:2rem">Nothing here.</p>'));
      return;
    }

    let payload: any = null;
    try {
      payload = await RawLeadPayload.findByPk(token);
    } catch {
      payload = null;
    }

    if (!payload?.resulting_lead_id) {
      // Identical answer to every other failure, as elsewhere: a wrong token, a malformed
      // one and one that produced no lead must not be distinguishable.
      res.status(404).type('html').send(chrome('Not found', '<p style="padding:2rem">Nothing here.</p>'));
      return;
    }

    const record: any = await ProjectUnderstandingRecord.findOne({
      where: { lead_id: payload.resulting_lead_id },
      order: [['created_at', 'DESC']],
    });

    if (!record) {
      res.status(404).type('html').send(chrome('Not found', '<p style="padding:2rem">Nothing here.</p>'));
      return;
    }

    const result = await prototypeHtml(record.id, key);

    if (!result.ok) {
      const body =
        result.reason === 'expired'
          ? `<div style="padding:2rem;max-width:34rem;font-size:15px;line-height:1.6">
               <h1 style="font-size:1.25rem">This concept has expired</h1>
               <p>Concepts are kept for ${PROTOTYPE_TTL_DAYS} days. This one was a sketch of an idea,
               not a product, and it is no longer being served. Talk to us and we will make a fresh one.</p>
             </div>`
          : '<p style="padding:2rem">Nothing here.</p>';

      res.status(result.reason === 'expired' ? 410 : 404).type('html').send(chrome('Concept', body));
      return;
    }

    res.setHeader('Content-Security-Policy', CONCEPT_CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // Concepts are per-prospect and expire; nothing about them should sit in a shared cache.
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');

    res.status(200).type('html').send(chrome(result.title, result.html));
  } catch (err: any) {
    console.error('[FlotationApp] error:', err?.message);
    res.status(500).type('html').send(chrome('Unavailable', '<p style="padding:2rem">We could not load this right now.</p>'));
  }
}
