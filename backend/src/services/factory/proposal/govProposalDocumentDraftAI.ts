/**
 * govProposalDocumentDraftAI — "Draft with AI" for a whole NAMED proposal document (cockpit v2). Given the
 * document's title and the requirements it must cover, it drafts the full document as styled-safe HTML. Same rails
 * as govProposalDraftAI: instrumented OpenAI, content-hash cache, FAIL SOFT (no key / empty input / upstream error
 * → `error`, never throws), and the NO-FABRICATION rule — it never invents a client name, metric, date, dollar
 * figure, certification or person; where a specific fact is needed it writes a visible [PLACEHOLDER: …] the firm
 * fills, never an asserted fact.
 *
 * SECURITY: the model's HTML is UNTRUSTED and will be rendered in the cockpit, so sanitizeProposalHtml (PURE +
 * unit-tested) reduces it to an ALLOWLIST of structural tags with NO attributes — no <script>/<style>/<iframe>, no
 * event handlers, no href/src — which neutralizes XSS before the HTML is ever stored or shown.
 */
import crypto from 'crypto';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { DEFAULT_MODEL } from '../../components/costEstimationService';
import { groundingToPromptText, type Grounding } from './proposalGrounding';
import { isSubmissionInstructionRequirement } from './documentChecks';

interface CacheEntry<T> { value: T; at: number; }
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 100;
const cache = new Map<string, CacheEntry<unknown>>();
const cacheGet = <T>(k: string): T | null => { const e = cache.get(k); if (!e) return null; if (Date.now() - e.at > TTL_MS) { cache.delete(k); return null; } return e.value as T; };
const cacheSet = <T>(k: string, v: T): void => { if (cache.size >= MAX_ENTRIES) { const f = cache.keys().next().value; if (f !== undefined) cache.delete(f); } cache.set(k, { value: v, at: Date.now() }); };
const hash = (o: unknown): string => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const clampStr = (v: unknown, n: number): string => String(v ?? '').trim().slice(0, n);

