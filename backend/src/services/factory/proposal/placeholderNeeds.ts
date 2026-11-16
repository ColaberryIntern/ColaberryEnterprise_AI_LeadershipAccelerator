import type { HumanNeed, RecordType } from './proposalReviewTypes';

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

/**
 * The GROUPED marker: `[RECORD: reference]` or `[RECORD: personnel]`, optionally with `| slot=2` to pin a slot and
 * `| fields=client,scope,outcome` to override the collected fields. The drafter writes ONE of these per
 * past-performance entry / key person instead of a per-field [PLACEHOLDER], so Client/Scope/Period/Outcome are
 * answered as a single record, never fragmented into atomic facts.
 */
const RECORD_MARKER = /\[RECORD:\s*(reference|personnel)\s*(?:\|\s*([^\]]*?))?\s*\]/gi;

/** Per-type defaults for a `record` need: the fields it collects and the human-facing ask / why / format. */
const RECORD_DEFAULTS: Record<RecordType, { fields: string[]; ask: string; format: string; why: string }> = {
  reference: {
    fields: ['client', 'scope', 'contractValue', 'dates', 'contact'],
    ask: 'Add a past-performance reference (client, scope, period of performance, outcome).',
    format: 'one past-performance record: client, scope, contract value, period of performance, outcome',
    why: 'The draft needs a real past-performance reference it could not ground, so it left a grouped placeholder instead of inventing a client. The section cannot pass until a reference is provided.',
  },
  personnel: {
    fields: ['name', 'role', 'summary'],
    ask: 'Add a key person (name, role, relevant experience).',
    format: 'one key-personnel record: name, role, relevant experience',
    why: 'The draft needs a named key person it could not ground, so it left a grouped placeholder instead of inventing one. The section cannot pass until a person is provided.',
  },
};

/**
 * Every `[RECORD: reference|personnel]` in the content, as deduped `record`-kind needs keyed `reference:<slot>` /
 * `personnel:<slot>` (the canonical cross-document key). Markers with no explicit `slot=` are numbered in order of
 * appearance per type. Pure — no I/O. Same {@link ParsedPlaceholder} shape as placeholders, so the write path
 * persists both identically.
 */
export function parseRecordNeeds(
  contentHtml: string | null | undefined,
  docKey: string,
  opts?: { sectionKey?: string },
): ParsedPlaceholder[] {
  const text = typeof contentHtml === 'string' ? contentHtml : '';
  const byKey = new Map<string, ParsedPlaceholder>();
  const counters: Record<RecordType, number> = { reference: 0, personnel: 0 };
  let m: RegExpExecArray | null = RECORD_MARKER.exec(text);
  while (m) {
    const recordType = m[1].toLowerCase() as RecordType;
    const params = m[2] ? m[2].trim() : '';
    const slotMatch = /slot\s*=\s*(\d{1,3})/i.exec(params);
    const fieldsMatch = /fields\s*=\s*([a-z0-9_,\s]+)/i.exec(params);
    const slot = slotMatch ? Number(slotMatch[1]) : counters[recordType] + 1;
    counters[recordType] = Math.max(counters[recordType], slot);
    const key = `${recordType}:${slot}`;
    const existing = byKey.get(key);
    if (existing) {
      if (opts?.sectionKey && !existing.need.usedIn.some((u) => u.docKey === docKey && u.sectionKey === opts.sectionKey)) {
        existing.need.usedIn.push({ docKey, sectionKey: opts.sectionKey });
      }
    } else {
      const def = RECORD_DEFAULTS[recordType];
      const fields = fieldsMatch ? fieldsMatch[1].split(',').map((s) => s.trim()).filter(Boolean) : def.fields;
      const need: HumanNeed = {
        kind: 'record',
        key,
        ask: def.ask,
        why: def.why,
        usedIn: docKey ? [{ docKey, sectionKey: opts?.sectionKey }] : [],
        format: def.format,
        blocking: 'fatal',
        recordType,
        recordFields: fields,
      };
      byKey.set(key, { ask: def.ask, needKey: key, need });
    }
    m = RECORD_MARKER.exec(text);
  }
  RECORD_MARKER.lastIndex = 0;
  return [...byKey.values()];
}

/** Both marker families from one draft: atomic `[PLACEHOLDER]` facts + grouped `[RECORD]` records. The write path
 *  (reconcilePlaceholderGaps) uses THIS, so a grouped record persists as one gap carrying a `record` need. */
export function parseDraftNeeds(
  contentHtml: string | null | undefined,
  docKey: string,
  opts?: { sectionKey?: string },
): ParsedPlaceholder[] {
  return [...parsePlaceholderNeeds(contentHtml, docKey, opts), ...parseRecordNeeds(contentHtml, docKey, opts)];
}

/** The invariant, as a predicate: content that still has a marker (placeholder OR record) must produce >=1 need. */
export function everyMarkerHasNeed(contentHtml: string | null | undefined, docKey: string): boolean {
  const text = typeof contentHtml === 'string' ? contentHtml : '';
  const markerCount = (text.match(/\[PLACEHOLDER:/gi)?.length ?? 0) + (text.match(/\[RECORD:/gi)?.length ?? 0);
  if (markerCount === 0) return true;
  return parseDraftNeeds(text, docKey).length > 0;
}
