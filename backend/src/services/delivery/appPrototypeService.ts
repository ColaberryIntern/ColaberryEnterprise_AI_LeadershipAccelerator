/**
 * appPrototypeService — their app, on their phone, about fifteen seconds after they stop
 * talking.
 *
 * §20 asks for interactive concepts; §21 says they are temporary, isolated, expiring and
 * clearly labelled. The generator for them has existed for a while and nothing served the
 * result, so nobody outside a test script had ever seen one.
 *
 * This stores them against the understanding and hands out two things: a URL that renders
 * one concept on its own, and a QR code pointing at that URL. The QR is the part that turns
 * a document into a demonstration - a prospect holds up their phone during the call and is
 * looking at their own product.
 *
 * ## Serving model-written HTML from our own origin
 *
 * This is the risk that matters here, and it is handled in two independent layers rather
 * than one:
 *
 *   1. The concept is REFUSED at generation if it contains a script tag, an inline event
 *      handler, a `javascript:` URL, or an embedded frame (`executableViolation`).
 *   2. What survives is served under a sandbox CSP with `default-src 'none'`, so even a
 *      bypass of the first layer executes nothing and can reach nothing.
 *
 * Either layer alone would probably do. Neither alone is worth betting a prospect's browser
 * on, and the cost of both is a header and a regex.
 *
 * ## Expiry
 *
 * §21 requires it, and it is also just honest: these are concepts, not a product, and one
 * still resolving a month later would be treated as a promise. Expired links say what they
 * were rather than 404ing, so somebody returning to an old one learns what happened.
 */

import QRCode from 'qrcode';
import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { projectBlueprint } from './buildBlueprint';
import { buildDesignBrief } from './designBrief';
import { generateConcepts, type GeneratedConcept } from './uiConceptGenerator';
import type { ProjectUnderstanding } from './projectUnderstanding';

/** §21 wants expiry. Fourteen days outlasts a sales conversation and not much else. */
export const PROTOTYPE_TTL_DAYS = 14;

export interface StoredPrototype {
  key: string;
  title: string;
  recommended: boolean;
  rationale: string;
  html: string;
}

export interface PrototypeSet {
  concepts: StoredPrototype[];
  generated_at: string;
  expires_at: string;
}

export interface PrototypeLink {
  key: string;
  title: string;
  recommended: boolean;
  rationale: string;
  /** Where this concept renders on its own, for a phone. */
  url: string;
  /** The same URL as a scannable SVG, inlined so the page needs no extra request. */
  qr_svg: string;
}

const isExpired = (set: PrototypeSet): boolean => new Date(set.expires_at).getTime() < Date.now();

/**
 * Generate the concept set for an understanding, once.
 *
 * Returns whatever survived the gates. A partial set is worth showing - two good concepts
 * beat none - but an empty one is reported so the page can leave the section out rather
 * than render an empty gallery.
 */
export async function ensurePrototypes(recordId: string): Promise<PrototypeSet | null> {
  const record: any = await ProjectUnderstandingRecord.findByPk(recordId);
  if (!record || record.status !== 'extracted') return null;

  const existing = (record.scope as any)?.prototypes as PrototypeSet | undefined;
  if (existing && !isExpired(existing)) return existing;

  const understanding: ProjectUnderstanding = {
    title: record.title || 'Your project',
    proposed_surfaces: record.proposed_surfaces || [],
    items: record.items || [],
  };

  const brief = buildDesignBrief(understanding, projectBlueprint(understanding));

  // The lead's real contact details, so the leak check runs against what a leak would
  // actually look like. Read from the Lead rather than the understanding record, which has
  // no contact columns - passing undefined here would silently disable the check.
  let contact: { email?: string | null; phone?: string | null } = {};
  try {
    const Lead = (await import('../../models/Lead')).default;
    const lead: any = record.lead_id ? await Lead.findByPk(record.lead_id) : null;
    if (lead) contact = { email: lead.email || null, phone: lead.phone || null };
  } catch (err: any) {
    console.warn('[AppPrototype] could not load contact for leak check:', err?.message);
  }

  const result = await generateConcepts({ brief, contact });

  if (!result.ok) {
    console.warn('[AppPrototype] no concepts survived:', result.error);
    return null;
  }

  const now = new Date();
  const set: PrototypeSet = {
    concepts: result.concepts.map((c: GeneratedConcept) => ({
      key: c.key,
      title: c.title,
      recommended: c.recommended,
      rationale: c.rationale,
      html: c.html,
    })),
    generated_at: now.toISOString(),
    expires_at: new Date(now.getTime() + PROTOTYPE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };

  try {
    await record.update({ scope: { ...((record.scope as any) || {}), prototypes: set } });
  } catch (err: any) {
    console.warn('[AppPrototype] could not cache prototypes:', err?.message);
  }

  return set;
}

/**
 * Turn a stored set into what the page needs: a link and a QR per concept.
 *
 * The QR is generated as SVG rather than a PNG data URI so it stays crisp when someone
 * leans in with a phone, which is exactly what it exists for.
 */
export async function prototypeLinks(token: string, set: PrototypeSet, baseUrl: string): Promise<PrototypeLink[]> {
  return Promise.all(
    set.concepts.map(async (c) => {
      const url = `${baseUrl.replace(/\/$/, '')}/api/flotation/app/${encodeURIComponent(token)}/${encodeURIComponent(c.key)}`;
      const qr_svg = await QRCode.toString(url, {
        type: 'svg',
        margin: 1,
        // Medium correction: a phone camera at arm's length copes, and the code stays
        // sparse enough to read on a laptop screen rather than turning into noise.
        errorCorrectionLevel: 'M',
        color: { dark: '#1A1917', light: '#FFFFFF' },
      });

      return { key: c.key, title: c.title, recommended: c.recommended, rationale: c.rationale, url, qr_svg };
    }),
  );
}

export type PrototypeHtmlResult =
  | { ok: true; html: string; title: string }
  | { ok: false; reason: 'not_found' | 'expired' };

/** One concept, ready to serve. Expiry is reported rather than hidden behind a 404. */
export async function prototypeHtml(recordId: string, key: string): Promise<PrototypeHtmlResult> {
  const record: any = await ProjectUnderstandingRecord.findByPk(recordId);
  const set = (record?.scope as any)?.prototypes as PrototypeSet | undefined;
  if (!set) return { ok: false, reason: 'not_found' };
  if (isExpired(set)) return { ok: false, reason: 'expired' };

  const concept = set.concepts.find((c) => c.key === key);
  if (!concept) return { ok: false, reason: 'not_found' };

  return { ok: true, html: concept.html, title: concept.title };
}
