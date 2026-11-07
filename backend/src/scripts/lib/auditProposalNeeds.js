/* eslint-disable */
/**
 * auditProposalNeeds (lib) — the PURE assertion core behind the T-AUDIT staging check. Given a project's documents
 * (current content + current-version findings) and the set of open need keys, it asserts the three v3 invariants and
 * returns a structured pass/fail report. No I/O — the script wrapper (../auditProposalNeeds.js) loads the data and
 * prints the report; this is unit-tested.
 *
 * Invariants:
 *   1. Every unresolved [PLACEHOLDER: …] has exactly one OPEN need (its fact key is present in the open-need set).
 *   2. Every finding row carries a resolver ('agent' | 'human').
 *   3. Every human-resolved finding carries a COMPLETE need (kind, key, ask, why, usedIn[], format, blocking).
 *
 * The placeholder key normalization MIRRORS services/.../placeholderNeeds.ts (needKeyForFact) so the keys line up
 * with what the write path persists.
 */

const MARKER = /\[PLACEHOLDER:\s*([^\]]+?)\s*\]/gi;

/** Mirror of needKeyForFact in placeholderNeeds.ts. */
function needKeyForFact(ask) {
  const slug = String(ask || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return `fact:${slug || 'unspecified'}`;
}

/** The distinct fact keys the [PLACEHOLDER] markers in a piece of content expect an open need for. */
function placeholderKeys(contentHtml) {
  const text = typeof contentHtml === 'string' ? contentHtml : '';
  const keys = new Set();
  let m;
  MARKER.lastIndex = 0;
  while ((m = MARKER.exec(text))) {
    const raw = m[1].trim();
    if (!raw) continue;
    const keyed = /^(?:key|need)\s*=\s*([a-z0-9:_]+)\s*\|\s*(.+)$/i.exec(raw);
    if (keyed) keys.add(keyed[1].includes(':') ? keyed[1] : `fact:${keyed[1]}`);
    else keys.add(needKeyForFact(raw));
  }
  MARKER.lastIndex = 0;
  return [...keys];
}

const NEED_FIELDS = ['kind', 'key', 'ask', 'why', 'usedIn', 'format', 'blocking'];
function isCompleteNeed(need) {
  if (!need || typeof need !== 'object') return false;
  for (const f of NEED_FIELDS) {
    if (f === 'usedIn') { if (!Array.isArray(need.usedIn)) return false; continue; }
    if (f === 'why') { if (typeof need.why !== 'string' || !need.why) return false; continue; }
    if (typeof need[f] !== 'string' || !need[f]) return false;
  }
  return true;
}

/**
 * Audit one project's documents + open need keys. Returns { pass, checks, violations } — read-only, pure.
 * docs: [{ docKey, contentHtml, findings: [] }]; openNeedKeys: iterable of need_key strings.
 */
function auditProjectNeeds(input) {
  const docs = Array.isArray(input && input.docs) ? input.docs : [];
  const openKeys = new Set(Array.from((input && input.openNeedKeys) || []));
  const violations = [];

  // 1. every unresolved placeholder has an open need
  let markerCount = 0;
  for (const d of docs) {
    for (const key of placeholderKeys(d && d.contentHtml)) {
      markerCount++;
      if (!openKeys.has(key)) violations.push({ check: 'placeholder_has_open_need', docKey: d.docKey, detail: `marker "${key}" has no open need` });
    }
  }

  // 2 + 3. findings carry a resolver; human findings carry a complete need
  let findingCount = 0;
  let humanCount = 0;
  for (const d of docs) {
    const findings = Array.isArray(d && d.findings) ? d.findings : [];
    for (const f of findings) {
      findingCount++;
      if (f == null || (f.resolver !== 'agent' && f.resolver !== 'human')) {
        violations.push({ check: 'finding_has_resolver', docKey: d.docKey, detail: `finding "${(f && f.message) || '(no message)'}" has no resolver` });
        continue;
      }
      if (f.resolver === 'human') {
        humanCount++;
        if (!isCompleteNeed(f.need)) violations.push({ check: 'human_finding_has_complete_need', docKey: d.docKey, detail: `human finding "${f.message || '(no message)'}" has an incomplete need` });
      }
    }
  }

  const byCheck = (name) => violations.filter((v) => v.check === name);
  const checks = [
    { name: 'placeholder_has_open_need', scanned: markerCount, violations: byCheck('placeholder_has_open_need').length, pass: byCheck('placeholder_has_open_need').length === 0 },
    { name: 'finding_has_resolver', scanned: findingCount, violations: byCheck('finding_has_resolver').length, pass: byCheck('finding_has_resolver').length === 0 },
    { name: 'human_finding_has_complete_need', scanned: humanCount, violations: byCheck('human_finding_has_complete_need').length, pass: byCheck('human_finding_has_complete_need').length === 0 },
  ];

  return { pass: violations.length === 0, checks, violations };
}

/** Render the report as plain text for the script's stdout. Pure. */
function renderAuditReport(projectId, report) {
  const lines = [];
  lines.push(`Proposal needs audit — project ${projectId}`);
  lines.push(`Result: ${report.pass ? 'PASS' : 'FAIL'} (${report.violations.length} violation(s))`);
  for (const c of report.checks) {
    lines.push(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name} — scanned ${c.scanned}, ${c.violations} violation(s)`);
  }
  for (const v of report.violations.slice(0, 50)) lines.push(`   - (${v.check}) ${v.docKey}: ${v.detail}`);
  return lines.join('\n');
}

module.exports = { auditProjectNeeds, placeholderKeys, needKeyForFact, isCompleteNeed, renderAuditReport };
