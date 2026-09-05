/**
 * flotationPreviewService — what the prospect sees, without an email and without a login.
 *
 * ## Why there is no magic link here
 *
 * The plan's journey has no "we will contact you" step, and activation emails are
 * deliberately deferred to a larger communications build. That left an obvious-looking gap:
 * if we cannot email a link, how does the prospect ever see their blueprint?
 *
 * They do not need to go anywhere. The person who pressed "Call me now" is still sitting on
 * /start while their phone rings, so the understanding can surface on the page they are
 * already looking at, while the conversation is still fresh.
 *
 * ## The token is one they already have
 *
 * `/api/leads/ingest` returns `rawPayloadId`, a v4 UUID, to the browser that submitted the
 * form. That is unguessable, already scoped to exactly one submission, and requires no new
 * column, no account and no auth flow. Using anything else here would mean inventing a
 * second identity mechanism for the same person in the same session.
 *
 * What this does NOT do is pretend the link is private forever: anyone holding the URL sees
 * that submission's understanding. It is the prospect's own account of their own business,
 * shown back to them, and it contains nothing about anybody else - but it is a shareable
 * URL rather than a secret, and it should never be used to carry anything more sensitive.
 *
 * ## Four honest states
 *
 * A call takes minutes, and extraction runs after it ends. A page that polls needs to tell
 * the difference between "not started", "still going", "here it is" and "this failed" -
 * because showing a spinner forever when the extraction has already failed is how a person
 * concludes the product is broken and closes the tab.
 */

import RawLeadPayload from '../../models/RawLeadPayload';
import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { summarizeForWow, openQuestions, type ProjectUnderstanding } from './projectUnderstanding';
import { getOrCreateScope, type ProjectScope } from './projectScopeService';
import { ensurePrototypes, prototypeLinks, type PrototypeLink } from './appPrototypeService';
import { confirmationProfile } from './understandingConfirmation';

export type PreviewStatus = 'not_found' | 'pending' | 'ready' | 'failed';

export interface FlotationPreview {
  status: PreviewStatus;
  /** §17's headline numbers. Present only when ready. */
  summary?: ReturnType<typeof summarizeForWow>;
  /** The statements themselves, so they can confirm or correct them. */
  items?: Array<{
    index: number;
    dimension: string;
    value: string;
    classification: string;
    /** Whether this is something they said, or something we worked out. */
    inferred: boolean;
  }>;
  still_open?: string[];
  confirmed?: ReturnType<typeof confirmationProfile>;
  /**
   * The scoped project: what we would build, in what order, what runs itself, and what
   * still needs them. This is the artifact worth paying for. Everything above it is
   * evidence that we listened.
   */
  scope?: ProjectScope;
  /**
   * Their app, as something they can open on a phone. This is the demonstration the scope
   * document argues for: a prospect scans the code during the conversation and is looking
   * at their own product.
   */
  prototypes?: PrototypeLink[];
  /** Why nothing is here yet, in words a person can read. */
  message?: string;
}

/**
 * Where a phone should go.
 *
 * Deliberately NOT derived from the request host. A QR code is scanned by a device that has
 * never talked to this server, so an internal hostname or a relative path produces a code
 * that resolves to nothing. It comes from configuration, defaulting to the public API host
 * this brand's forms already post to.
 */
function publicBaseUrl(): string {
  return process.env.PUBLIC_API_BASE_URL || 'https://enterprise.colaberry.ai';
}

const PENDING_MESSAGE = 'We are still writing up your conversation. This page updates on its own.';

export async function getFlotationPreview(token: string): Promise<FlotationPreview> {
  const id = (token || '').trim();
  if (!id) return { status: 'not_found' };

  // A malformed token is indistinguishable from a wrong one, deliberately: both get the
  // same answer, so this cannot be used to probe which ids exist.
  let payload: any = null;
  try {
    payload = await RawLeadPayload.findByPk(id);
  } catch {
    return { status: 'not_found' };
  }

  if (!payload?.resulting_lead_id) {
    // The submission exists but produced no lead, or does not exist at all. Same answer.
    return { status: 'not_found' };
  }

  const record = await ProjectUnderstandingRecord.findOne({
    where: { lead_id: payload.resulting_lead_id },
    order: [['created_at', 'DESC']],
  });

  if (!record) {
    return { status: 'pending', message: PENDING_MESSAGE };
  }

  if (record.status !== 'extracted') {
    // Say that a person will pick it up, because that is what actually happens - nothing
    // automated retries this yet, and implying otherwise would be a promise the system
    // cannot keep.
    return {
      status: 'failed',
      message: 'We could not write up your conversation. Someone from AI Flotation will pick this up.',
    };
  }

  const understanding: ProjectUnderstanding = {
    title: record.title || 'Your project',
    proposed_surfaces: record.proposed_surfaces || [],
    items: record.items || [],
  };

  // Generated once and cached on the record. A failure here degrades the page rather than
  // breaking it: they still see what we heard.
  let scope: ProjectScope | undefined;
  try {
    const scoped = await getOrCreateScope(record.id);
    if (scoped.ok) scope = scoped.scope;
  } catch (err: any) {
    console.warn('[FlotationPreview] scope unavailable:', err?.message);
  }

  // Concepts and their QR codes. Generated once, cached alongside the scope, and never
  // allowed to fail the page: a scope without prototypes is still worth reading.
  let prototypes: PrototypeLink[] | undefined;
  try {
    const set = await ensurePrototypes(record.id);
    if (set) prototypes = await prototypeLinks(id, set, publicBaseUrl());
  } catch (err: any) {
    console.warn('[FlotationPreview] prototypes unavailable:', err?.message);
  }

  return {
    status: 'ready',
    scope,
    prototypes,
    summary: summarizeForWow(understanding),
    items: understanding.items.map((item, index) => ({
      index,
      dimension: item.dimension,
      value: item.value,
      classification: item.classification,
      inferred: item.provenance === 'ai_inferred',
    })),
    still_open: openQuestions(understanding).map((q) => q.value),
    confirmed: confirmationProfile(understanding),
  };
}
