/**
 * Pure classifier for the Voice AI Studio inventory (VS1.1).
 *
 * Given a repo-relative path and its content, decide what role the file plays for AI voice
 * calls. The rules are deliberately simple and ordered, so the result is deterministic and a
 * reviewer can predict it: the first matching rule wins. The hand-checked INVENTORY.md is the
 * human reading; this classifier is the repeatable one that `voice:inventory --check` re-runs
 * so a NEW caller added later cannot slip past the gateway migration unnoticed.
 *
 * No I/O here: the CLI (voiceInventory.ts) reads files and calls this.
 */

export type VoiceRole = 'DISPATCH' | 'INGEST' | 'GUARD' | 'CALLER' | 'CONFIG' | 'UI' | 'CONSUMER' | 'MENTION';

export interface VoiceInventoryRow {
  path: string;
  role: VoiceRole;
  /** callType / path string literals found next to a dispatch call, sorted and de-duplicated. */
  callTypes: string[];
  /** Env var names referenced (names only, never values). */
  envVars: string[];
}

/** What makes a file part of the inventory at all. Mirrors the search set in INVENTORY.md. */
export const VOICE_SEARCH = /synthflow|syntheflow|triggerVoiceCall|place_ai_call|voiceCall|SYNTHFLOW_|ENABLE_VOICE_CALLS|VOICE_CALL_PATHS|\bcall_id\b|CommunicationLog|\bVOICE_[A-Z][A-Z0-9_]*/i;

/**
 * The Voice Studio's own tooling (this classifier, the CLI, docs-check) mentions every search term by
 * design. Counting it would make the committed snapshot stale the moment the tooling itself is
 * committed (VS1.1 verifier finding, attempt 1), so it is out of scope by path.
 */
export const TOOLING_PATH = /^backend\/src\/scripts\/voice\//;

export function isInventoryCandidate(path: string): boolean {
  return !TOOLING_PATH.test(path.replace(/\\/g, '/'));
}

const DISPATCH_DEF = /export\s+(async\s+)?function\s+triggerVoiceCall\b/;
/** A Synthflow URL is only a dispatch when it is POSTed to; a GET (e.g. the health check) only reads. */
const SYNTHFLOW_URL = /api\.synthflow\.ai/;
const POST_METHOD = /method\s*:\s*['"]POST['"]|axios\.post\s*\(/;
const CALLS_TRIGGER = /\btriggerVoiceCall\s*\(/;
const GUARD_PATH = /services\/voice\/(voiceDial|voiceCallPaths|synthflowWebhookAuth)|communicationSafetyService|consentGate|explorerVoiceEligibility/;
const INGEST_PATH = /controllers\/.*synthflow|webhook/i;
const CONFIG_PATH = /(^|\/)(config|models)\/|\.env|docker-compose|\.github\//;
const CONSUMER_HINT = /call_id|transcript|CommunicationLog|call_status|recording_url/;
const ENV_NAME = /\b(?:SYNTHFLOW_[A-Z0-9_]+|ENABLE_VOICE_CALLS|VOICE_CALL_PATHS|VOICE_[A-Z0-9_]+)\b/g;
const CALLTYPE_LITERAL = /callType\s*:\s*['"]([a-z_]+)['"]|\bpath\s*:\s*['"]([a-z_]+)['"]/g;

function uniqSorted(xs: string[]): string[] {
  return Array.from(new Set(xs)).sort();
}

export function classifyVoiceFile(path: string, content: string): VoiceInventoryRow {
  const p = path.replace(/\\/g, '/');
  let role: VoiceRole;
  const dispatches = DISPATCH_DEF.test(content) || (SYNTHFLOW_URL.test(content) && POST_METHOD.test(content));
  if (dispatches && !/\/__tests__\//.test(p)) role = 'DISPATCH';
  else if (p.startsWith('frontend/')) role = 'UI';
  else if (GUARD_PATH.test(p)) role = 'GUARD';
  else if (INGEST_PATH.test(p) && /synthflow/i.test(content)) role = 'INGEST';
  else if (CALLS_TRIGGER.test(content)) role = 'CALLER';
  else if (CONFIG_PATH.test(p)) role = 'CONFIG';
  else if (CONSUMER_HINT.test(content) && /synthflow|voice/i.test(content)) role = 'CONSUMER';
  else role = 'MENTION';

  const callTypes: string[] = [];
  if (role === 'CALLER' || role === 'DISPATCH') {
    for (const m of content.matchAll(CALLTYPE_LITERAL)) callTypes.push(m[1] || m[2]);
  }
  const envVars = Array.from(content.matchAll(ENV_NAME), (m) => m[0]);
  return { path: p, role, callTypes: uniqSorted(callTypes), envVars: uniqSorted(envVars) };
}

/** Stable ordering so two runs over the same tree produce byte-identical output. */
export function sortInventory(rows: VoiceInventoryRow[]): VoiceInventoryRow[] {
  return [...rows].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function summarize(rows: VoiceInventoryRow[]): Record<VoiceRole, number> {
  const out: Record<VoiceRole, number> = { DISPATCH: 0, INGEST: 0, GUARD: 0, CALLER: 0, CONFIG: 0, UI: 0, CONSUMER: 0, MENTION: 0 };
  for (const r of rows) out[r.role] += 1;
  return out;
}
