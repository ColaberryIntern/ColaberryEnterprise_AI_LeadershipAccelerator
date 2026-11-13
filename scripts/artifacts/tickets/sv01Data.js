/**
 * SV0.1 data module - the ONE source both SV0.1 PDFs read, so a number on the visual cannot drift from the document.
 *
 * Inputs: the committed catalog snapshot (public-safe) and the stored Gov AI verdicts, which are internal pursuit
 * strategy and therefore live OUTSIDE this public repo (SVC_PRIVATE_DIR). Every figure is computed here, never typed.
 */
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const TAKEN_ON = '2026-11-13';

function load() {
  const dir = process.env.SVC_PRIVATE_DIR;
  if (!dir) throw new Error('SVC_PRIVATE_DIR is required (holds capability_fit_stored_<date>.json, kept out of the public repo)');
  const catalog = require(path.join(ROOT, 'docs', 'services', 'baseline', `catalog_${TAKEN_ON}.json`));
  const fit = require(path.join(dir, `capability_fit_stored_${TAKEN_ON}.json`));
  return { catalog, fit };
}

/** Gov AI readiness rules (the Compatibility Contract field rules, same as the SV3.2 badge will use). */
const RULES = [
  { key: 'desc', label: 'Description 40+ chars', test: (r) => (r.description || '').trim().length >= 40 },
  { key: 'cat', label: 'Category', test: (r) => !!r.category },
  { key: 'kw', label: '3-12 keywords', test: (r) => r.keywords.length >= 3 && r.keywords.length <= 12 },
  { key: 'naics', label: 'NAICS codes', test: (r) => r.naicsCodes.length > 0 },
];

function compute() {
  const { catalog, fit } = load();
  const statusById = new Map(catalog.rows.map((r) => [r.id, r.status]));
  const nameById = new Map(catalog.rows.map((r) => [r.id, r.name]));
  const byStatus = { active: 0, growth: 0, retired: 0 };
  catalog.rows.forEach((r) => { byStatus[r.status] += 1; });

  const caps = fit.pursuits.flatMap((p) => p.capabilities);
  const assess = { have: 0, partial: 0, new: 0 };
  caps.forEach((c) => { assess[c.assessment] += 1; });
  const matchesByStatus = { active: 0, growth: 0, retired: 0 };
  const haveByStatus = { active: 0, growth: 0, retired: 0 };
  const matchCount = new Map();
  caps.forEach((c) => {
    if (!c.matchedServiceId) return;
    const s = statusById.get(c.matchedServiceId);
    matchesByStatus[s] += 1;
    if (c.assessment === 'have') haveByStatus[s] += 1;
    matchCount.set(c.matchedServiceId, (matchCount.get(c.matchedServiceId) || 0) + 1);
  });
  const topMatched = [...matchCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([id, n]) => ({ id, name: nameById.get(id), status: statusById.get(id), n }));

  const verdicts = {};
  fit.pursuits.forEach((p) => { verdicts[p.verdict || 'none'] = (verdicts[p.verdict || 'none'] || 0) + 1; });
  const dates = fit.pursuits.map((p) => (p.completedAt || '').slice(0, 10)).filter(Boolean).sort();

  const active = catalog.rows.filter((r) => r.status === 'active');
  const readiness = active.map((r) => ({ name: r.name, category: r.category, cells: RULES.map((rule) => rule.test(r)) }))
    .sort((a, b) => a.cells.filter(Boolean).length - b.cells.filter(Boolean).length);
  const ready = readiness.filter((r) => r.cells.every(Boolean)).length;

  const totalMatches = matchesByStatus.active + matchesByStatus.growth + matchesByStatus.retired;
  return {
    takenOn: TAKEN_ON, rows: catalog.rowCount, byStatus, bids: fit.pursuits.length, capabilities: caps.length, assess, verdicts,
    dates: { first: dates[0], last: dates[dates.length - 1] }, matchesByStatus, haveByStatus, totalMatches,
    retiredMatchPct: Math.round((100 * matchesByStatus.retired) / Math.max(1, totalMatches)),
    retiredHavePct: Math.round((100 * haveByStatus.retired) / Math.max(1, assess.have)),
    havePct: Math.round((100 * assess.have) / Math.max(1, caps.length)),
    topMatched, rules: RULES.map((r) => r.label), readiness, ready, activeCount: active.length,
  };
}

module.exports = { compute };
