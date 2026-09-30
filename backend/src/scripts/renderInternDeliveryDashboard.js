#!/usr/bin/env node
// renderInternDeliveryDashboard.js
//
// Snapshot JSON -> single self-contained HTML dashboard.
//
// Pure function of its input: no network, no credentials, no clock-dependent
// output beyond what the snapshot already carries. That means the HTML can be
// regenerated, restyled or re-themed for free, and the same snapshot always
// produces the same page (idempotency, per CLAUDE.md).
//
// Usage:
//   node backend/src/scripts/renderInternDeliveryDashboard.js \
//     --in intern-delivery-snapshot.json \
//     --out docs/INTERN_DELIVERY_DASHBOARD.html [--open]

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { buildHtml } = require(path.resolve(__dirname, './lib/internDashboardShell'));

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const IN = path.resolve(arg('--in', 'intern-delivery-snapshot.json'));
const OUT = path.resolve(arg('--out', 'INTERN_DELIVERY_DASHBOARD.html'));
const OPEN = process.argv.includes('--open');

function fail(msg, cls) {
  console.error(`[render] FATAL ${cls || 'Error'}: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(IN)) fail(`snapshot not found: ${IN}. Run buildInternDeliveryDashboard.js first.`, 'ValidationError');

let data;
try {
  data = JSON.parse(fs.readFileSync(IN, 'utf8'));
} catch (e) {
  fail(`snapshot is not valid JSON: ${e.message}`, 'ContractViolation');
}

// Contract check at the boundary. A renderer that silently emits an empty page
// because the shape drifted is worse than one that refuses.
for (const key of ['generatedAt', 'portfolio', 'people', 'projects', 'decisionQueue', 'meta']) {
  if (data[key] == null) fail(`snapshot is missing required key "${key}"`, 'ContractViolation');
}
if (!Array.isArray(data.projects) || data.projects.length === 0) fail('snapshot contains no projects', 'ContractViolation');

const html = buildHtml(data);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`[render] wrote ${OUT} (${kb} KB)`);
console.log(`[render] ${data.people.length} people (${data.portfolio.peopleActive} active), ${data.projects.length} projects, ${data.decisionQueue.length} items in the decision queue`);
console.log('[render] charts (Chart.js) and the timeline (Mermaid) load from a CDN, so the page needs internet to draw them.');

if (OPEN) {
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', OUT]]
    : process.platform === 'darwin' ? ['open', [OUT]]
      : ['xdg-open', [OUT]];
  execFile(opener[0], opener[1], (err) => {
    if (err) console.warn(`[render] could not auto-open the file (${err.message}); open it manually: ${OUT}`);
  });
}
