/**
 * SV0.2 data module - the ONE source both SV0.2 PDFs read. Everything is computed from the committed manifest.
 */
const path = require('path');

const MANIFEST = path.join(__dirname, '..', '..', '..', 'docs', 'services', 'whitepaper_manifest.json');

const FIELDS = [
  { key: 'title', label: 'Title', ok: (r) => r.title.length > 3 && !r.gaps.some((g) => g.startsWith('title')) },
  { key: 'problem', label: 'Problem', ok: (r) => !!r.problem && !r.gaps.some((g) => g.startsWith('problem')) },
  { key: 'solution', label: 'Solution', ok: (r) => !!r.solution && !r.gaps.some((g) => g.startsWith('solution')) },
  { key: 'tech', label: 'Tech stack', ok: (r) => r.techStack.length > 0 },
  { key: 'caps', label: '2+ capabilities', ok: (r) => r.capabilities.length >= 2 },
  { key: 'outcomes', label: 'Cited metric', ok: (r) => r.outcomes.length > 0 },
  { key: 'client', label: 'Anon. client', ok: (r) => !!r.clientDescriptor },
];

function compute() {
  const m = require(MANIFEST);
  const recs = m.records;
  const industries = {};
  const caps = {};
  recs.forEach((r) => {
    industries[r.industry] = (industries[r.industry] || 0) + 1;
    r.capabilities.forEach((c) => { caps[c] = (caps[c] || 0) + 1; });
  });
  const coverage = FIELDS.map((f) => ({ label: f.label, cells: recs.map((r) => f.ok(r)), n: recs.filter((r) => f.ok(r)).length }));
  const outcomes = recs.flatMap((r) => r.outcomes.map((o) => ({ file: r.sourceFile, title: r.title, ...o })));
  return {
    total: recs.length,
    industries: Object.entries(industries).sort((a, b) => b[1] - a[1]),
    capabilities: Object.entries(caps).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    capabilityCount: Object.keys(caps).length,
    coverage,
    withMetrics: recs.filter((r) => r.outcomes.length > 0).length,
    outcomeCount: outcomes.length,
    topOutcomes: outcomes.filter((o) => /%/.test(o.numbers.join(' '))).slice(0, 10),
    records: recs.map((r, i) => ({ n: i + 1, title: r.title, industry: r.industry, file: r.sourceFile, caps: r.capabilities.length,
      outcomes: r.outcomes.length, gaps: r.gaps, descriptor: r.clientDescriptor, upload: r.basecampUploadId })),
    gapCount: recs.reduce((a, r) => a + r.gaps.length, 0),
    namedPartnerFiles: recs.filter((r) => /ALLIN/.test(r.sourceFile)).length,
  };
}

module.exports = { compute };
