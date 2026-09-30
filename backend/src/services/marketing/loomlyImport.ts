import type { ProviderKey } from '../publishing/providerCapabilities';

/**
 * loomlyImport — spec section 18 Stage B, the pure half: parse a Loomly export, map each row
 * onto our model, classify it, and deduplicate. No I/O. The persisting half is
 * loomlyImportService.ts; the operator entry point is scripts/importLoomlyExport.ts.
 *
 * HEADER-DRIVEN, NOT POSITION-DRIVEN. Nobody on this build has seen a real Loomly export
 * (there is no Loomly reference anywhere in the repo as of 2026-09-11), and the spec says
 * outright not to assume the export carries provider ids or full analytics. So the mapping
 * below is a set of ACCEPTED HEADER ALIASES per field, the parser reports every header it
 * did not recognise and every required field it could not find, and the first dry run
 * against a real file is how the aliases get corrected. A mapping that silently read column
 * 7 as "content" would import garbage with a green summary.
 *
 * THE DEDUP KEY IS THE SPEC'S: provider account + external id (or permalink) + published
 * timestamp. Two rows with the same key are the same post however many times Loomly
 * exported it. A row with no external id AND no permalink cannot be deduplicated against a
 * live provider and is imported keyed on (account, content hash, timestamp) with an
 * exception noting the weaker key.
 */

export type LoomlyRow = Record<string, string>;

export type ImportKind = 'history' | 'scheduled_draft' | 'draft';

export type ExceptionCode =
  | 'missing_column'
  | 'unknown_column'
  | 'unknown_channel'
  | 'bad_date'
  | 'empty_content'
  | 'weak_key'
  | 'duplicate_in_batch'
  | 'duplicate_existing'
  | 'unknown_calendar';

export interface ImportException {
  /** 1-based data row number (header is row 0). 0 for file-level exceptions. */
  row: number;
  code: ExceptionCode;
  detail: string;
}

export interface MappedPost {
  row: number;
  kind: ImportKind;
  calendar: string;
  provider: ProviderKey;
  /** Loomly's account label for the channel, as exported. Part of the dedup key. */
  account: string;
  externalId: string | null;
  permalink: string | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  text: string;
  mediaUrls: string[];
  labels: string[];
  author: string | null;
  loomlyStatus: string;
  /** The dedup key: account | external id or permalink | published timestamp. */
  key: string;
  keyStrength: 'strong' | 'weak';
}

/** Field -> accepted header spellings (compared case- and space-insensitively). */
export const HEADER_ALIASES: Record<string, readonly string[]> = {
  calendar: ['calendar', 'calendar name', 'brand'],
  channel: ['channel', 'channels', 'platform', 'network', 'social channel'],
  account: ['account', 'account name', 'page', 'profile', 'channel account'],
  status: ['status', 'post status'],
  scheduledFor: ['scheduled date', 'scheduled at', 'scheduled', 'publish date', 'schedule'],
  publishedAt: ['published date', 'published at', 'published', 'publication date'],
  content: ['content', 'text', 'message', 'post content', 'caption', 'body'],
  media: ['media', 'media urls', 'attachments', 'images', 'assets'],
  labels: ['labels', 'tags', 'label'],
  externalId: ['external id', 'post id', 'provider post id', 'platform id', 'network post id'],
  permalink: ['permalink', 'post url', 'url', 'link', 'live url'],
  author: ['author', 'created by', 'owner'],
  loomlyId: ['id', 'loomly id', 'loomly post id'],
};

export const REQUIRED_FIELDS = ['calendar', 'channel', 'status', 'content'] as const;

