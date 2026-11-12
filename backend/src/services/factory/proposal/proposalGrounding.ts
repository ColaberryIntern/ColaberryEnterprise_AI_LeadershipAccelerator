/**
 * proposalGrounding — the PURE grounding builder for the Proposal Studio agent (P5). It assembles EXACTLY the facts
 * the drafter/reviser is allowed to use and NOTHING else: the blueprint (weights, rules, section order, page budget),
 * the document's requirements and sections with their section plans (hot button → feature → benefit → proof →
 * discriminator), the inserted build artifacts with captions, and the APPROVED company-library facts. Anything not in
 * the grounding is not a fact the agent may assert — a missing fact becomes a typed question (a gap), never an invention.
 *
 * No I/O, never throws. The reviser and the grounded draft both take the output of `buildGrounding`.
 */
import type { ProposalBlueprint, BlueprintRule } from './proposalBlueprintTypes';

export interface GroundingInput {
  blueprint?: ProposalBlueprint | null;
  document: {
    title: string;
    requirements: Array<{ canonicalReqId: string; statement: string }>;
    sections: Array<{ sectionKey: string; heading: string; plan?: string; contentHtml?: string }>;
  };
  /** Inserted build-artifact captions (the proof the agent may cite). */
  artifacts?: Array<{ caption: string | null; requirementIds: string[] }>;
  /** Approved company-library facts as "key: value" strings. */
  approvedFacts?: string[];
  /** Retrieved excerpts from APPROVED uploaded source documents (P-SRC). Reference material the agent may paraphrase;
   *  hard specifics (figures, dates, named metrics) still require an approved fact or a [PLACEHOLDER]. */
  sourceExcerpts?: Array<{ documentName: string; text: string }>;
}

export interface Grounding {
  title: string;
  scoringFactors: Array<{ label: string; points?: number; percent?: number }>;
  rules: BlueprintRule[];
  pageBudget: number | null;
  requirements: Array<{ canonicalReqId: string; statement: string }>;
  sections: Array<{ heading: string; plan: string | null }>;
  artifacts: string[];
  facts: string[];
  /** Optional so existing Grounding fixtures (built as literals) stay valid; buildGrounding always sets it to []. */
  sourceExcerpts?: Array<{ documentName: string; text: string }>;
}

/** Build the grounding from only the allowed inputs. Pure + total. */
export function buildGrounding(input: GroundingInput): Grounding {
  const bp = input?.blueprint ?? null;
  const pageLimitRule = bp?.rules?.find((r) => r.key === 'page_limit');
  const pageBudget = pageLimitRule ? Number.parseInt(pageLimitRule.value, 10) : NaN;
  return {
    title: input?.document?.title ?? '',
    scoringFactors: bp?.scoring?.factors ?? [],
    rules: Array.isArray(bp?.rules) ? bp!.rules : [],
    pageBudget: Number.isFinite(pageBudget) ? pageBudget : null,
    requirements: Array.isArray(input?.document?.requirements) ? input.document.requirements : [],
    sections: (Array.isArray(input?.document?.sections) ? input.document.sections : []).map((s) => ({ heading: s.heading, plan: s.plan ?? null })),
    artifacts: (Array.isArray(input?.artifacts) ? input.artifacts : []).map((a) => `${a.caption ?? 'Build screenshot'} (proves ${(a.requirementIds || []).join(', ') || 'requirements'})`),
    facts: Array.isArray(input?.approvedFacts) ? input.approvedFacts : [],
    sourceExcerpts: Array.isArray(input?.sourceExcerpts) ? input.sourceExcerpts : [],
  };
}

/** Render the grounding to a compact prompt block the model is told is its ONLY source of specific facts. Pure. */
export function groundingToPromptText(g: Grounding): string {
  const lines: string[] = [];
  if (g.scoringFactors.length) lines.push('Scored on: ' + g.scoringFactors.map((f) => `${f.label}${typeof f.points === 'number' ? ` (${f.points} pts)` : typeof f.percent === 'number' ? ` (${f.percent}%)` : ''}`).join(', ') + '.');
  if (g.pageBudget) lines.push(`Page budget: ${g.pageBudget} pages.`);
  if (g.rules.length) lines.push('Submission rules: ' + g.rules.map((r) => `${r.key}=${r.value}`).join('; ') + '.');
  if (g.requirements.length) { lines.push('Requirements to cover:'); for (const r of g.requirements) lines.push(`- [${r.canonicalReqId}] ${r.statement}`); }
  if (g.sections.some((s) => s.plan)) { lines.push('Section plans (hot button → feature → benefit → proof → discriminator):'); for (const s of g.sections) if (s.plan) lines.push(`- ${s.heading}: ${s.plan}`); }
  if (g.artifacts.length) { lines.push('Build evidence you may cite:'); for (const a of g.artifacts) lines.push(`- ${a}`); }
  if (g.facts.length) { lines.push('Approved company facts (the ONLY specific facts you may assert):'); for (const f of g.facts) lines.push(`- ${f}`); }
  else lines.push('No approved company facts are available — insert a [PLACEHOLDER: …] for any specific fact rather than inventing one.');
  const excerpts = g.sourceExcerpts ?? [];
  if (excerpts.length) {
    lines.push('Source excerpts (reference material from uploaded project documents. You MAY paraphrase these, naming the document, but any specific figure, date, dollar, or named metric still requires an approved company fact above or a [PLACEHOLDER]. Never assert a hard specific from an excerpt alone):');
    for (const e of excerpts) lines.push(`- [${e.documentName}] ${e.text}`);
  }
  return lines.join('\n');
}
