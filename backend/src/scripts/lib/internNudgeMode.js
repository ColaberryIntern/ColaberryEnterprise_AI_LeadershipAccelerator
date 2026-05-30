// Tiny file-based config for intern nudge mode (preview | live).
// Both dailyInternNudges.js and the @CB set_intern_nudge_mode tool read/write
// this file. Lives at tmp/ops-engine/intern-nudge-mode.txt at the repo root.
//
// Why a file and not the DB: the nudge script and the @CB handler both run on
// the VPS host (outside the docker network), while the Postgres container only
// accepts connections from inside the docker network. A flat file works
// equally well, is human-readable, and avoids docker-exec'ing for one query.

const fs = require('fs');
const path = require('path');

const MODE_FILE = path.resolve(__dirname, '../../../../tmp/ops-engine/intern-nudge-mode.txt');
const AUDIT_FILE = path.resolve(__dirname, '../../../../tmp/ops-engine/intern-nudge-mode-log.jsonl');
const VALID_MODES = new Set(['preview', 'live']);

function readMode() {
  try {
    const raw = fs.readFileSync(MODE_FILE, 'utf8').trim().toLowerCase();
    if (VALID_MODES.has(raw)) return raw;
  } catch (_e) { /* file may not exist yet */ }
  return 'preview'; // safe default
}

function writeMode(mode, { changedBy = 'unknown', reason = null } = {}) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (!VALID_MODES.has(normalized)) {
    throw new Error(`Invalid nudge mode: "${mode}". Use one of: ${[...VALID_MODES].join(', ')}.`);
  }
  const previous = readMode();
  fs.mkdirSync(path.dirname(MODE_FILE), { recursive: true });
  fs.writeFileSync(MODE_FILE, normalized + '\n');
  const entry = { ts: new Date().toISOString(), changedBy, from: previous, to: normalized, reason };
  try { fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n'); } catch (_e) {}
  return { previous, current: normalized, changed: previous !== normalized };
}

module.exports = { readMode, writeMode, MODE_FILE, AUDIT_FILE, VALID_MODES: [...VALID_MODES] };
