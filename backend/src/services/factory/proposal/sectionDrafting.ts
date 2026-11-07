/**
 * sectionDrafting — grounded, section-by-section drafting for the v3 create-path (§V2, T08). Where the whole-document
 * drafter (govProposalDocumentDraftAI) writes a document in one shot, the create-path (T06) drafts the outline's
 * sections one at a time, each against the SAME grounding (buildGrounding) and a per-document-type template, so every
 * section opens with its requirement-reference line and asserts no fact that is not grounded. A specific fact the
 * draft cannot fill becomes a visible [PLACEHOLDER: …] AND a structured gap; `gapsToNeeds` turns those gaps into typed
 * `HumanNeed`s (fixes D2 — the create-path's gaps are real, deduped needs, not bare question rows).
 *
 * The prompt builders + the gaps→needs conversion are PURE and table-tested; `draftProposalSectionAI` is the thin,
 * FAIL-SOFT AI wrapper (instrumented OpenAI, content-hash cache, sanitize, no-throw) layered on top.
 */
import crypto from 'crypto';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { DEFAULT_MODEL } from '../../components/costEstimationService';
import { sanitizeProposalHtml } from './govProposalDocumentDraftAI';
import { groundingToPromptText, type Grounding } from './proposalGrounding';
import { needKeyForFact, type ParsedPlaceholder } from './placeholderNeeds';
import type { HumanNeed } from './proposalReviewTypes';

/** Per-document-type drafting instruction so each canonical document reads the way an evaluator expects it to. */
const DOC_TYPE_TEMPLATES: Record<string, string> = {
  cover_letter:
    'Write a concise transmittal letter: address the agency, name the solicitation, state that the firm commits to the scope and terms, and close with a signature-block placeholder. No marketing language.',
  past_performance:
    'Present each reference as a structured entry — client, scope, period of performance, outcome. Use a [PLACEHOLDER: …] for any specific client, date, dollar figure, or metric not in the grounding.',
  management:
    'Describe the team and management approach. For each key person give role, responsibilities, and the relevant qualification; use a [PLACEHOLDER: …] for any named person or credential not in the grounding.',
  key_personnel:
    'For each key person give role, responsibilities, and the relevant qualification; use a [PLACEHOLDER: …] for any named person, credential, or years-of-experience figure not in the grounding.',
  technical:
    'Lead each requirement with the hot button, then the feature, the benefit to the agency, then the proof. Stay specific to this scope; never write filler that would fit any proposal.',
  reps_certs:
    'State each representation or certification plainly; where a specific registration number, date, or status is required, write a [PLACEHOLDER: …] rather than a value.',
  forms:
    'Reproduce the form fields as a labelled list; fill only values present in the grounding and mark every other field [PLACEHOLDER: …].',
};

/** PURE: the drafting instruction for a document type, with a safe default for an unknown key. */
export function docTypeTemplate(docKey: string): string {
  return (
    DOC_TYPE_TEMPLATES[docKey] ??
    'Write the section as a clear, professional government-proposal narrative that directly answers its requirements.'
  );
}

/** PURE: the requirement-reference line every section must open with (empty when the section cites no requirement). */
export function sectionReferenceLine(requirementIds: string[]): string {
  const ids = (Array.isArray(requirementIds) ? requirementIds : []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!ids.length) return '';
  return `This section responds to ${ids.length === 1 ? 'requirement' : 'requirements'} ${ids.join(', ')}.`;
}

export interface SectionDraftInput {
  docKey: string;
  docTitle: string;
  section: { heading: string; requirementIds: string[]; pageBudget?: number | null; plan?: string | null };
  /** The grounding — the ONLY specific facts this section may assert (shared with the whole-doc drafter + reviser). */
  grounding: Grounding;
}

const SECTION_SYSTEM =
  'You draft ONE section of a government-proposal document — only this section, no document title and no other ' +
  'sections. Open the section body with the exact requirement-reference line given, then follow the section plan ' +
  'if one is provided. CRITICAL no fabrication: use ONLY the specific facts in the grounding; for any specific fact ' +
  'the section needs but the grounding does not contain (a client, metric, date, dollar figure, certification, or ' +
  'person), write a visible [PLACEHOLDER: what the firm must provide] rather than inventing it. Return STRICT JSON ' +
  '{"html":"<the section, allowed tags only, starting with an <h3> heading>","gaps":[{"question":"...","suggestions":["..."]}]} ' +
  'where gaps lists each specific fact you placeholdered. Allowed tags: h3, h4, p, ul, ol, li, strong, em, table, ' +
  'thead, tbody, tr, th, td, blockquote, br. No attributes, no links, no images, no <script>, no <style>.';

/** PURE: assemble the {system, user} prompt for drafting one section against its grounding + doc-type template. */
export function buildSectionDraftPrompt(input: SectionDraftInput): { system: string; user: string } {
  const section = input?.section ?? { heading: '', requirementIds: [] };
  const refLine = sectionReferenceLine(section.requirementIds);
  const budget = typeof section.pageBudget === 'number' && section.pageBudget > 0 ? section.pageBudget : null;
  const user = [
    `Document: "${String(input?.docTitle ?? '').trim() || input?.docKey || 'Proposal document'}"`,
    `Section to draft: "${String(section.heading ?? '').trim() || 'Section'}"`,
    `Document-type guidance: ${docTypeTemplate(input?.docKey ?? '')}`,
    refLine ? `Open the section body with this line verbatim: ${refLine}` : '',
    section.plan ? `Section plan (hot button → feature → benefit → proof → discriminator): ${section.plan}` : '',
    budget ? `Target length: about ${budget} page(s); do not pad past what the requirements need.` : '',
    '',
    'GROUNDING — the ONLY specific facts you may assert:',
    groundingToPromptText(input?.grounding ?? ({} as Grounding)),
  ]
    .filter((l) => l !== '')
    .join('\n');
  return { system: SECTION_SYSTEM, user };
}

