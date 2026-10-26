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

interface CacheEntry<T> { value: T; at: number; }
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 100;
const cache = new Map<string, CacheEntry<unknown>>();
const cacheGet = <T>(k: string): T | null => { const e = cache.get(k); if (!e) return null; if (Date.now() - e.at > TTL_MS) { cache.delete(k); return null; } return e.value as T; };
const cacheSet = <T>(k: string, v: T): void => { if (cache.size >= MAX_ENTRIES) { const f = cache.keys().next().value; if (f !== undefined) cache.delete(f); } cache.set(k, { value: v, at: Date.now() }); };
const hash = (o: unknown): string => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const clampStr = (v: unknown, n: number): string => String(v ?? '').trim().slice(0, n);

// The only tags a drafted proposal document may contain. Everything else (script/style/iframe/a/img/…) is stripped.
const ALLOWED_TAGS = new Set(['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'br']);

/**
 * PURE + total: reduce untrusted HTML to the allowlisted structural tags with NO attributes. Drops the entire
 * contents of <script>/<style> (not just the tags), strips every attribute (so no event handlers / javascript: urls
 * survive), and removes any tag not on the allowlist while keeping its inner text. Caps length. This is the XSS rail.
 */
export function sanitizeProposalHtml(raw: unknown): string {
  let html = clampStr(raw, 40000);
  if (!html) return '';
  // 1. Remove script/style/iframe/head blocks ENTIRELY (tag + contents).
  html = html.replace(/<(script|style|iframe|head|title|template|svg|math)[\s\S]*?<\/\1\s*>/gi, '');
  // 2. Drop comments.
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  // 3. For every remaining tag, keep it ONLY if allowlisted, and ALWAYS strip its attributes.
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, slash: string, name: string) => {
    const tag = name.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    return slash ? `</${tag}>` : (tag === 'br' ? '<br>' : `<${tag}>`);
  });
  return html.trim().slice(0, 40000);
}

export interface DocumentDraftReq { canonicalReqId: string; statement: string; }
export interface DocumentDraftInput { docKey: string; title: string; requirements: DocumentDraftReq[]; title_opportunity?: string | null; buyer?: string | null; agency?: string | null; }
export interface DocumentDraftResult { html: string; cached: boolean; generatedAt: string; error?: string; }

/** Draft a full proposal document as sanitized HTML. FAIL SOFT; never throws. */
export async function generateProposalDocumentDraftAI(input: DocumentDraftInput): Promise<DocumentDraftResult> {
  const now = () => new Date().toISOString();
  const reqs = (Array.isArray(input.requirements) ? input.requirements : []).filter((r) => r && r.statement);
  if (!process.env.OPENAI_API_KEY) return { html: '', cached: false, generatedAt: now(), error: 'AI drafting is unavailable (no API key configured).' };
  if (reqs.length === 0) return { html: '', cached: false, generatedAt: now(), error: 'This document has no requirements to draft from yet.' };

  const reqBlock = reqs.slice(0, 40).map((r) => `- [${r.canonicalReqId}] ${clampStr(r.statement, 500)}`).join('\n');
  const key = 'docdraftai:' + hash({ k: input.docKey, t: input.title, r: reqBlock, b: input.buyer ?? null, a: input.agency ?? null });
  const hit = cacheGet<DocumentDraftResult>(key);
  if (hit) return { ...hit, cached: true };

  const system =
    'You draft a complete, professional government-proposal document for a small firm. Write the full document that ' +
    'satisfies ALL of the listed requirements, organized with clear headings. CRITICAL: use ONLY general, verifiable ' +
    'statements; do NOT invent any specific fact - no client names, project names, metrics, dates, dollar figures, ' +
    'certifications, or personnel. Whenever a strong document WOULD need such a specific fact, insert a visible ' +
    'placeholder exactly like [PLACEHOLDER: what the firm must provide] rather than inventing it. ' +
    'Return STRICT JSON {"html": "..."} where html uses ONLY these tags: h2, h3, h4, p, ul, ol, li, strong, em, ' +
    'table, thead, tbody, tr, th, td, blockquote, br. No attributes, no <script>, no <style>, no links or images.';
  const user = [
    `Document to draft: "${input.title}"`,
    input.title_opportunity ? `Opportunity: ${input.title_opportunity}` : '',
    (input.agency || input.buyer) ? `Agency / buyer: ${input.agency || input.buyer}` : '',
    'It must cover these requirements:',
    reqBlock,
  ].filter(Boolean).join('\n');

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_proposal_document_draft' }, { timeout: 120000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.3, max_tokens: 4000, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    let parsed: any = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    const html = sanitizeProposalHtml(parsed?.html);
    if (!html) return { html: '', cached: false, generatedAt: now(), error: 'The AI returned no usable content. Try again.' };
    const result: DocumentDraftResult = { html, cached: false, generatedAt: now() };
    cacheSet(key, result);
    return result;
  } catch (err) {
    console.error(JSON.stringify({ timestamp: now(), level: 'error', service: 'backend', event: 'gov_proposal_document_draft', outcome: 'failure', error_class: (err as any)?.constructor?.name ?? 'Error', context: { message: (err as any)?.message, doc_key: input.docKey } }));
    return { html: '', cached: false, generatedAt: now(), error: 'The AI draft could not be generated right now.' };
  }
}

/** Test seam: clear the in-memory cache. */
export function __clearGovProposalDocumentDraftCache(): void { cache.clear(); }