const CHANNEL_TO_PROVIDER: Record<string, ProviderKey> = {
  facebook: 'meta_facebook_page', 'facebook page': 'meta_facebook_page', fb: 'meta_facebook_page',
  instagram: 'meta_instagram', ig: 'meta_instagram', 'instagram business': 'meta_instagram',
  linkedin: 'linkedin_organization', 'linkedin page': 'linkedin_organization', 'linkedin company': 'linkedin_organization',
  'linkedin profile': 'linkedin_member', 'linkedin personal': 'linkedin_member',
  twitter: 'x', x: 'x', 'x (twitter)': 'x',
  youtube: 'youtube', tiktok: 'tiktok',
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ── CSV ─────────────────────────────────────────────────────────────────────────────────────

/** RFC 4180: quoted fields may contain commas, newlines and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export interface HeaderMap {
  /** field -> column index */
  columns: Record<string, number>;
  exceptions: ImportException[];
}

export function mapHeader(header: string[]): HeaderMap {
  const columns: Record<string, number> = {};
  const exceptions: ImportException[] = [];
  const claimed = new Set<number>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = header.findIndex((h, i) => !claimed.has(i) && aliases.includes(norm(h)));
    if (idx >= 0) { columns[field] = idx; claimed.add(idx); }
  }
  header.forEach((h, i) => {
    if (!claimed.has(i)) exceptions.push({ row: 0, code: 'unknown_column', detail: `Column "${h}" is not mapped and will be ignored.` });
  });
  for (const f of REQUIRED_FIELDS) {
    if (columns[f] === undefined) exceptions.push({ row: 0, code: 'missing_column', detail: `No column found for "${f}" (accepted: ${HEADER_ALIASES[f].join(', ')}).` });
  }
  return { columns, exceptions };
}

// ── Row mapping ─────────────────────────────────────────────────────────────────────────────

function parseDate(raw: string | undefined): string | null | 'bad' {
  if (!raw || raw.trim() === '') return null;
  const ms = Date.parse(raw.trim());
  if (Number.isNaN(ms)) return 'bad';
  return new Date(ms).toISOString();
}

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[;|\n]/).map((s) => s.trim()).filter(Boolean);
}

export function classify(loomlyStatus: string, publishedAt: string | null, scheduledFor: string | null, now: Date): ImportKind {
  const s = norm(loomlyStatus);
  if (publishedAt || s === 'published' || s === 'posted' || s === 'live') return 'history';
  if (scheduledFor && Date.parse(scheduledFor) > now.getTime()) return 'scheduled_draft';
  return 'draft';
}

function hashText(s: string): string {
  // FNV-1a, enough to distinguish content within one account/timestamp. Not a security hash.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function mapRow(cells: string[], map: HeaderMap, rowNumber: number, now: Date): { post: MappedPost | null; exceptions: ImportException[] } {
  const get = (f: string) => (map.columns[f] === undefined ? undefined : cells[map.columns[f]]);
  const exceptions: ImportException[] = [];

  const channelRaw = get('channel') ?? '';
  const provider = CHANNEL_TO_PROVIDER[norm(channelRaw)];
  if (!provider) {
    exceptions.push({ row: rowNumber, code: 'unknown_channel', detail: `Channel "${channelRaw}" is not one of the seven providers this platform knows.` });
    return { post: null, exceptions };
  }

  const text = (get('content') ?? '').trim();
  const mediaUrls = splitList(get('media'));
  if (text === '' && mediaUrls.length === 0) {
    exceptions.push({ row: rowNumber, code: 'empty_content', detail: 'No content and no media.' });
    return { post: null, exceptions };
  }

  const publishedAt = parseDate(get('publishedAt'));
  const scheduledFor = parseDate(get('scheduledFor'));
  if (publishedAt === 'bad' || scheduledFor === 'bad') {
    exceptions.push({ row: rowNumber, code: 'bad_date', detail: `Unparseable date: published="${get('publishedAt') ?? ''}" scheduled="${get('scheduledFor') ?? ''}".` });
    return { post: null, exceptions };
  }

  const calendar = (get('calendar') ?? '').trim();
  const account = (get('account') ?? '').trim() || `${calendar}/${provider}`;
  const externalId = (get('externalId') ?? '').trim() || null;
  const permalink = (get('permalink') ?? '').trim() || null;
  const kind = classify(get('status') ?? '', publishedAt, scheduledFor, now);

  let keyStrength: MappedPost['keyStrength'] = 'strong';
  let identity = externalId ?? permalink;
  if (!identity) {
    identity = `content:${hashText(text + '|' + mediaUrls.join('|'))}`;
    keyStrength = 'weak';
    if (kind === 'history') {
      exceptions.push({ row: rowNumber, code: 'weak_key', detail: 'Published post has neither an external id nor a permalink; deduplicated on content hash instead. Cannot be reconciled to the live post.' });
    }
  }
  const stamp = publishedAt ?? scheduledFor ?? 'unscheduled';
  const key = `${norm(account)}|${identity}|${stamp}`;

  return {
    post: {
      row: rowNumber, kind, calendar, provider, account, externalId, permalink, publishedAt, scheduledFor,
      text, mediaUrls, labels: splitList(get('labels')), author: (get('author') ?? '').trim() || null,
      loomlyStatus: (get('status') ?? '').trim(), key, keyStrength,
    },
    exceptions,
  };
}

