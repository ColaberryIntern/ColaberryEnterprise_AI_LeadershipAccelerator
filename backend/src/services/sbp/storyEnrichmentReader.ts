import { randomUUID } from 'crypto';
import { ENRICHMENT_DIR, MAX_ENRICHMENT_BYTES, parseEnrichment } from './storyEnrichmentContract';
import { applyStoryEnrichment, type ApplyResult } from './storyEnrichmentService';

/**
 * storyEnrichmentReader - find the enrichment files a story wrote, and apply
 * them. I/O (GitHub).
 *
 * Runs from the push webhook after story verification, on the same branch
 * verification read. Lists `.colaberry/enrichment/` with the contents API
 * (404 means the directory does not exist, which is the normal state of a
 * repo whose stories have not started), then reads each file. Bounded on
 * count and on size, with an explicit timeout on every request, because a
 * webhook handler that hangs is a webhook GitHub will stop delivering.
 *
 * Everything found is handed to `applyStoryEnrichment`, which is idempotent,
 * so reading every file on every push is correct rather than wasteful: an
 * unchanged file costs one ledger lookup.
 */

export const MAX_ENRICHMENT_FILES = 60;
const REQUEST_TIMEOUT_MS = 10_000;

export interface EnrichmentIngestTarget {
  owner: string;
  repo: string;
  branch?: string | null;
}

export interface EnrichmentIngestSummary {
  files_seen: number;
  applied: ApplyResult[];
  /** Files that could not be read or did not parse: path and class. */
  skipped: Array<{ path: string; error_class: string; reason: string }>;
  error_class: string | null;
}

interface GhFile { path: string; type: string; size: number; name: string }

function apiBase(): string {
  return process.env.GITHUB_API_URL || 'https://api.github.com';
}

function log(event: string, outcome: 'success' | 'failure' | 'partial', ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'backend', event, outcome, context: ctx }));
}

async function gh(path: string, token: string, fetchImpl: typeof fetch): Promise<{ status: number; body: unknown }> {
  const res = await fetchImpl(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'colaberry-accelerator' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

function decode(body: unknown): string | null {
  const b = body as { content?: unknown; encoding?: unknown } | null;
  if (!b || typeof b.content !== 'string') return null;
  if (b.encoding && b.encoding !== 'base64') return null;
  return Buffer.from(b.content, 'base64').toString('utf8');
}

/** The story id a file name encodes, or null when the name is not one. */
export function storyIdFromFileName(name: string): string | null {
  const m = /^(STORY-\d{3,4})\.json$/.exec(name);
  return m ? m[1] : null;
}

export async function ingestStoryEnrichments(
  projectId: string,
  target: EnrichmentIngestTarget,
  opts: { correlationId?: string; fetchImpl?: typeof fetch } = {},
): Promise<EnrichmentIngestSummary> {
  const correlationId = opts.correlationId ?? randomUUID();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const summary: EnrichmentIngestSummary = { files_seen: 0, applied: [], skipped: [], error_class: null };
  const base = { project_id: projectId, repo: `${target.owner}/${target.repo}`, correlation_id: correlationId };

  const token = process.env.GITHUB_TOKEN;
  if (!token?.trim()) {
    summary.error_class = 'ConfigError';
    log('sbp_enrichment_ingest_skipped', 'partial', { ...base, error_class: 'ConfigError' });
    return summary;
  }

  const ref = target.branch?.trim() ? `?ref=${encodeURIComponent(target.branch.trim())}` : '';
  const dir = `/repos/${target.owner}/${target.repo}/contents/${ENRICHMENT_DIR.split('/').map(encodeURIComponent).join('/')}${ref}`;

  let listing: { status: number; body: unknown };
  try {
    listing = await gh(dir, token, fetchImpl);
  } catch (err: any) {
    summary.error_class = err?.name === 'TimeoutError' ? 'TimeoutError' : 'UpstreamUnavailable';
    log('sbp_enrichment_ingest_failed', 'failure', { ...base, error_class: summary.error_class, message: String(err?.message || '').slice(0, 200) });
    return summary;
  }

  // No directory is the normal state of a repo whose stories have not run.
  if (listing.status === 404) return summary;
  if (listing.status !== 200 || !Array.isArray(listing.body)) {
    summary.error_class = listing.status === 403 || listing.status === 429 ? 'RateLimitError' : 'UpstreamUnavailable';
    log('sbp_enrichment_ingest_failed', 'failure', { ...base, error_class: summary.error_class, status: listing.status });
    return summary;
  }

  const files = (listing.body as GhFile[])
    .filter((f) => f && f.type === 'file' && storyIdFromFileName(String(f.name)))
    .slice(0, MAX_ENRICHMENT_FILES);
  summary.files_seen = files.length;

  for (const file of files) {
    const storyId = storyIdFromFileName(file.name)!;
    if (typeof file.size === 'number' && file.size > MAX_ENRICHMENT_BYTES) {
      summary.skipped.push({ path: file.path, error_class: 'TooLarge', reason: `${file.size} bytes` });
      continue;
    }

    let raw: string | null = null;
    try {
      const filePath = `/repos/${target.owner}/${target.repo}/contents/${file.path.split('/').map(encodeURIComponent).join('/')}${ref}`;
      const res = await gh(filePath, token, fetchImpl);
      raw = res.status === 200 ? decode(res.body) : null;
    } catch (err: any) {
      summary.skipped.push({ path: file.path, error_class: err?.name === 'TimeoutError' ? 'TimeoutError' : 'UpstreamUnavailable', reason: String(err?.message || '').slice(0, 120) });
      continue;
    }
    if (raw === null) {
      summary.skipped.push({ path: file.path, error_class: 'UpstreamUnavailable', reason: 'file could not be read' });
      continue;
    }

    const parsed = parseEnrichment(raw);
    if (!parsed.ok) {
      summary.skipped.push({ path: file.path, error_class: parsed.error_class, reason: parsed.reason });
      log('sbp_enrichment_file_rejected', 'partial', { ...base, path: file.path, error_class: parsed.error_class, reason: parsed.reason.slice(0, 200) });
      continue;
    }
    if (parsed.event.storyId !== storyId) {
      summary.skipped.push({ path: file.path, error_class: 'ContractViolation', reason: `file is named ${storyId} but claims ${parsed.event.storyId}` });
      continue;
    }

    summary.applied.push(await applyStoryEnrichment(projectId, parsed.event, { correlationId }));
  }

  log('sbp_enrichment_ingested', summary.skipped.length ? 'partial' : 'success', {
    ...base,
    files_seen: summary.files_seen,
    applied: summary.applied.length,
    merged: summary.applied.filter((a) => a.outcome === 'merged').length,
    replays: summary.applied.filter((a) => a.outcome === 'replay').length,
    skipped: summary.skipped.length,
  });
  return summary;
}
