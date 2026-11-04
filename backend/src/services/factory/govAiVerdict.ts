/**
 * govAiVerdict: the deterministic rails around the AI go/no-go. The model recommends; this PURE module decides what
 * that recommendation may do. Pursue needs the model's pursue AND coverage of at least 50%. Pass needs the model's pass
 * AND evidence: a quote found in the requirement text, or computed coverage under 25%. Anything else is inconclusive,
 * which stays visible as "Needs your read" and is never hidden. Coverage alone never hides a bid.
 * No IO; total; never throws.
 */
import { MIN_QUOTE_LEN, normalizeForMatch } from './proposal/verifyQuotes';
import type { GovAiVerdict } from '../../models/GovAiVetting';

export const PURSUE_MIN_COVERAGE = 50;
export const PASS_MAX_COVERAGE = 25;

export interface GoNoGoRecommendation { verdict?: unknown; reason?: unknown; quote?: unknown }
export interface VerdictInput {
  ai: GoNoGoRecommendation | null | undefined;
  capabilities: ReadonlyArray<{ assessment?: unknown }> | null | undefined;
  catalogSize: number;
  requirementTexts: readonly string[];
}
export interface VerdictResult { verdict: GovAiVerdict; reason: string; quote: string | null; coveragePct: number | null }

/** Percent of assessed capabilities we have at least partly. null when nothing was assessed (not the same as 0%). */
export function coverageOf(capabilities: VerdictInput['capabilities']): number | null {
  const caps = Array.isArray(capabilities) ? capabilities : [];
  if (caps.length === 0) return null;
  const covered = caps.filter((c) => c && (c.assessment === 'have' || c.assessment === 'partial')).length;
  return Math.round((covered / caps.length) * 100);
}

function verifiedQuote(quote: unknown, requirementTexts: readonly string[]): string | null {
  if (typeof quote !== 'string') return null;
  const norm = normalizeForMatch(quote);
  if (norm.length < MIN_QUOTE_LEN) return null;
  return requirementTexts.some((t) => normalizeForMatch(t).includes(norm)) ? quote.trim() : null;
}

export function decideVerdict(input: VerdictInput): VerdictResult {
  const coveragePct = coverageOf(input.capabilities);
  const aiReason = typeof input.ai?.reason === 'string' ? input.ai.reason.trim().slice(0, 1000) : '';
  const inconclusive = (reason: string): VerdictResult => ({ verdict: 'inconclusive', reason, quote: null, coveragePct });

  if (input.requirementTexts.length === 0) return inconclusive('No requirements could be read from the ZIP.');
  if (input.catalogSize <= 0) return inconclusive('Our Services has no active services to compare against.');
  if (coveragePct === null) return inconclusive('No capabilities could be assessed from these requirements.');

  const quote = verifiedQuote(input.ai?.quote, input.requirementTexts);
  if (input.ai?.verdict === 'pursue') {
    if (coveragePct >= PURSUE_MIN_COVERAGE) return { verdict: 'pursue', reason: aiReason || 'The AI recommends pursuing this bid.', quote, coveragePct };
    return inconclusive(`The AI leans pursue, but we cover only ${coveragePct}% of the capabilities it needs.`);
  }
  if (input.ai?.verdict === 'pass') {
    if (quote) return { verdict: 'pass', reason: aiReason || 'The AI recommends passing on this bid.', quote, coveragePct };
    if (coveragePct < PASS_MAX_COVERAGE) {
      return { verdict: 'pass', reason: aiReason || `We cover only ${coveragePct}% of the capabilities this bid needs.`, quote: null, coveragePct };
    }
    return inconclusive(`The AI leans pass, but could not cite the solicitation. ${aiReason}`.trim());
  }
  return inconclusive('The AI did not return a usable recommendation.');
}
