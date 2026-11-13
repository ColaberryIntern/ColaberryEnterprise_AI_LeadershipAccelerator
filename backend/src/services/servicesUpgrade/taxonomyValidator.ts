/**
 * SV0.3 - validates a Services v2 taxonomy against the catalog snapshot and the evidence manifest, enforcing the
 * Gov AI Compatibility Contract BEFORE anything is written to service_offerings (SV2.2 refuses an invalid file).
 *
 * Pure: takes parsed objects, returns a list of human-readable problems (empty = valid).
 */
import type { CatalogSnapshot, Manifest, TaxonomyV2 } from './schemas';

export const MAX_ACTIVE_SERVICES = 80; // govCapabilityFit prompt cap
export const MAX_LEAD_CHARS = 200; // govCapabilityFit sends description.slice(0, 200)

/** The first sentence: what the Gov AI is guaranteed to see. */
export const leadSentence = (d: string): string => (d.match(/^.*?[.!?](\s|$)/)?.[0] ?? d).trim();

export function validateTaxonomy(t: TaxonomyV2, snapshot: CatalogSnapshot, manifest: Manifest): string[] {
  const problems: string[] = [];
  const byId = new Map(snapshot.rows.map((r) => [r.id, r]));
  const files = new Set(manifest.records.map((r) => r.sourceFile));
  const keys = new Set<string>();
  const claimedIds = new Map<string, string>();

  for (const s of t.services) {
    const where = `service "${s.key}"`;
    if (keys.has(s.key)) problems.push(`${where}: duplicate key`);
    keys.add(s.key);
    if (s.action === 'NEW' && s.existingIds.length) problems.push(`${where}: NEW must not reference existing ids`);
    if (s.action === 'UPDATE' && s.existingIds.length !== 1) problems.push(`${where}: UPDATE must reference exactly one existing id`);
    if (s.action === 'MERGE' && s.existingIds.length < 2) problems.push(`${where}: MERGE must reference two or more existing ids`);
    for (const id of s.existingIds) {
      const row = byId.get(id);
      if (!row) problems.push(`${where}: unknown existing id ${id} (not in snapshot)`);
      else if (row.status === 'retired') problems.push(`${where}: existing id ${id} is retired; restoring a retired service is an M1 decision, not a taxonomy row`);
      if (claimedIds.has(id)) problems.push(`${where}: id ${id} already claimed by "${claimedIds.get(id)}"`);
      claimedIds.set(id, s.key);
    }
    if (leadSentence(s.description).length > MAX_LEAD_CHARS) problems.push(`${where}: lead sentence over ${MAX_LEAD_CHARS} chars (the Gov AI would see a truncated claim)`);
    if (s.keywords.length < 3 || s.keywords.length > 12) problems.push(`${where}: needs 3-12 keywords (has ${s.keywords.length})`);
    if (new Set(s.keywords.map((k) => k.toLowerCase())).size !== s.keywords.length) problems.push(`${where}: duplicate keywords`);
    if (!s.naics.length) problems.push(`${where}: needs at least one NAICS code`);
    for (const n of s.naics) if (!/^\d{6}$/.test(n.code) || n.title.length < 5) problems.push(`${where}: NAICS "${n.code}" must be 6 digits with a title`);
    for (const p of s.psc) if (!/^[A-Z0-9]{4}$/.test(p.code) || p.title.length < 5) problems.push(`${where}: PSC "${p.code}" must be 4 characters with a title`);
    for (const f of s.caseStudies) if (!files.has(f)) problems.push(`${where}: case study not in manifest: ${f}`);
    // "No row, no claim": every number in the description must appear in the manifest text of this service's
    // own case studies, so a figure the Gov AI or a proposal quotes is always traceable to evidence.
    const evidence = manifest.records.filter((r) => s.caseStudies.includes(r.sourceFile))
      .map((r) => [r.title, r.problem, r.solution, ...r.outcomes.map((o) => o.text)].join(' ')).join(' ');
    for (const n of s.description.match(/\d[\d,.]*%?/g) || []) {
      if (!evidence.includes(n.replace(/[.,]$/, ''))) problems.push(`${where}: number "${n}" in description is not in its case studies' manifest text`);
    }
    if (s.caseStudies.length < 2 && !s.thinEvidence) problems.push(`${where}: fewer than 2 case studies must be flagged thinEvidence`);
  }

  const assigned = new Set(t.services.flatMap((s) => s.caseStudies));
  const homeless = new Set(t.noHome.map((n) => n.sourceFile));
  for (const f of files) if (!assigned.has(f) && !homeless.has(f)) problems.push(`case study has no service and no noHome reason: ${f}`);

  for (const id of t.untouchedExistingIds) {
    if (!byId.has(id)) problems.push(`untouched id ${id} not in snapshot`);
    if (claimedIds.has(id)) problems.push(`untouched id ${id} is also claimed by "${claimedIds.get(id)}"`);
  }
  for (const r of snapshot.rows) {
    if (r.status !== 'retired' && !claimedIds.has(r.id) && !t.untouchedExistingIds.includes(r.id)) {
      problems.push(`non-retired service "${r.name}" (${r.id}) is neither updated nor listed as untouched`);
    }
  }

  const activeAfter = snapshot.rows.filter((r) => r.status === 'active').length + t.services.filter((s) => s.action === 'NEW').length;
  if (activeAfter > MAX_ACTIVE_SERVICES) problems.push(`active + new = ${activeAfter} exceeds the ${MAX_ACTIVE_SERVICES}-service prompt cap`);
  return problems;
}
