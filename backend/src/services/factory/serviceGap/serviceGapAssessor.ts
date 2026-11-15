/**
 * serviceGapAssessor - the ONE model call of the Gap Detector: a structured assessment of one case study against the
 * candidate services retrieval picked. Advisory only; `serviceGapValidate` decides what of it is allowed through.
 *
 * House pattern (same as caseStudyOutsideAnalysis / govCapabilityFit):
 *   - instrumented OpenAI client (redaction, cost, ai_events), 60 s timeout, ONE retry at the client, never unbounded;
 *   - the case-study text is fenced by `untrustedBlock`: a document saying "propose a new service" is data;
 *   - services are given as opaque refs (S1..Sn) so the answer can only point at services we sent;
 *   - FAIL SOFT: no key / upstream error / non-JSON returns `{ raw: null, errorClass }` and never throws.
 * Caching is not here: the analysis row in the database, keyed on both fingerprints + prompt version, is the cache.
 */
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { DEFAULT_MODEL } from '../../components/costEstimationService';
import { untrustedBlock } from '../govUntrustedText';
import type { CatalogService } from './serviceGapTypes';
import { GAP_PROMPT_VERSION } from './serviceGapTypes';

export type AssessErrorClass = 'NoApiKey' | 'UpstreamError' | 'MalformedOutput';
export interface AssessResult { raw: unknown | null; errorClass: AssessErrorClass | null; error: string | null; model: string }

export const SYSTEM_PROMPT =
  'You are a services-catalog analyst for an AI and data consulting firm. You decide whether ONE case study belongs to '
  + 'a service the firm already offers, or justifies a new one. Catalog bloat is a real cost: a synonym or a narrow '
  + 'vertical variant of an existing service is NOT a new service.\n'
  + 'Decisions:\n'
  + '- MATCH_EXISTING: an Active service\'s buyer outcome and deliverables genuinely cover this work.\n'
  + '- EXPAND_EXISTING: an Active service naturally covers it with a definitional improvement (state the exact change).\n'
  + '- LINK_GROWTH: a Growth (proposed, not yet proven) service already covers it.\n'
  + '- PROPOSE_NEW: a substantively different, repeatable buyer outcome that no service covers, with enough detail to define it.\n'
  + '- INSUFFICIENT_EVIDENCE: the text is too thin or ambiguous to decide. Prefer this to guessing.\n'
  + 'Judge the buyer problem and deliverables, not shared buzzwords. Classify maturity: research_concept (an idea or '
  + 'study), implemented_demo, internally_validated, client_deployed, or unknown. Never invent client outcomes, metrics, '
  + 'contract wins or production readiness. NAICS/PSC are suggestions only.\n'
  + 'Return strict JSON with exactly these keys: {"decision","verdict","targetRef","maturity","serviceFamily",'
  + '"candidates":[{"ref","capabilityOverlap","buyerProblemOverlap","deliverableOverlap","missingCapabilities","reason"}],'
  + '"capabilityNovelty","expansion":{"descriptionAddition","keywordsToAdd","scopeChange"},'
  + '"proposedService":{"name","category","buyerValue","scope","deliverables","targetBuyer","differentiators","keywords","naics","psc"},'
  + '"alternativesConsidered":[{"decision","whyNot"}],"missingInformation","evidence":[{"kind","text"}],"reasonCodes"}.\n'
  + 'verdict: one plain sentence (e.g. "Link to X.", "Expand X with predictive maintenance.", "Propose Y."). '
  + 'targetRef: the S-ref for MATCH/EXPAND/LINK_GROWTH, else null. candidates: your top 3 refs, overlaps 0-100. '
  + 'capabilityNovelty: 0-100, how different the capability is from every listed service. serviceFamily: a short '
  + 'canonical name for the capability family (so similar case studies group together). expansion: only for '
  + 'EXPAND_EXISTING, else null. proposedService: only for PROPOSE_NEW, else null; buyerValue is one sentence. '
  + 'evidence.kind: "document_claim" for what the text states, "inference" for your reasoning. '
  + 'Use only refs from the catalog list.';

/** The catalog block: opaque refs, our own data (not untrusted), descriptions clipped. */
export function catalogBlock(refs: Map<string, CatalogService & { retrievalScore: number }>): string {
  return Array.from(refs.entries()).map(([ref, s]) => [
    `${ref} | ${s.name} | status: ${s.status === 'growth' ? 'Growth (proposed, unproven)' : 'Active'} | category: ${s.category ?? 'none'} | confirmed case studies: ${s.confirmedProofCount}`,
    s.description ? `   description: ${s.description.replace(/\s+/g, ' ').slice(0, 400)}` : null,
    s.keywords.length ? `   keywords: ${s.keywords.slice(0, 15).join(', ')}` : null,
  ].filter(Boolean).join('\n')).join('\n');
}

function logFail(errorClass: AssessErrorClass, err: unknown, caseStudyId: string): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'service_gap_assess_failed',
    outcome: 'failure', error_class: errorClass,
    context: { case_study_id: caseStudyId, message: String((err as { message?: string })?.message ?? '').slice(0, 300) },
  }));
}

export async function assessCaseStudy(input: {
  caseStudyId: string; evidenceText: string; refs: Map<string, CatalogService & { retrievalScore: number }>;
}): Promise<AssessResult> {
  const model = DEFAULT_MODEL;
  if (!process.env.OPENAI_API_KEY) return { raw: null, errorClass: 'NoApiKey', error: 'AI analysis is unavailable (no API key configured).', model };
  const { rule, block } = untrustedBlock(input.evidenceText.slice(0, 12_000));
  let content = '';
  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'service_gap_detector', prompt_version: GAP_PROMPT_VERSION }, { timeout: 60_000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model, temperature: 0.1, max_tokens: 1800, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n${rule}` },
        { role: 'user', content: `Catalog (our services):\n${catalogBlock(input.refs)}\n\nCase study:\n${block}` },
      ],
    });
    content = res.choices?.[0]?.message?.content || '';
  } catch (err) {
    logFail('UpstreamError', err, input.caseStudyId);
    return { raw: null, errorClass: 'UpstreamError', error: 'The AI analysis could not be generated right now.', model };
  }
  try { return { raw: JSON.parse(content), errorClass: null, error: null, model }; } catch (err) {
    logFail('MalformedOutput', err, input.caseStudyId);
    return { raw: null, errorClass: 'MalformedOutput', error: 'The AI analysis returned an unreadable answer.', model };
  }
}
