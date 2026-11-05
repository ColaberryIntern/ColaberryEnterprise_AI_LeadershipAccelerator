import type { HumanNeed } from './proposalReviewTypes';

/**
 * placeholderNeeds — the pure half of v3's "placeholders are always questions" rule. The AI drafter writes
 * `[PLACEHOLDER: <the question>]` wherever it could not fill a fact from grounded sources (the no-fabrication rail).
 * This turns every such marker into a typed `HumanNeed`, deduped by a stable `need_key` so one ask shared across
 * documents collapses to a single need. The marker stays in the content until the answer arrives; the write path
 * (the draft/revise cycle) persists these to `gov_proposal_document_gaps` and never leaves a marker without an open
 * need — the invariant the test here guards at the pure level.
 */

/** Stable, dedupe-safe key from an ask (shared shape with classifyFinding's fact keys). */
export function needKeyForFact(ask: string): string {
  const slug = ask.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return `fact:${slug || 'unspecified'}`;
}

export interface ParsedPlaceholder {
  /** The raw question text inside the marker. */
  ask: string;
  needKey: string;
  need: HumanNeed;
}

const MARKER = /\[PLACEHOLDER:\s*([^\]]+?)\s*\]/gi;

/**
 * Every `[PLACEHOLDER: …]` in the content, as a deduped list of needs (one per distinct ask). An explicit `key:` or
 * `need:` prefix inside the marker is honored for the dedupe key; otherwise the key is normalized from the text.
 * Pure — no I/O. `opts.sectionKey` tags where it was used; `opts.docKey` is required for `usedIn`.
 */
export function parsePlaceholderNeeds(
  contentHtml: string | null | undefined,
  docKey: string,
  opts?: { sectionKey?: string },
): ParsedPlaceholder[] {
  const text = typeof contentHtml === 'string' ? contentHtml : '';
  const byKey = new Map<string, ParsedPlaceholder>();
  let m: RegExpExecArray | null = MARKER.exec(text);
  while (m) {
    const rawAsk = m[1].trim();
    if (rawAsk) {
      // Allow `[PLACEHOLDER: key=years_in_business | How many years…]` to pin a dedupe key explicitly.
      const keyed = /^(?:key|need)\s*=\s*([a-z0-9:_]+)\s*\|\s*(.+)$/i.exec(rawAsk);
      const ask = keyed ? keyed[2].trim() : rawAsk;
      const needKey = keyed ? (keyed[1].includes(':') ? keyed[1] : `fact:${keyed[1]}`) : needKeyForFact(ask);
      const existing = byKey.get(needKey);
      if (existing) {
        if (opts?.sectionKey && !existing.need.usedIn.some((u) => u.docKey === docKey && u.sectionKey === opts.sectionKey)) {
          existing.need.usedIn.push({ docKey, sectionKey: opts.sectionKey });
        }
      } else {
        const need: HumanNeed = {
          kind: 'fact',
          key: needKey,
          ask,
          why: 'The draft could not fill this from a grounded fact, so it left a placeholder instead of inventing one. The section cannot pass until it is answered.',
          usedIn: docKey ? [{ docKey, sectionKey: opts?.sectionKey }] : [],
          format: 'a short, factual answer (the agent writes it into the section)',
          blocking: 'fatal',
        };
        byKey.set(needKey, { ask, needKey, need });
      }
    }
    m = MARKER.exec(text);
  }
  MARKER.lastIndex = 0;
  return [...byKey.values()];
}

/** The invariant, as a predicate: content that still has a marker must produce at least one need. */
export function everyMarkerHasNeed(contentHtml: string | null | undefined, docKey: string): boolean {
  const markerCount = (typeof contentHtml === 'string' ? contentHtml.match(/\[PLACEHOLDER:/gi) : null)?.length ?? 0;
  if (markerCount === 0) return true;
  return parsePlaceholderNeeds(contentHtml, docKey).length > 0;
}
