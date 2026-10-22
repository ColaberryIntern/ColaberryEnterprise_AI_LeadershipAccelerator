/**
 * govRequirementExtractAI — the FLAGGED, advisory AI comprehension pass over a solicitation. The regex extractor
 * captures obligation sentences; this reads the solicitation TEXT and proposes requirements a regex misses (implied
 * obligations, scattered conditions, "the offeror must…" phrased unusually). Every AI candidate is then run through
 * the PURE verifyQuotes rail — kept ONLY if its quote literally exists in the source — and merged AFTER the
 * deterministic rows. So: flag OFF -> zero AI, deterministic output unchanged; flag ON -> a SUPERSET that can only
 * ADD quote-verified rows, never remove or renumber a deterministic one.
 *
 * Mirrors the gov AI fail-soft convention (govCapabilityFit / govProposalDraftAI): no-key early return, JSON.parse
 * with a `{}` default, an outer try/catch that logs and returns an error object. It NEVER throws. Reuses the
 * instrumented client (telemetry + cost) and the central DEFAULT_MODEL (overridable via GOV_EXTRACT_MODEL).
 */
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { DEFAULT_MODEL } from '../../components/costEstimationService';
import { FLAGS } from '../../../config/featureFlags';
import { verifyQuotes, type AiRequirementCandidate } from './verifyQuotes';
import { mergeCandidates } from './mergeCandidates';
import type { ProposalExtraction, ExtractedRequirement } from './proposalExtractor';

const MAX_DOCS = 6;                 // solicitation-class files sent to the model
const MAX_CHARS_PER_DOC = 120_000;  // ~30k tokens/doc ceiling (gpt-4o-mini is 128k context); keeps a call bounded
const MAX_CANDIDATES = 120;

function logFail(event: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'gov-requirement-extract', event,
    outcome: 'failure', error_class: (err as Error)?.constructor?.name ?? 'Error', message: (err as Error)?.message,
  }));
}

const clampStr = (v: unknown, n: number): string => (typeof v === 'string' ? v.slice(0, n) : '');

/**
 * PURE + TOTAL: coerce the model's JSON into clean AI candidates, dropping any without BOTH a statement and a quote
 * (verifyQuotes will then drop any quote that is not literally in the source). Never throws; garbage -> [].
 */
export function sanitizeAiCandidates(raw: unknown): AiRequirementCandidate[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: AiRequirementCandidate[] = [];
  for (const r of arr) {
    if (out.length >= MAX_CANDIDATES) break;
    const statement = clampStr((r as any)?.statement, 500).trim();
    const quote = clampStr((r as any)?.quote, 1000).trim();
    const document = clampStr((r as any)?.document, 300).trim();
    if (!statement || !quote) continue; // both required; the quote is what the rail verifies
    out.push({
      statement, quote, document,
      category: clampStr((r as any)?.category, 40) || undefined,
      eliminationRisk: (r as any)?.eliminationRisk === true || undefined,
    });
  }
  return out;
}

const SYSTEM = [
  'You extract REQUIREMENTS a bidder must address from a government solicitation. For each requirement return a',
  'plain-language "statement" AND a "quote" that is a VERBATIM, contiguous span copied EXACTLY from the provided',
  'text (same words, same order), plus the "document" name it came from. Quote at least 25 characters. NEVER',
  'invent, paraphrase, summarize, or combine text in the quote — if you cannot find a literal supporting span,',
  'omit the requirement. Prefer obligations a simple keyword search would miss (implied conditions, elimination',
  'rules, submittal items). Mark "eliminationRisk": true only when the text says non-compliance leads to',
  'rejection / non-responsive / disqualification. Return JSON: {"requirements":[{"statement","quote","document",',
  '"category","eliminationRisk"}]}. Return {"requirements":[]} if the text supports none.',
].join(' ');

/**
 * Call the model over the solicitation text and return RAW (unverified) candidates. Fail-soft: no key / error /
 * bad JSON -> { candidates: [], error }. The caller (applyAiComprehension) verifies and merges.
 */
export async function govRequirementExtractAI(
  perFile: Array<{ name: string; text: string }>,
): Promise<{ candidates: AiRequirementCandidate[]; error?: string }> {
  if (!process.env.OPENAI_API_KEY) return { candidates: [], error: 'AI extraction unavailable (no API key configured).' };
  const docs = (Array.isArray(perFile) ? perFile : []).filter((f) => f && typeof f.text === 'string' && f.text.trim()).slice(0, MAX_DOCS);
  if (docs.length === 0) return { candidates: [] };
  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_requirement_extract' }, { timeout: 120_000, maxRetries: 1 });
    const model = process.env.GOV_EXTRACT_MODEL || DEFAULT_MODEL;
    const user = docs.map((d) => `=== ${d.name} ===\n${d.text.slice(0, MAX_CHARS_PER_DOC)}`).join('\n\n');
    const res = await client.chat.completions.create({
      model, temperature: 0, max_tokens: 4000, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    });
    let parsed: { requirements?: unknown } = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    return { candidates: sanitizeAiCandidates(parsed.requirements) };
  } catch (err) {
    logFail('gov_requirement_extract', err);
    return { candidates: [], error: 'The AI requirement extraction could not be generated right now.' };
  }
}

export interface AiComprehensionMeta {
  mode: 'deterministic' | 'deterministic+ai';
  model: string | null;
  aiKept: number;
  aiDropped: number;
  aiError: string | null;
}

/**
 * The route seam. Keeps extractProposal PURE: run the AI pass HERE, over the solicitation-class files' text (from
 * the deterministic extraction's context blocks + roles), and merge. Flag-gated and fail-soft: off / no key / any
 * error -> the deterministic requirements unchanged. NEVER throws.
 */
export async function applyAiComprehension(
  extraction: ProposalExtraction,
): Promise<{ requirements: ExtractedRequirement[]; aiMeta: AiComprehensionMeta }> {
  const deterministic = extraction.requirements || [];
  const off: AiComprehensionMeta = { mode: 'deterministic', model: null, aiKept: 0, aiDropped: 0, aiError: null };
  if (!FLAGS.govAiExtraction || !process.env.OPENAI_API_KEY) return { requirements: deterministic, aiMeta: off };
  try {
    // Only the solicitation / addendum / reference text — never the W-9 or a form (those are one submit item).
    const names = new Set((extraction.files || []).filter((f) => f.role === 'solicitation' || f.role === 'addendum' || f.role === 'reference').map((f) => f.name));
    const perFile = (extraction.blocks || [])
      .filter((b) => b.kind === 'context' && names.has(b.locator))
      .map((b) => ({ name: b.locator, text: b.text }));
    const { candidates, error } = await govRequirementExtractAI(perFile);
    const { kept, dropped } = verifyQuotes(candidates, perFile);
    const merged = mergeCandidates(deterministic, kept);
    return {
      requirements: merged,
      aiMeta: {
        mode: 'deterministic+ai', model: process.env.GOV_EXTRACT_MODEL || DEFAULT_MODEL,
        aiKept: merged.length - deterministic.length, aiDropped: dropped.length, aiError: error ?? null,
      },
    };
  } catch (err) {
    logFail('gov_apply_ai_comprehension', err);
    return { requirements: deterministic, aiMeta: { ...off, aiError: 'AI comprehension failed; showing the deterministic requirements.' } };
  }
}