/**
 * PURE: turn the AI's structured `gaps` ({question, suggestions}) into deduped, typed fact `HumanNeed`s — the same
 * shape `parsePlaceholderNeeds` produces, so the write path persists them identically. Deduped by the fact key;
 * `suggestions` become the need's `options`; `usedIn` records the document/section each gap came from.
 */
export function gapsToNeeds(
  gaps: Array<{ question?: unknown; suggestions?: unknown }> | null | undefined,
  docKey: string,
  opts?: { sectionKey?: string },
): ParsedPlaceholder[] {
  const byKey = new Map<string, ParsedPlaceholder>();
  for (const g of Array.isArray(gaps) ? gaps : []) {
    const ask = String(g?.question ?? '').trim();
    if (!ask) continue;
    const needKey = needKeyForFact(ask);
    const suggestions = Array.isArray(g?.suggestions) ? (g!.suggestions as unknown[]).map((s) => String(s).trim()).filter(Boolean) : [];
    const existing = byKey.get(needKey);
    if (existing) {
      if (opts?.sectionKey && !existing.need.usedIn.some((u) => u.docKey === docKey && u.sectionKey === opts.sectionKey)) {
        existing.need.usedIn.push({ docKey, sectionKey: opts.sectionKey });
      }
      for (const s of suggestions) if (!(existing.need.options ?? []).includes(s)) existing.need.options = [...(existing.need.options ?? []), s];
    } else {
      const need: HumanNeed = {
        kind: 'fact',
        key: needKey,
        ask,
        why: 'The draft raised this as a fact it could not fill from grounded sources, so it left a placeholder instead of inventing one. The section cannot pass until it is answered.',
        usedIn: docKey ? [{ docKey, sectionKey: opts?.sectionKey }] : [],
        format: 'a short, factual answer (the agent writes it into the section)',
        ...(suggestions.length ? { options: suggestions } : {}),
        blocking: 'fatal',
      };
      byKey.set(needKey, { ask, needKey, need });
    }
  }
  return [...byKey.values()];
}

export interface SectionDraftResult {
  html: string;
  gaps: Array<{ question: string; suggestions: string[] }>;
  cached: boolean;
  generatedAt: string;
  error?: string;
}

interface CacheEntry { value: SectionDraftResult; at: number; }
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 100;
const cache = new Map<string, CacheEntry>();
const hash = (o: unknown): string => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');

/** Draft one section as sanitized HTML + structured gaps. FAIL SOFT; never throws (no key / empty / upstream → error). */
export async function draftProposalSectionAI(input: SectionDraftInput): Promise<SectionDraftResult> {
  const now = () => new Date().toISOString();
  if (!process.env.OPENAI_API_KEY) return { html: '', gaps: [], cached: false, generatedAt: now(), error: 'AI drafting is unavailable (no API key configured).' };
  if (!input?.section?.heading && !(input?.section?.requirementIds || []).length) {
    return { html: '', gaps: [], cached: false, generatedAt: now(), error: 'This section has nothing to draft from yet.' };
  }
  const { system, user } = buildSectionDraftPrompt(input);
  const key = 'sectiondraft:' + hash({ s: system, u: user });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= TTL_MS) return { ...hit.value, cached: true };

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_proposal_section_draft' }, { timeout: 120000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.3, max_tokens: 2500, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    let parsed: any = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    const html = sanitizeProposalHtml(parsed?.html);
    if (!html) return { html: '', gaps: [], cached: false, generatedAt: now(), error: 'The AI returned no usable section content.' };
    const gaps = Array.isArray(parsed?.gaps)
      ? parsed.gaps.filter((g: any) => g && typeof g.question === 'string').map((g: any) => ({ question: String(g.question), suggestions: Array.isArray(g.suggestions) ? g.suggestions.map(String) : [] }))
      : [];
    const result: SectionDraftResult = { html, gaps, cached: false, generatedAt: now() };
    if (cache.size >= MAX_ENTRIES) { const f = cache.keys().next().value; if (f !== undefined) cache.delete(f); }
    cache.set(key, { value: result, at: Date.now() });
    return result;
  } catch (err) {
    console.error(JSON.stringify({ timestamp: now(), level: 'error', service: 'proposal-studio-section-draft', event: 'gov_proposal_section_draft', outcome: 'failure', error_class: (err as any)?.constructor?.name ?? 'Error', context: { message: (err as any)?.message, doc_key: input?.docKey } }));
    return { html: '', gaps: [], cached: false, generatedAt: now(), error: 'The AI section draft could not be generated right now.' };
  }
}

/** Test seam: clear the in-memory cache. */
export function __clearSectionDraftCache(): void { cache.clear(); }
