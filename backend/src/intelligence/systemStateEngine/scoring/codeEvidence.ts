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

export type AgentRole = 'monitor' | 'alert' | 'follow_up' | 'core';

export interface AgentRoleEvidence {
  /** Set of distinct roles detected across the cap's agent files. */
  readonly detected: ReadonlyArray<AgentRole>;
  /** Number of agent files actually read (0 when prod container lacks source). */
  readonly files_inspected: number;
}

export interface CodeEvidence {
  readonly reliability_signal: 'high' | 'medium' | 'low' | 'na';
  readonly automation_applicable: boolean;
  readonly evidence_files_read: number;
  /**
   * Agent role classification (2026-05-19, Tier-2 #4). Lets the
   * agent_stack generator distinguish "operator added 2 core agents"
   * (still incomplete stack) from "operator added 1 monitor + 1 alert
   * agent" (complete stack). Empty `detected` array when no agent
   * files were readable — caller should fall back to count-based gate.
   */
  readonly agent_roles?: AgentRoleEvidence;
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
 * Classify an agent file's role from filename + contents. Two layers
 * of signal:
 *   1. Filename keywords (high confidence) — operator deliberately
 *      named the file `monitorX.ts` or `alertY.ts`
 *   2. Content keywords (medium confidence) — code uses APIs that
 *      indicate the role (setInterval+metrics → monitor;
 *      sendAlert/pagerduty → alert; setTimeout+enqueue+nudge →
 *      follow_up)
 *
 * Default 'core' when no role-specific signals are found — the agent
 * IS the work, not the layer around it.
 *
 * `content` may be null when the file isn't readable from this
 * environment (e.g., prod container lacks source). In that case
 * only the filename signal applies; if filename is generic, default
 * to 'core'.
 *
 * Exported for tests.
 */
export function inferAgentRole(filename: string, content: string | null): AgentRole {
  // Tokenize camelCase + path segments + extensions into lowercase words.
  // "src/agents/alertDispatcher.ts" → ['src', 'agents', 'alert', 'dispatcher', 'ts']
  // Lets keyword sets match without worrying about \b boundaries on
  // camelCase compounds (where "alertDispatcher" wouldn't match
  // /\balert\b/ since "tD" isn't a word boundary).
  const tokens = filename
    .replace(/[A-Z]/g, c => ' ' + c.toLowerCase())
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  const tokenSet = new Set(tokens);

  const MONITOR_TOKENS = new Set(['monitor', 'monitoring', 'watcher', 'observer', 'healthcheck', 'health', 'heartbeat', 'telemetry']);
  const ALERT_TOKENS = new Set(['alert', 'alerting', 'notify', 'notification', 'pager', 'escalator', 'escalate', 'warn', 'warning']);
  const FOLLOWUP_TOKENS = new Set(['followup', 'reminder', 'retry', 'nudge', 'nudger', 'dripcampaign']);

  for (const t of tokenSet) {
    if (MONITOR_TOKENS.has(t)) return 'monitor';
    if (ALERT_TOKENS.has(t)) return 'alert';
    if (FOLLOWUP_TOKENS.has(t)) return 'follow_up';
  }

  // "healthcheck" written as one word vs split "health" + "check"
  if (tokenSet.has('health') && tokenSet.has('check')) return 'monitor';

  // Content signals — only when we could read the file. Case-insensitive
  // contains to avoid \b issues on camelCase here too.
  if (content) {
    const lc = content.toLowerCase();
    if (/setinterval|prometheus|healthcheck|metric\.gauge|metric\.counter|pollfor|watchfor/.test(lc)) return 'monitor';
    if (/sendalert|notifyon|triggeralert|pagerduty|slackalert|notificationservice/.test(lc)) return 'alert';
    if (/reminderemail|nudge|schedulefollowup|delayedretry|schedulereminder/.test(lc)) return 'follow_up';
  }
  return 'core';
}

/**
 * Read an agent file and return its inferred role. Two read paths:
 *   1. preFetchedContents (optional) — when the caller (engine refresh)
 *      has bulk-fetched contents via GitHub API. Used in production
 *      where the dist-only container has no local source files.
 *   2. Local filesystem — used in dev + tests.
 *
 * If neither source yields content, falls back to filename-only
 * inference. `read` flag distinguishes "we actually inspected content"
 * from "filename-only guess" so the caller can decide whether to
 * trust the result (via files_inspected count).
 */
function readAgentRole(
  relPath: string,
  preFetchedContents?: ReadonlyMap<string, string | null>,
): { role: AgentRole; read: boolean } {
  let content: string | null = null;
  let read = false;

  // Path 1: pre-fetched contents (prod / async caller).
  if (preFetchedContents && preFetchedContents.has(relPath)) {
    const fetched = preFetchedContents.get(relPath);
    if (typeof fetched === 'string') {
      content = fetched;
      read = true;
    }
  }

  // Path 2: local filesystem (dev / tests).
  if (!read) {
    try {
      const abs = path.resolve(REPO_ROOT, relPath);
      if (abs.startsWith(REPO_ROOT)) {
        content = fs.readFileSync(abs, 'utf8');
        read = true;
      }
    } catch {
      // unreadable — fall through to filename-only inference
    }
  }

  const role = inferAgentRole(relPath, content);
  return { role, read };
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
  /**
   * Optional map of agent-file path → content fetched by the caller
   * (e.g., engine refresh in prod uses GitHub API). When provided,
   * readAgentRole consults this map first before falling back to the
   * local filesystem. Lets role detection work in dist-only
   * containers where the source filesystem isn't present.
   */
  preFetchedAgentContents?: ReadonlyMap<string, string | null>;
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

  // Agent role classification (2026-05-19, Tier-2 #4).
  // Read each linked agent file (bounded) and infer its role from
  // filename + contents. The aggregated set of detected roles tells
  // the agent_stack generator whether the cap's agent layer covers
  // the monitor/alert layers or just has core workers.
  //
  // Files-inspected count: how many agent files we could actually read
  // (filename-only inference still happens for files we can't read,
  // but only the filename keyword applies). If 0, caller should fall
  // back to count-based gate.
  const agentFiles = (input.linked_agents || []).filter(isSupportedSource).slice(0, MAX_FILES_PER_CAP);
  const detectedRoles = new Set<AgentRole>();
  let filesInspected = 0;
  for (const f of agentFiles) {
    const { role, read } = readAgentRole(f, input.preFetchedAgentContents);
    if (read) filesInspected++;
    detectedRoles.add(role);
  }

  return {
    reliability_signal,
    automation_applicable,
    evidence_files_read: backendFiles.length,
    // agent_roles is omitted entirely when there are no agent files to
    // classify (2026-05-20 walk #2 finding). Returning an empty
    // {detected:[], files_inspected:0} object was being treated by the
    // queue gate as the "filenameOnly tier" and adding the misleading
    // "⚠ Roles inferred from filename only (file content unavailable)"
    // warning to caps that simply have no agent layer at all. Undefined
    // is the honest signal: no agents, no classification, no warning.
    agent_roles: agentFiles.length > 0
      ? {
          detected: Object.freeze([...detectedRoles]) as any,
          files_inspected: filesInspected,
        }
      : undefined,
    raw_counts: { try_catch, async_functions, scheduled_signals, queue_signals },
  };
}

/**
 * Clear the cache. Test-only.
 */
export function _resetCodeEvidenceCacheForTests(): void {
  FILE_CACHE.clear();
}
