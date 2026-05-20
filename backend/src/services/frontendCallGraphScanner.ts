/**
 * frontendCallGraphScanner — 2026-05-20.
 *
 * Builds a "frontend page → backend capabilities" call graph by:
 *   1. For every cap's backend files, parsing Express route registrations
 *      (router.get/post/put/delete/patch('/api/...')) to learn which
 *      capability owns which API path.
 *   2. For every cap's frontend files, scanning fetch / axios / portalApi
 *      / api.get calls for API path literals.
 *   3. Matching each frontend cap's referenced API paths back to the caps
 *      that own them. The resulting set lands on
 *      cap.frontend_calls_capability_ids.
 *
 * Pure read on the GitHub repo (uses readFileFromRepo). One pass over the
 * project's caps. Deterministic. No LLM in the hot path.
 *
 * Limits (intentional, ship the simple thing first):
 *   - Only matches literal string paths. `${url}` template interpolation
 *     is ignored to avoid false positives.
 *   - Parameterized routes (`/api/admin/leads/:id`) are matched against
 *     callers via prefix + segment-count + named-param tolerance.
 *   - Returns capability IDs only — no "this BP calls this specific
 *     route" granularity (a future enrichment if needed).
 */

const METHOD_RE = /\brouter\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
const CLIENT_CALL_RE = /\b(?:portalApi|api|axios|fetch)\s*(?:\.\s*(?:get|post|put|delete|patch))?\s*\(\s*['"`](\/api\/[^'"`]+)['"`]/g;

export interface CallGraphResult {
  // cap_id → set of cap_ids whose backend handlers this cap's frontend calls
  feCallsBe: Map<string, Set<string>>;
  // route path → cap_id (the cap whose backend file registered it)
  routeOwners: Map<string, string>;
  // diagnostics — how many caps were scanned + how many routes were detected
  stats: {
    caps_scanned: number;
    backend_files_read: number;
    frontend_files_read: number;
    routes_detected: number;
    calls_detected: number;
    caps_with_outgoing_calls: number;
  };
}

interface CapLike {
  id: string;
  linked_backend_services?: string[] | null;
  linked_frontend_components?: string[] | null;
}

/**
 * Extract every API route registered in a backend file's source. Returns
 * an array of normalized paths (e.g. '/api/admin/leads', '/api/admin/leads/:id').
 */
export function extractRoutesFromBackendSource(source: string): string[] {
  const routes: string[] = [];
  let m: RegExpExecArray | null;
  METHOD_RE.lastIndex = 0;
  while ((m = METHOD_RE.exec(source))) {
    const path = m[2];
    if (path.startsWith('/api/')) routes.push(path);
  }
  return Array.from(new Set(routes));
}

/**
 * Extract every API path referenced by a frontend file's source. Matches
 * portalApi / api / axios / fetch followed by an optional .method call,
 * then a string literal that starts with /api/.
 */
export function extractApiCallsFromFrontendSource(source: string): string[] {
  const calls: string[] = [];
  let m: RegExpExecArray | null;
  CLIENT_CALL_RE.lastIndex = 0;
  while ((m = CLIENT_CALL_RE.exec(source))) {
    calls.push(m[1]);
  }
  return Array.from(new Set(calls));
}

/**
 * Best-effort route matcher: a caller's literal path matches a registered
 * route if the registered route equals the caller's path OR the route
 * pattern (with :param wildcards) matches when compared segment-by-segment.
 */
function routeMatches(registered: string, called: string): boolean {
  if (registered === called) return true;
  const r = registered.split('/');
  const c = called.split('/');
  if (r.length !== c.length) return false;
  for (let i = 0; i < r.length; i++) {
    if (r[i].startsWith(':')) continue;
    if (r[i] !== c[i]) return false;
  }
  return true;
}

/**
 * Run the scan for a single project. Returns the cap-to-cap call graph
 * plus diagnostics; callers persist the result. Idempotent on repeated runs.
 */
export async function scanProjectCallGraph(
  enrollmentId: string,
  caps: CapLike[],
): Promise<CallGraphResult> {
  const { readFileFromRepo } = await import('./githubService');

  const stats = {
    caps_scanned: caps.length,
    backend_files_read: 0,
    frontend_files_read: 0,
    routes_detected: 0,
    calls_detected: 0,
    caps_with_outgoing_calls: 0,
  };

  // Step 1: build route → cap owner map by reading every backend file.
  // Deduplicate file reads across caps that share backend services.
  const routeOwners = new Map<string, string>();
  const beFileToCap = new Map<string, string>(); // file path → first cap that owns it
  for (const cap of caps) {
    for (const file of cap.linked_backend_services || []) {
      if (!beFileToCap.has(file)) beFileToCap.set(file, cap.id);
    }
  }
  await Promise.all(
    Array.from(beFileToCap.entries()).map(async ([file, capId]) => {
      const content = await readFileFromRepo(enrollmentId, file).catch(() => null);
      if (!content) return;
      stats.backend_files_read += 1;
      for (const route of extractRoutesFromBackendSource(content)) {
        stats.routes_detected += 1;
        // First write wins (deterministic; caps with shared files attribute
        // to the cap that listed the file first by id).
        if (!routeOwners.has(route)) routeOwners.set(route, capId);
      }
    }),
  );

  // Step 2: for each cap's frontend files, extract API calls + match to owners.
  const feCallsBe = new Map<string, Set<string>>();
  const feFileToCap = new Map<string, string[]>();
  for (const cap of caps) {
    for (const file of cap.linked_frontend_components || []) {
      const arr = feFileToCap.get(file) || [];
      arr.push(cap.id);
      feFileToCap.set(file, arr);
    }
  }
  const fileCallCache = new Map<string, string[]>();
  await Promise.all(
    Array.from(feFileToCap.keys()).map(async (file) => {
      const content = await readFileFromRepo(enrollmentId, file).catch(() => null);
      if (!content) return;
      stats.frontend_files_read += 1;
      const calls = extractApiCallsFromFrontendSource(content);
      stats.calls_detected += calls.length;
      fileCallCache.set(file, calls);
    }),
  );

  for (const cap of caps) {
    const downstream = new Set<string>();
    for (const file of cap.linked_frontend_components || []) {
      const calls = fileCallCache.get(file) || [];
      for (const call of calls) {
        for (const [registered, ownerCapId] of routeOwners.entries()) {
          if (ownerCapId === cap.id) continue; // don't self-reference
          if (routeMatches(registered, call)) downstream.add(ownerCapId);
        }
      }
    }
    if (downstream.size > 0) {
      feCallsBe.set(cap.id, downstream);
      stats.caps_with_outgoing_calls += 1;
    }
  }

  return { feCallsBe, routeOwners, stats };
}