// The only tags a drafted proposal document may contain. `figure`/`figcaption`/`img` were added for P4 build-evidence
// figures; every other tag (script/style/iframe/a/…) is still stripped.
const ALLOWED_TAGS = new Set(['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'br', 'figure', 'figcaption', 'img']);

// P4: an <img> may keep ONLY a `src` pointing at THIS app's own, access-checked artifact-image route (relative,
// same-origin), never an external/data:/javascript: url. A <figure> may keep ONLY a `data-artifact` uuid. This is
// the narrow exception to the "no attributes" rail, kept deliberately tight so no XSS vector opens.
const ARTIFACT_SRC_RE = /^\/api\/[\w/-]*artifacts\/[A-Za-z0-9-]+\/image$/;
function attrValue(attrs: string, name: string): string | null {
  const m = new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i').exec(attrs) || new RegExp(name + "\\s*=\\s*'([^']*)'", 'i').exec(attrs);
  return m ? m[1] : null;
}

/**
 * PURE + total: reduce untrusted HTML to the allowlisted structural tags with NO attributes (the two P4 exceptions
 * above). Drops the entire contents of <script>/<style>, removes comments, strips every other attribute (so no event
 * handlers / javascript: urls survive), and removes any non-allowlisted tag while keeping its inner text. The XSS rail.
 */
// A generous upper bound on a single proposal document's HTML. The old 40000 (~8 pages) silently truncated a
// multi-volume technical response mid-sentence and then tanked its coverage check (every requirement past the cut
// read as un-answered). This bounds length as an XSS/DoS guard without amputating a legitimately long volume.
const MAX_DOC_HTML = 200000;
export function sanitizeProposalHtml(raw: unknown): string {
  let html = clampStr(raw, MAX_DOC_HTML);
  if (!html) return '';
  // 1. Remove script/style/iframe/head blocks ENTIRELY (tag + contents).
  html = html.replace(/<(script|style|iframe|head|title|template|svg|math)[\s\S]*?<\/\1\s*>/gi, '');
  // 2. Drop comments.
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  // 3. For every remaining tag, keep it ONLY if allowlisted; strip attributes except the two narrow P4 exceptions.
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, slash: string, name: string, attrs: string) => {
    const tag = name.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (slash) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    if (tag === 'img') { const src = attrValue(attrs, 'src'); return src && ARTIFACT_SRC_RE.test(src) ? `<img src="${src}">` : ''; }
    if (tag === 'figure') { const da = attrValue(attrs, 'data-artifact'); return da && /^[A-Za-z0-9-]+$/.test(da) ? `<figure data-artifact="${da}">` : '<figure>'; }
    return `<${tag}>`;
  });
  return html.trim().slice(0, MAX_DOC_HTML);
}

export interface DocumentDraftReq { canonicalReqId: string; statement: string; }
export interface DocumentDraftInput { docKey: string; title: string; requirements: DocumentDraftReq[]; title_opportunity?: string | null; buyer?: string | null; agency?: string | null; /** P5: the grounding (blueprint weights/rules, section plans, artifacts, approved facts) — the ONLY specific facts the draft may assert. */ grounding?: Grounding | null; }
export interface DocumentDraftResult { html: string; cached: boolean; generatedAt: string; error?: string; /** P5: structured questions the draft could not answer from the grounding (never asserted facts). */ gaps?: Array<{ question: string; suggestions: string[] }>; }

// Overall ceiling on requirements drafted for ONE document, and the per-model-call batch size. A single call with
// ~40 requirements overran the 4000-token response budget, truncating the JSON so it parsed to nothing and the whole
// document failed. Drafting DRAFT_BATCH_SIZE requirements per call keeps each response within budget; the sections
// are stitched into one document. MAX_REQS_TOTAL bounds a pathological requirement set (and the per-doc runtime).
const MAX_REQS_TOTAL = 160;
const DRAFT_BATCH_SIZE = 12;

const DRAFT_SYSTEM_PROMPT =
  'You draft a complete, professional government-proposal document for a small firm. Write the full document that ' +
  'satisfies ALL of the listed requirements, organized with clear headings. ' +
  // SUBSTANCE OVER RESTATEMENT. This is the difference between a winning technical response and a hollow one.
  'SUBSTANCE RULE: for every TECHNICAL or FUNCTIONAL requirement, write a real, specific RESPONSE, not a restatement ' +
  'of the requirement. Each answer must give: the proposed approach; the concrete workflow or architecture (the ' +
  'actual steps, roles and data flow); how data moves and how any named system is integrated (mapping, ' +
  'authentication, synchronization direction and conflict/error handling); the applicable security/access control; ' +
  'the implementation step that delivers it; and a verifiable ACCEPTANCE TEST that proves it works. When a ' +
  'requirement NAMES a specific system, standard, or integration target, address it BY NAME with the proposed ' +
  'integration approach — proposing HOW you would integrate a named system is a method, not a fabricated fact, so do ' +
  'it rather than speaking generically. NEVER answer a technical requirement with bare compliance language ("we ' +
  'comply", "we understand", "the system shall ...") or a Benefit/Proof/Compliance restatement template — that earns ' +
  'zero. ' +
  // TRACEABILITY: one heading per requirement, carrying its canonical id, so each answer maps back to the
  // requirement it satisfies (the coverage check credits a requirement by its own section's substance).
  'STRUCTURE RULE: begin the response to EACH requirement with its own heading in the exact form ' +
  '"<h3>REQ-ID: short title</h3>" using that requirement\'s canonical id (for example "<h3>REQ-012: GIS ' +
  'integration</h3>"), then the full response beneath it. Exactly one heading per requirement, and never merge two ' +
  'requirements under one heading. ' +
  // Submission instructions are NOT technical strategy. This is the exact failure an independent review caught.
  'SUBMISSION-INSTRUCTION RULE: a requirement that only governs HOW, WHEN, WHERE or in WHAT FORMAT the proposal is ' +
  'submitted (email vs portal, number of copies, file type, page/font limits, deadlines, labeling) is an ' +
  'administrative compliance item, NOT a technical delivery strategy. Do NOT write a technical approach, workflow or ' +
  'acceptance test for it, and never present a submission instruction as if it were part of the solution. Note it in ' +
  'one short compliance sentence (it belongs to the compliance matrix) and spend your words on the real technical ' +
  'requirements. ' +
  'CRITICAL (no fabrication): use ONLY general, verifiable statements and the approaches you propose; do NOT invent any ' +
  'specific fact - no client names, project names, metrics, dates, dollar figures, certifications, or personnel. ' +
  'Whenever a strong document WOULD need such a specific fact, insert a visible placeholder exactly like ' +
  '[PLACEHOLDER: what the firm must provide] rather than inventing it. ' +
  'EXCEPTION for grouped records: for a PAST-PERFORMANCE or REFERENCES entry do NOT write a separate [PLACEHOLDER] ' +
  'per field; write ONE grouped marker [RECORD: reference] for each reference the section needs (exactly one if the ' +
  'solicitation does not state a number). For a KEY-PERSON entry write [RECORD: personnel]. A [RECORD] marker is ' +
  'answered as a whole record (client, scope, period, outcome / name, role, experience) and must NEVER be split ' +
  'into per-field placeholders. ' +
  'Return STRICT JSON {"html":"...","gaps":[{"question":"...","suggestions":["..."]}]} where html uses ONLY these ' +
  'tags: h2, h3, h4, p, ul, ol, li, strong, em, table, thead, tbody, tr, th, td, blockquote, br. No attributes, no ' +
  '<script>, no <style>, no links or images. `gaps` lists each specific fact you needed but could not find in the ' +
  'grounding (you wrote a [PLACEHOLDER] for it) — never invent the fact.';

interface BatchResult { html: string; gaps: Array<{ question: string; suggestions: string[] }>; error?: string; }

/** Draft ONE batch of requirements as sanitized HTML. FAIL SOFT: returns an error string, never throws. */
async function draftRequirementBatch(input: DocumentDraftInput, batch: DocumentDraftReq[], groundingText: string): Promise<BatchResult> {
  const reqBlock = batch.map((r) => `- [${r.canonicalReqId}] [${isSubmissionInstructionRequirement(r.statement) ? 'SUBMISSION-INSTRUCTION' : 'TECHNICAL'}] ${clampStr(r.statement, 500)}`).join('\n');
  const user = [
    `Document to draft: "${input.title}"`,
    input.title_opportunity ? `Opportunity: ${input.title_opportunity}` : '',
    (input.agency || input.buyer) ? `Agency / buyer: ${input.agency || input.buyer}` : '',
    'It must cover these requirements:',
    reqBlock,
    groundingText ? `\nGROUNDING — the ONLY specific facts you may assert:\n${groundingText}` : '',
  ].filter(Boolean).join('\n');
  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_proposal_document_draft' }, { timeout: 120000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.3, max_tokens: 4000, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: DRAFT_SYSTEM_PROMPT }, { role: 'user', content: user }],
    });
    let parsed: any = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    const html = sanitizeProposalHtml(parsed?.html);
    const gaps = Array.isArray(parsed?.gaps)
      ? parsed.gaps.filter((g: any) => g && typeof g.question === 'string').map((g: any) => ({ question: String(g.question), suggestions: Array.isArray(g.suggestions) ? g.suggestions.map(String) : [] }))
      : [];
    if (!html) return { html: '', gaps: [], error: 'The AI returned no usable content. Try again.' };
    return { html, gaps };
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'gov_proposal_document_draft', outcome: 'failure', error_class: (err as any)?.constructor?.name ?? 'Error', context: { message: (err as any)?.message, doc_key: input.docKey } }));
    return { html: '', gaps: [], error: 'The AI draft could not be generated right now.' };
  }
}