// ── Whole-file plan ─────────────────────────────────────────────────────────────────────────

export interface ImportPlan {
  posts: MappedPost[];
  exceptions: ImportException[];
  counts: { rows: number; mapped: number; history: number; scheduledDraft: number; draft: number; duplicatesInBatch: number; skipped: number };
}

/** Parse + map + in-batch dedup. Existing-row dedup needs the store and happens in the service. */
export function planImport(csvText: string, now: Date = new Date()): ImportPlan {
  const rows = parseCsv(csvText);
  const header = rows[0] ?? [];
  const map = mapHeader(header);
  const exceptions = [...map.exceptions];
  const posts: MappedPost[] = [];
  const seen = new Set<string>();
  let duplicatesInBatch = 0;
  let skipped = 0;

  if (map.exceptions.some((e) => e.code === 'missing_column')) {
    return { posts: [], exceptions, counts: { rows: rows.length - 1, mapped: 0, history: 0, scheduledDraft: 0, draft: 0, duplicatesInBatch: 0, skipped: rows.length - 1 } };
  }

  rows.slice(1).forEach((cells, i) => {
    const rowNumber = i + 1;
    const { post, exceptions: ex } = mapRow(cells, map, rowNumber, now);
    exceptions.push(...ex);
    if (!post) { skipped += 1; return; }
    if (seen.has(post.key)) {
      duplicatesInBatch += 1;
      exceptions.push({ row: rowNumber, code: 'duplicate_in_batch', detail: `Same account, id/permalink and timestamp as an earlier row (key ${post.key}).` });
      return;
    }
    seen.add(post.key);
    posts.push(post);
  });

  return {
    posts,
    exceptions,
    counts: {
      rows: rows.length - 1,
      mapped: posts.length,
      history: posts.filter((p) => p.kind === 'history').length,
      scheduledDraft: posts.filter((p) => p.kind === 'scheduled_draft').length,
      draft: posts.filter((p) => p.kind === 'draft').length,
      duplicatesInBatch,
      skipped,
    },
  };
}

/** The exception report, as markdown. One row per exception; the format the runbook shows. */
export function renderExceptionReport(exceptions: readonly ImportException[], source: string, when: Date): string {
  const lines = [
    `# Loomly import exception report`,
    ``,
    `- Source: \`${source}\``,
    `- Generated: ${when.toISOString()}`,
    `- Exceptions: ${exceptions.length}`,
    ``,
    `| Row | Code | Detail |`,
    `|---:|---|---|`,
    ...exceptions.map((e) => `| ${e.row} | \`${e.code}\` | ${e.detail.replace(/\|/g, '\\|')} |`),
    ``,
    `Codes: \`missing_column\` (file rejected), \`unknown_column\` (ignored), \`unknown_channel\`, \`empty_content\`, \`bad_date\` (row skipped), \`weak_key\` (imported, not reconcilable), \`duplicate_in_batch\` / \`duplicate_existing\` (skipped), \`unknown_calendar\` (skipped).`,
    ``,
  ];
  return lines.join('\n');
}
