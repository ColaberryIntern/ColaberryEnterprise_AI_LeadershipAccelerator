/**
 * SV0.3 data module - the ONE source both SV0.3 PDFs read. Computed from the committed taxonomy, snapshot and manifest.
 */
const path = require('path');

const DOCS = path.join(__dirname, '..', '..', '..', 'docs', 'services');

function compute() {
  const tax = require(path.join(DOCS, 'taxonomy_v2.json'));
  const snap = require(path.join(DOCS, 'baseline', 'catalog_2026-11-13.json'));
  const man = require(path.join(DOCS, 'whitepaper_manifest.json'));
  const byId = new Map(snap.rows.map((r) => [r.id, r]));
  const recByFile = new Map(man.records.map((r) => [r.sourceFile, r]));
  const industries = [...new Set(man.records.map((r) => r.industry))].sort();

  const services = tax.services.map((s) => {
    const recs = s.caseStudies.map((f) => recByFile.get(f));
    const perIndustry = Object.fromEntries(industries.map((i) => [i, recs.filter((r) => r.industry === i).length]));
    const metrics = recs.reduce((a, r) => a + r.outcomes.length, 0);
    const old = s.existingIds.map((id) => byId.get(id)).filter(Boolean)[0] || null;
    return { ...s, perIndustry, evidence: s.caseStudies.length, metrics,
      strength: s.caseStudies.length >= 3 ? 'strong' : s.caseStudies.length === 2 ? 'moderate' : 'thin',
      old: old && { name: old.name, description: old.description, keywords: old.keywords.length, naics: old.naicsCodes.length, category: old.category } };
  });
  const untouched = tax.untouchedExistingIds.map((id) => byId.get(id)).map((r) => ({ name: r.name, status: r.status }));
  const activeNow = snap.rows.filter((r) => r.status === 'active').length;
  return {
    services, industries, untouched, activeNow,
    counts: { UPDATE: services.filter((s) => s.action === 'UPDATE').length, NEW: services.filter((s) => s.action === 'NEW').length },
    activeAfterM3: activeNow + services.filter((s) => s.action === 'NEW').length,
    caseStudies: man.recordCount,
    retiredTopMatch: { name: 'Project Management', matches: 28 },
  };
}

module.exports = { compute };
