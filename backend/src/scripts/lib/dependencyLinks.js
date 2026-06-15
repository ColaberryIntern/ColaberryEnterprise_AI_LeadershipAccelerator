// Shared pure logic for stamping dependency/artifact/list LINKS onto launch
// tasks — used by both the generator (generateLaunchTasks.js, for new tasks)
// and the in-place backfill (backfillLaunchPmoDependencyLinks.js, for the
// existing board).
//
// Why: approval/review tasks reference their upstream deliverable by TITLE
// only ("Draft sales call script for outreach to alumni"), with no link. A
// fresh session (human or AI) cannot navigate to the thing it must approve,
// so the gate stalls and gets falsely escalated as an approver delay. The fix
// is to embed machine-readable markers the downstream My Day surface parses:
//
//     Depends-on: <drafting todo URL>
//     Artifact:   <drafting todo URL when done, else PENDING>
//     List:       <todolist URL>
//
// Marker format is bare-URL-after-label so the consumer regex in
// AI_ProjectArchitect (execution/products/ops/suggestions.py _DEPENDS_ON_RE /
// _ARTIFACT_RE and scorer.py ARTIFACT_PENDING_RE) captures the URL. Contract:
// directives/approval-task-dependency-linking.md in that repo.
//
// All functions here are pure (no Basecamp I/O) so they unit-test cleanly.

'use strict';

const DEPLINKS_ATTR = 'data-cb-deplinks';

