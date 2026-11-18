/**
 * completenessCore.js: compare a case study snapshot against approved, published reference records,
 * field by field. Pure: no database, no network. Used by completeness-audit.js (runs in the backend
 * container) and by completenessCore.test.js (runs anywhere with `node --test`).
 *
 * WHY THIS EXISTS (Ali, 2026-11-17): "Every time it goes through it needs me to correct it and tell it
 * to look at the skill and make sure all fields are accounted for." The skill lists what a record needs
 * in prose; the published records are the ground truth of what a finished record actually carries. A
 * field most references have and the draft lacks is a GAP; a list shorter than every reference's is THIN.
 */
'use strict';

/** Non-empty: not null, not "", not [], not {}. */
function present(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i;

/**
 * Paths a finished record carries, with a count for lists. Depth 1 and 2 of the snapshot content, plus
 * derived checks the skill requires but a key alone cannot show.
 * @returns {Record<string, {present: boolean, count: number|null}>}
 */
function presenceProfile(content) {
  const out = {};
  const put = (path, v) => { out[path] = { present: present(v), count: Array.isArray(v) ? v.length : null }; };
  const c = content || {};
  for (const [a, v] of Object.entries(c)) {
    put(a, v);
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [b, w] of Object.entries(v)) put(`${a}.${b}`, w);
  }
  const arts = Array.isArray(c.artifacts) ? c.artifacts : [];
  const metrics = (c.measurement && Array.isArray(c.measurement.metrics)) ? c.measurement.metrics : [];
  const decisions = Array.isArray(c.decisions) ? c.decisions : [];
  const hero = c.identity && c.identity.heroImageUrl;
  const wv = c.walkthroughVideo || {};
  const derived = {
    'derived.openImages': arts.filter((a) => a && a.visibility !== 'private' && IMAGE.test(String(a.publicUrl || ''))).length,
    'derived.coverIsAnArtifact': hero && arts.some((a) => a && a.publicUrl === hero) ? 1 : 0,
    'derived.videoWithCaptions': present(wv.url) && present(wv.captionsUrl) ? 1 : 0,
    'derived.metricsWithPlainAnswers': metrics.filter((m) => m && m.plain && present(m.plain.counts) && present(m.plain.from) && present(m.plain.cannotShow)).length,
    'derived.metricsWithLimitations': metrics.filter((m) => m && m.measurement && present(m.measurement.limitations)).length,
    'derived.decisionsPinnedToEvidence': decisions.filter((d) => d && present(d.evidenceId)).length,
  };
  for (const [k, n] of Object.entries(derived)) out[k] = { present: n > 0, count: n };
  return out;
}

/** Fields of the identity block every record has by construction; comparing them adds noise only. */
const IGNORED = new Set(['identity.slug', 'identity.title']);

/**
 * Pick the n most complete published records (a published snapshot is an approved one), most surfaces
 * next, most recent last. Never the record under audit.
 * @param {{caseStudyId:string, slug:string, content:object, surfaces:string[], publishedAt:string|Date}[]} rows
 */
function selectReferences(rows, selfId, n = 5) {
  return rows
    .filter((r) => r.caseStudyId !== selfId)
    .map((r) => ({ ...r, score: Object.values(presenceProfile(r.content)).filter((p) => p.present).length }))
    .sort((a, b) => (b.score - a.score) || ((b.surfaces || []).length - (a.surfaces || []).length) || (new Date(b.publishedAt) - new Date(a.publishedAt)))
    .slice(0, n);
}

/**
 * @param accepted { [path]: reason }: a gap a person has ruled not applicable, with the reason recorded.
 * @returns {{rows: object[], gaps: object[], thin: object[], accepted: object[], references: number}}
 */
function compareToReferences(draftContent, refContents, { majority, accepted = {} } = {}) {
  const n = refContents.length;
  const need = majority || Math.ceil(n * 0.6);
  const draft = presenceProfile(draftContent);
  const refs = refContents.map(presenceProfile);
  const paths = new Set(refs.flatMap((r) => Object.keys(r)));
  const rows = [];
  for (const path of [...paths].sort()) {
    if (IGNORED.has(path)) continue;
    const having = refs.filter((r) => r[path] && r[path].present);
    if (having.length < need) continue; // not a convention: most finished records do without it
    const d = draft[path] || { present: false, count: null };
    const counts = having.map((r) => r[path].count).filter((x) => x != null);
    const floor = counts.length ? Math.min(...counts) : null;
    let status = 'ok';
    if (!d.present) status = 'gap';
    else if (floor != null && d.count != null && d.count < floor) status = 'thin';
    // Accepting a field accepts its children too: no surfaceVariants means no surfaceVariants.enterprise.
    const reason = accepted[path] || accepted[path.split('.')[0]] || null;
    if (status !== 'ok' && reason) status = 'accepted';
    rows.push({ path, refsHaving: having.length, references: n, draft: d.count != null ? d.count : d.present, refFloor: floor, status, reason: status === 'accepted' ? reason : null });
  }
  return { rows, gaps: rows.filter((r) => r.status === 'gap'), thin: rows.filter((r) => r.status === 'thin'), accepted: rows.filter((r) => r.status === 'accepted'), references: n };
}

/** Plain table for a terminal or a ticket comment. */
function formatReport(result, refSlugs = []) {
  const lines = [`References (${result.references}): ${refSlugs.join(', ')}`, ''];
  const order = { gap: 0, thin: 1, accepted: 2, ok: 3 };
  for (const r of [...result.rows].sort((a, b) => order[a.status] - order[b.status] || a.path.localeCompare(b.path))) {
    const tag = { gap: 'GAP     ', thin: 'THIN    ', accepted: 'ACCEPTED', ok: 'ok      ' }[r.status];
    const floor = r.refFloor != null ? `, references have at least ${r.refFloor}` : '';
    lines.push(`${tag} ${r.path}  (draft: ${r.draft}; ${r.refsHaving} of ${r.references} references${floor})${r.reason ? `  reason: ${r.reason}` : ''}`);
  }
  lines.push('', `GAPS ${result.gaps.length} · THIN ${result.thin.length} · ACCEPTED ${result.accepted.length} · OK ${result.rows.filter((r) => r.status === 'ok').length} of ${result.rows.length}`);
  return lines.join('\n');
}

module.exports = { present, presenceProfile, selectReferences, compareToReferences, formatReport };
