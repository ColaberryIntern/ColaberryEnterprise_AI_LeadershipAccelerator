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


// Words Mermaid's flowchart grammar reserves. Used as a node id they break the parse, and Mermaid 11
// then prints "Syntax error in text" at the bottom of the page (a node named `call`, 2026-11-18).
const MERMAID_RESERVED = ['call', 'click', 'end', 'style', 'class', 'classDef', 'linkStyle', 'subgraph', 'graph', 'flowchart', 'default', 'interpolate', 'direction', 'href'];

/** Node ids in a Mermaid flowchart that are reserved words. Labels in quotes or brackets are ignored. */
function mermaidReservedIds(src) {
  const bare = String(src || '').replace(/"[^"]*"/g, '""').replace(/\|[^|]*\|/g, ' ');
  const found = new Set();
  for (const line of bare.split('\n').slice(1)) {
    for (const m of line.matchAll(/(?:^|-->|---|==>|-\.->|&)\s*([A-Za-z_][\w-]*)/g)) {
      if (MERMAID_RESERVED.includes(m[1])) found.add(m[1]);
    }
  }
  return [...found];
}

/* NO CODE IN A CASE STUDY. Ali, 2026-11-18: "Don't ever show code in a case study", and of the
   Open House screens of a prompt file and a JSON ledger entry: "Remove the claude code
   screenshots ... the part where you show claude is boring." A buyer reads outcomes and the
   product in use, never the source, a prompt, a terminal or the AI that built it.
   Returns the public artifacts whose served file is source or data, or whose title says it
   shows code, a prompt, a terminal or the builder tool. Judged on what the READER is told the
   picture is (title, file type), so a chart titled "The funnel" never trips it. */
const CODE_FILE = /\.(md|markdown|json|ya?ml|js|mjs|cjs|ts|tsx|jsx|py|sh|ps1|sql|diff|patch|txt)(\?|#|$)/i;
const CODE_TITLE = /\b(code|source code|prompt|terminal|console log|json|yaml|script|diff|commit|pull request|claude|cursor|copilot|\.md)\b/i;
function codeShownArtifacts(artifacts) {
  return (Array.isArray(artifacts) ? artifacts : []).filter((a) => a && a.visibility === 'public'
    && (CODE_FILE.test(String(a.publicUrl || a.url || '')) || CODE_TITLE.test(String(a.title || ''))))
    .map((a) => String(a.title || a.publicUrl || a.url));
}

/* THE STORY IN BRIEF, beyond its shape. What the builds of 17-18 Nov 2026 (CF1-CF3, GD1-GD2,
   Internship, Open House) showed a good set of beats does, as checks a script can make:
   - the "What happened" beat carries a figure (8 of 8; 66 of 82 against 0 of 5): a result
     with no number is a claim, and it is the beat a skimming buyer reads;
   - no beat reads like a ticket: no file names, code identifiers, URLs, PR or ticket numbers;
   - no beat repeats the standfirst: the band exists because the opening paragraph sometimes
     does not tell the story, so copying it adds nothing;
   - every beat says a different thing (no two texts alike).
   Returns a list of problems; empty means clean. Shape (3-5 beats, lengths) is the server's
   storyInBriefProblem, checked separately. */
const TICKETISH = /(`|\b[\w-]+\.(js|ts|tsx|py|md|json|sql|sh)\b|https?:\/\/|\bPR ?#?\d+|#\d{3,}|\b[a-z]{2,}[A-Z][a-zA-Z]+\b|\b[a-z]+_[a-z_]+\b)/;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
function storyInBriefLint(beats, standfirst) {
  const out = [];
  if (!Array.isArray(beats) || !beats.length) return out;
  const happened = beats.find((b) => /happen|result|outcome/i.test(String(b && b.label))) || beats[2];
  if (happened && !/\d/.test(String(happened.text))) out.push(`"${happened.label}" carries no figure`);
  beats.forEach((b) => { if (TICKETISH.test(String(b && b.text))) out.push(`"${b.label}" reads like a ticket (file, identifier, URL or PR number)`); });
  const sf = norm(standfirst);
  beats.forEach((b) => { const t = norm(b && b.text); if (sf && t.length > 40 && (sf.includes(t) || t.includes(sf.slice(0, 80)))) out.push(`"${b.label}" repeats the standfirst`); });
  const seen = new Set();
  beats.forEach((b) => { const t = norm(b && b.text); if (seen.has(t)) out.push(`"${b.label}" repeats another beat`); seen.add(t); });
  return out;
}

module.exports = { present, presenceProfile, selectReferences, compareToReferences, formatReport, mermaidReservedIds, codeShownArtifacts, storyInBriefLint };