/** Split requirements into batches of at most `size` (pure; preserves order). */
export function batchRequirements(reqs: DocumentDraftReq[], size: number): DocumentDraftReq[][] {
  const n = Math.max(1, size);
  const out: DocumentDraftReq[][] = [];
  for (let i = 0; i < reqs.length; i += n) out.push(reqs.slice(i, i + n));
  return out;
}

/** Draft a full proposal document as sanitized HTML. FAIL SOFT; never throws. Large documents are drafted in
 *  batches (each model response stays within the token budget) and the sections are stitched together. */
export async function generateProposalDocumentDraftAI(input: DocumentDraftInput): Promise<DocumentDraftResult> {
  const now = () => new Date().toISOString();
  const reqs = (Array.isArray(input.requirements) ? input.requirements : []).filter((r) => r && r.statement);
  if (!process.env.OPENAI_API_KEY) return { html: '', cached: false, generatedAt: now(), error: 'AI drafting is unavailable (no API key configured).' };
  if (reqs.length === 0) return { html: '', cached: false, generatedAt: now(), error: 'This document has no requirements to draft from yet.' };

  const useReqs = reqs.slice(0, MAX_REQS_TOTAL);
  const groundingText = input.grounding ? groundingToPromptText(input.grounding) : '';
  // Cache over the WHOLE requirement set (not just the first 40), so a large doc caches its full stitched draft.
  const reqKeyBlock = useReqs.map((r) => `${r.canonicalReqId}:${clampStr(r.statement, 120)}`).join('|');
  const key = 'docdraftai:' + hash({ k: input.docKey, t: input.title, r: reqKeyBlock, b: input.buyer ?? null, a: input.agency ?? null, g: groundingText });
  const hit = cacheGet<DocumentDraftResult>(key);
  if (hit) return { ...hit, cached: true };

  const batches = batchRequirements(useReqs, DRAFT_BATCH_SIZE);
  const htmlParts: string[] = [];
  const gapsAll: Array<{ question: string; suggestions: string[] }> = [];
  let lastError: string | null = null;
  for (const batch of batches) {
    const r = await draftRequirementBatch(input, batch, groundingText);
    if (r.error) { lastError = r.error; continue; } // a failed batch is skipped; the rest still contribute content
    if (r.html) htmlParts.push(r.html);
    for (const g of r.gaps) gapsAll.push(g);
  }
  const html = htmlParts.join('\n').trim();
  if (!html) return { html: '', cached: false, generatedAt: now(), error: lastError || 'The AI returned no usable content. Try again.' };
  // Dedupe gaps by question so a fact asked across batches surfaces once.
  const seen = new Set<string>();
  const gaps = gapsAll.filter((g) => { const k = g.question.toLowerCase().trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  const result: DocumentDraftResult = { html, cached: false, generatedAt: now(), gaps };
  cacheSet(key, result);
  return result;
}

/** Test seam: clear the in-memory cache. */
export function __clearGovProposalDocumentDraftCache(): void { cache.clear(); }
