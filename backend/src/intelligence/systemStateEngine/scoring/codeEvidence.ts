/**
 * codeEvidence — file-content-based signals for health scoring.
 *
 * Replaces the file-count heuristics in healthScorer with actual code
 * inspection. Specifically addresses the 90% false-positive rate the
 * operator observed on 2026-05-19: pure-function services were flagged
 * for reliability work they didn't need, CRUD admin controllers were
 * flagged for automation that doesn't apply.
 *
 * Signals computed per capability (aggregated across its linked backend files):
 *   reliability_signal:    'high' | 'medium' | 'low' | 'na'
 *     'high'   = try/catch density >= 0.5 per async function
 *     'medium' = density 0.2 - 0.5
 *     'low'    = density < 0.2 with at least one async function
 *     'na'     = zero async functions → pure-function service, reliability N/A
 *
 *   automation_applicable: boolean
 *     true if cap kind='agent', has scheduled jobs, queue handlers, or
 *     existing linked agents. Otherwise reliability is N/A — adding an
 *     agent to a CRUD controller is not the right ask.
 *
 *   evidence_files_read:   how many files actually contributed to the signal
 *     (for transparency in the breakdown UI)
 *
 * Performance: in-memory file cache with 1-hour TTL. Sampling capped at
 * 5 files per cap so 150 caps × 5 = 750 reads max per refresh, then
 * cached.
 *
 * Why regex not AST: AST parsing (typescript compiler API) adds 50ms+
 * per file and a heavy dependency. For a heuristic signal that drives
 * which dimensions to APPLY (not what to fix), regex is adequate.
 * Token-level patterns (`} catch (`, `async function`) are stable across
 * formatting variations.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface CodeEvidence {
  readonly reliability_signal: 'high' | 'medium' | 'low' | 'na';
  readonly automation_applicable: boolean;
  readonly evidence_files_read: number;
  readonly raw_counts?: {
    try_catch: number;
    async_functions: number;
    scheduled_signals: number;
    queue_signals: number;
  };
}

interface FileEvidence {
  try_catch: number;
  async_functions: number;
  has_scheduled: boolean;
  has_queue_handler: boolean;
}

const FILE_CACHE = new Map<string, { evidence: FileEvidence; cached_at: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;   // 1 hour
const MAX_FILES_PER_CAP = 5;            // sampling cap

const REPO_ROOT = path.resolve(__dirname, '../../../../..');  // backend/src/intelligence/systemStateEngine/scoring -> repo root

function isSupportedSource(p: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(p);
}

/**
 * Read a single file and compute its evidence. Best-effort — if the file
 * doesn't exist (deleted, or path not in this repo), returns zero
 * evidence. Caching layer in front so repeat reads in the same hour are free.
 */
function readFileEvidence(relPath: string): FileEvidence {
  const cached = FILE_CACHE.get(relPath);
  if (cached && Date.now() - cached.cached_at < CACHE_TTL_MS) {
    return cached.evidence;
  }

  let content = '';
  try {
    const abs = path.resolve(REPO_ROOT, relPath);
    // Defensive: only read files inside the repo root
    if (!abs.startsWith(REPO_ROOT)) {
      const empty: FileEvidence = { try_catch: 0, async_functions: 0, has_scheduled: false, has_queue_handler: false };
      FILE_CACHE.set(relPath, { evidence: empty, cached_at: Date.now() });
      return empty;
    }
    content = fs.readFileSync(abs, 'utf8');
  } catch {
    const empty: FileEvidence = { try_catch: 0, async_functions: 0, has_scheduled: false, has_queue_handler: false };
    FILE_CACHE.set(relPath, { evidence: empty, cached_at: Date.now() });
    return empty;
  }

  const try_catch = (content.match(/}\s*catch\s*\(/g) || []).length;
  // async functions: covers `async function`, `async (`, `async \w+`,
  // `: async`, `=> async` patterns. Doesn't double-count arrow vs. fn.
  const async_functions = (content.match(/\basync\s+(?:function\b|\w+\s*\(|\([^)]*\))/g) || []).length;

  // Scheduled-job signals: cron registrations, setInterval (not setTimeout —
  // that's typically a debounce, not a recurring schedule), node-cron usage.
  const has_scheduled = /\b(setInterval\b|cron\.schedule|@cron\(|registerCron|scheduleJob)/.test(content);

  // Queue handler signals: typical worker / processor / queue patterns.
  const has_queue_handler = /\.process\(|\bQueue\.consume|bullmq|kue\.Queue|workerPool|jobHandler/i.test(content)
    || /\bwork(er)?\b/i.test(relPath)  // file path itself signals worker
    || /\bprocessor\b/i.test(relPath);

  const evidence: FileEvidence = { try_catch, async_functions, has_scheduled, has_queue_handler };
  FILE_CACHE.set(relPath, { evidence, cached_at: Date.now() });
  return evidence;
}

/**
 * Compute per-cap evidence by aggregating across linked backend files.
 * Pure besides the file-cache side effect. Safe to call during engine
 * refresh; bounded by MAX_FILES_PER_CAP.
 */
export function computeCodeEvidence(input: {
  kind?: string;
  linked_backend_services?: ReadonlyArray<string> | null;
  linked_agents?: ReadonlyArray<string> | null;
}): CodeEvidence {
  const backendFiles = (input.linked_backend_services || [])
    .filter(isSupportedSource)
    .slice(0, MAX_FILES_PER_CAP);

  let try_catch = 0;
  let async_functions = 0;
  let scheduled_signals = 0;
  let queue_signals = 0;

  for (const f of backendFiles) {
    const ev = readFileEvidence(f);
    try_catch += ev.try_catch;
    async_functions += ev.async_functions;
    if (ev.has_scheduled) scheduled_signals++;
    if (ev.has_queue_handler) queue_signals++;
  }

  // Reliability classification.
  let reliability_signal: CodeEvidence['reliability_signal'];
  if (async_functions === 0) {
    // No async code = pure functions = nothing to wrap. The reliability
    // dimension is not applicable; gate it out of the scorer's average.
    reliability_signal = 'na';
  } else {
    const density = try_catch / async_functions;
    if (density >= 0.5) reliability_signal = 'high';
    else if (density >= 0.2) reliability_signal = 'medium';
    else reliability_signal = 'low';
  }

  // Automation applicability. True when:
  //   - The cap IS an agent (kind='agent')
  //   - It has linked agents already
  //   - Any linked file shows scheduled-job or queue-handler signals
  // Otherwise, "Improve automation for X" is the wrong ask — most
  // controllers + services don't need agents.
  const automation_applicable =
    input.kind === 'agent'
    || (input.linked_agents || []).length > 0
    || scheduled_signals > 0
    || queue_signals > 0;

  return {
    reliability_signal,
    automation_applicable,
    evidence_files_read: backendFiles.length,
    raw_counts: { try_catch, async_functions, scheduled_signals, queue_signals },
  };
}

/**
 * Clear the cache. Test-only.
 */
export function _resetCodeEvidenceCacheForTests(): void {
  FILE_CACHE.clear();
}