/** Lowercase, strip HTML, collapse to alphanumeric tokens for fuzzy matching. */
function normalizeTitle(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Pull the free-text dependency reference out of a generated description's
 * "<h3>Dependencies</h3><p>...</p>" block. Returns "" when absent/none. */
function extractDependencyText(descHtml) {
  const m = String(descHtml || '').match(/<h3>\s*Dependencies\s*<\/h3>\s*<p>([\s\S]*?)<\/p>/i);
  if (!m) return '';
  const txt = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return /^none$/i.test(txt) ? '' : txt;
}

/** Token-overlap (Jaccard) between two normalized strings. */
function _overlap(aNorm, bNorm) {
  const a = new Set(aNorm.split(' ').filter(Boolean));
  const b = new Set(bNorm.split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Resolve a free-text dependency to one of `candidates`.
 * candidates: [{ id, title, app_url, completed, listId }]
 * Returns the best-matching candidate (excluding selfId) or null.
 * A normalized substring (either direction) is a strong match; otherwise we
 * require token overlap >= threshold to avoid false links.
 */
function resolveDependency(depText, candidates, { selfId = null, threshold = 0.5 } = {}) {
  const depNorm = normalizeTitle(depText);
  if (!depNorm) return null;
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    if (selfId != null && c.id === selfId) continue;
    const titleNorm = normalizeTitle(c.title);
    if (!titleNorm) continue;
    let score;
    if (depNorm.includes(titleNorm) || titleNorm.includes(depNorm)) {
      // Strong: prefer the longest title that still fits (most specific match).
      score = 1 + titleNorm.length / 1000;
    } else {
      score = _overlap(depNorm, titleNorm);
      if (score < threshold) continue;
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** Derive the todolist URL from a sibling todo's app_url + the list id, by
 * swapping the trailing /todos/<id> segment. Mirrors AI_ProjectArchitect
 * execution/products/ops/bc_urls.py so both repos produce identical links. */
function listUrlFromAppUrl(appUrl, listId) {
  if (!appUrl) return '';
  const i = appUrl.indexOf('/todos/');
  if (i === -1) return '';
  return `${appUrl.slice(0, i)}/todolists/${listId}`;
}

/** Construct a todolist URL when no sample app_url is available (generator,
 * pre-creation). account/project/list ids only. */
function listUrlFromIds({ account, projectId, listId }) {
  return `https://app.basecamp.com/${account}/buckets/${projectId}/todolists/${listId}`;
}

/** Build the marker block. `artifact` is a URL (dependency done) or "PENDING". */
function buildMarkersBlock({ dependsOnUrl, artifact, listUrl }) {
  const human = [];
  if (dependsOnUrl) human.push(`<a href="${dependsOnUrl}">drafting task</a>`);
  if (listUrl) human.push(`<a href="${listUrl}">list</a>`);
  const humanLine = human.length
    ? `🔗 Review this: ${human.join(' · ')}<br>`
    : '';
  return (
    `<p style="font-size:11px;color:#64748b" ${DEPLINKS_ATTR}="1">` +
    humanLine +
    `Depends-on: ${dependsOnUrl || 'PENDING'}<br>` +
    `Artifact: ${artifact || 'PENDING'}<br>` +
    `List: ${listUrl || 'PENDING'}</p>`
  );
}

// Match our marker paragraph by CONTENT (the literal "Depends-on:" label), NOT
// by attribute. Basecamp's rich-text sanitizer drops custom attributes
// (data-cb-deplinks) and rewrites the style on save, so any attribute-based
// match fails on the second run and a fresh block gets appended instead of
// replaced — the duplication bug found 2026-06-15. The "Depends-on:" label is
// unique to our block (the F5 brief-linking uses an <h3>Dependencies</h3>
// heading, never "Depends-on:") and survives the sanitizer. Fresh regex per
// call so the `g` flag's lastIndex never leaks between calls.
function markerBlockRe() {
  return /\n?\s*<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?Depends-on:(?:(?!<\/p>)[\s\S])*?<\/p>/gi;
}

/** How many marker blocks the description currently carries (0, 1, or — after
 * the duplication bug — more). */
function countMarkerBlocks(descHtml) {
  return (String(descHtml || '').match(markerBlockRe()) || []).length;
}

/** Parse the marker values (Depends-on / Artifact / List) from a description,
 * using the same label regexes the AI_ProjectArchitect consumer uses, so the
 * check matches what actually gets parsed downstream. Returns null if absent. */
function extractMarkers(descHtml) {
  const html = String(descHtml || '');
  const dep = html.match(/Depends-on:\s*(?:<\/strong>)?\s*([^<\n]+?)\s*(?:<|$)/i);
  if (!dep) return null;
  const art = html.match(/Artifact:\s*(?:<\/strong>)?\s*([^<\n]+?)\s*(?:<|$)/i);
  const lst = html.match(/List:\s*(?:<\/strong>)?\s*([^<\n]+?)\s*(?:<|$)/i);
  return { dependsOn: dep[1], artifact: art ? art[1] : null, list: lst ? lst[1] : null };
}

/**
 * The idempotency check the writers use INSTEAD of byte-equality. Basecamp
 * mutates our HTML on save (strips attributes, rewrites style), so
 * `newHtml === storedHtml` is never true and a string compare would rewrite
 * every run. The parsed VALUES, however, are stable. Returns true only when the
 * description has EXACTLY ONE marker block whose values equal the desired ones;
 * false when there are zero, more than one (duplication to collapse), or any
 * value differs (the link changed).
 */
function markersAreCurrent(descHtml, { dependsOnUrl, artifact, listUrl }) {
  if (countMarkerBlocks(descHtml) !== 1) return false;
  const m = extractMarkers(descHtml);
  return !!m &&
    m.dependsOn === (dependsOnUrl || 'PENDING') &&
    m.artifact === (artifact || 'PENDING') &&
    m.list === (listUrl || 'PENDING');
}

/** Insert the marker block, first stripping ALL prior marker blocks (so a
 * description that picked up duplicates collapses back to exactly one). Placed
 * right after the Dependencies block when present, else before the closing
 * </div>, else appended. Callers should gate this with markersAreCurrent() so
 * they only write when something actually changed. */
function injectMarkers(descHtml, markersBlock) {
  let html = String(descHtml || '').replace(markerBlockRe(), '');
  const depBlock = html.match(/<h3>\s*Dependencies\s*<\/h3>\s*<p>[\s\S]*?<\/p>/i);
  if (depBlock) {
    const idx = html.indexOf(depBlock[0]) + depBlock[0].length;
    return html.slice(0, idx) + '\n' + markersBlock + html.slice(idx);
  }
  const closeDiv = html.lastIndexOf('</div>');
  if (closeDiv !== -1) {
    return html.slice(0, closeDiv) + markersBlock + '\n' + html.slice(closeDiv);
  }
  return html + '\n' + markersBlock;
}

/** True if a description already carries a marker block (content-based, so it
 * survives Basecamp's attribute sanitizer). */
function hasMarkers(descHtml) {
  return /Depends-on:/i.test(String(descHtml || ''));
}

module.exports = {
  DEPLINKS_ATTR,
  normalizeTitle,
  extractDependencyText,
  resolveDependency,
  listUrlFromAppUrl,
  listUrlFromIds,
  buildMarkersBlock,
  injectMarkers,
  countMarkerBlocks,
  extractMarkers,
  markersAreCurrent,
  hasMarkers,
};
