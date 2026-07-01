import crypto from 'crypto';
import { Op } from 'sequelize';
import AnthropicContentRegistry, { ChangeSummary } from '../models/AnthropicContentRegistry';

const FETCH_TIMEOUT_MS = 15_000;
const SERVICE = 'anthropic-content-watcher';

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown> = {}): void {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: SERVICE,
      event,
      ...context,
    }) + '\n',
  );
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ColaberryAnthropicWatcher/1.0' },
    });
  } finally {
    clearTimeout(timer);
  }
}

interface WatchResult {
  url: string;
  outcome: 'changed' | 'unchanged' | 'error';
  detection_method?: ChangeSummary['detection_method'];
  error_class?: string;
  duration_ms: number;
}

async function watchOne(row: InstanceType<typeof AnthropicContentRegistry>): Promise<WatchResult> {
  const start = Date.now();

  let response: Response;
  try {
    response = await fetchWithTimeout(row.url);
  } catch (err: any) {
    const error_class = err.name === 'AbortError' ? 'TimeoutError' : 'NetworkError';
    log('error', 'fetch_failed', {
      url: row.url,
      error_class,
      error: err.message,
      duration_ms: Date.now() - start,
    });
    return { url: row.url, outcome: 'error', error_class, duration_ms: Date.now() - start };
  }

  if (!response.ok) {
    log('warn', 'fetch_non_ok', {
      url: row.url,
      status: response.status,
      error_class: 'UpstreamUnavailable',
      duration_ms: Date.now() - start,
    });
    // Update last_checked even on non-ok so we have a timestamp trail
    await row.update({ last_checked: new Date() });
    return { url: row.url, outcome: 'error', error_class: 'UpstreamUnavailable', duration_ms: Date.now() - start };
  }

  const responseBody = await response.text();
  const duration_ms = Date.now() - start;

  // --- Change detection: (1) Last-Modified, (2) ETag, (3) content hash ---

  // 1. Last-Modified header
  const lastModifiedHeader = response.headers.get('last-modified');
  if (lastModifiedHeader) {
    const incoming = new Date(lastModifiedHeader);
    const stored = row.last_modified;
    if (!stored || incoming.getTime() !== stored.getTime()) {
      const summary: ChangeSummary = {
        detected_at: new Date().toISOString(),
        detection_method: 'last_modified_header',
        previous_value: stored?.toISOString() ?? null,
        current_value: incoming.toISOString(),
      };
      await row.update({
        last_checked: new Date(),
        last_modified: incoming,
        change_detected: true,
        change_summary: summary,
      });
      log('info', 'change_detected', { url: row.url, detection_method: 'last_modified_header', duration_ms });
      return { url: row.url, outcome: 'changed', detection_method: 'last_modified_header', duration_ms };
    }
    // Last-Modified matched — no change
    await row.update({ last_checked: new Date() });
    log('info', 'no_change', { url: row.url, detection_method: 'last_modified_header', duration_ms });
    return { url: row.url, outcome: 'unchanged', detection_method: 'last_modified_header', duration_ms };
  }

  // 2. ETag header
  const etagHeader = response.headers.get('etag');
  if (etagHeader) {
    if (etagHeader !== row.etag) {
      const summary: ChangeSummary = {
        detected_at: new Date().toISOString(),
        detection_method: 'etag',
        previous_value: row.etag ?? null,
        current_value: etagHeader,
      };
      await row.update({
        last_checked: new Date(),
        etag: etagHeader,
        change_detected: true,
        change_summary: summary,
      });
      log('info', 'change_detected', { url: row.url, detection_method: 'etag', duration_ms });
      return { url: row.url, outcome: 'changed', detection_method: 'etag', duration_ms };
    }
    await row.update({ last_checked: new Date() });
    log('info', 'no_change', { url: row.url, detection_method: 'etag', duration_ms });
    return { url: row.url, outcome: 'unchanged', detection_method: 'etag', duration_ms };
  }

  // 3. SHA-256 content hash fallback (CDN-served pages without reliable headers)
  const currentHash = sha256(responseBody);
  if (currentHash !== row.content_hash) {
    const summary: ChangeSummary = {
      detected_at: new Date().toISOString(),
      detection_method: 'content_hash',
      previous_value: row.content_hash ?? null,
      current_value: currentHash,
    };
    await row.update({
      last_checked: new Date(),
      content_hash: currentHash,
      change_detected: true,
      change_summary: summary,
    });
    log('info', 'change_detected', { url: row.url, detection_method: 'content_hash', duration_ms });
    return { url: row.url, outcome: 'changed', detection_method: 'content_hash', duration_ms };
  }

  await row.update({ last_checked: new Date() });
  log('info', 'no_change', { url: row.url, detection_method: 'content_hash', duration_ms });
  return { url: row.url, outcome: 'unchanged', detection_method: 'content_hash', duration_ms };
}

export interface ContentWatcherRunResult {
  checked: number;
  changed: number;
  errors: number;
  results: WatchResult[];
}

export async function runContentWatcher(): Promise<ContentWatcherRunResult> {
  log('info', 'run_start', {});

  // Exclude content_type='course' rows: those are owned exclusively by
  // anthropicCatalogScraper, which fingerprints the course OUTLINE into
  // content_hash. This watcher fingerprints the FULL page body into the same
  // content_hash column, so if it also touched course rows the two services
  // would overwrite each other's hash every run and perpetually flip
  // change_detected=true — firing false curriculum-change alerts. Course-page
  // monitoring is intentionally outline-only (alert on real outline/link change,
  // not arbitrary page churn); the scraper is the single writer for those rows.
  const rows = await AnthropicContentRegistry.findAll({
    where: { content_type: { [Op.ne]: 'course' } },
  });

  if (rows.length === 0) {
    log('warn', 'registry_empty', { outcome: 'partial' });
    return { checked: 0, changed: 0, errors: 0, results: [] };
  }

  const results: WatchResult[] = [];
  for (const row of rows) {
    const result = await watchOne(row);
    results.push(result);
  }

  const changed = results.filter((r) => r.outcome === 'changed').length;
  const errors = results.filter((r) => r.outcome === 'error').length;

  log('info', 'run_complete', {
    outcome: errors === rows.length ? 'failure' : errors > 0 ? 'partial' : 'success',
    checked: rows.length,
    changed,
    errors,
  });

  return { checked: rows.length, changed, errors, results };
}
