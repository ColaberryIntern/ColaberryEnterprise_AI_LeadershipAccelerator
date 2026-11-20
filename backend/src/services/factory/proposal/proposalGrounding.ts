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

/** A human-approved past-performance reference. The client name is REAL and assertable (a human entered and approved it).
 *  `subject` is what the reference is ABOUT (reporting, recruiting, ...); the drafter may cite it only for a matching
 *  requirement, so a recruiting reference never surfaces in a reporting proposal. null/general = universally eligible. */
export interface GroundingReference { client: string; scope?: string | null; contractValue?: string | null; dates?: string | null; contact?: string | null; subject?: string | null }
/** A human-approved key person. Name and role are assertable; summary is a short plain-text résumé digest. */
export interface GroundingPersonnel { name: string; role?: string | null; summary?: string | null; subject?: string | null }
/** A confirmed, non-archived case study used as a proof point. ANONYMIZED by design — carries NO real client name. */
export interface GroundingCaseStudy { title: string; industry?: string | null; year?: number | null; capability?: string | null; metricLabel?: string | null; metricValue?: string | null; metricVerified?: boolean }

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
  /** Authoritative solicitation facts pulled from the RFP's OWN requirements (due date, submission method/email,
   *  agency). The agent MUST assert these directly and must NEVER insert a placeholder or raise a human need for them —
   *  they are stated in the solicitation, not something the operator has to supply. */
  solicitationFacts?: string[];
  /** Approved past-performance references (real, named clients the agent MAY cite). */
  references?: GroundingReference[];
  /** Approved key personnel the agent MAY name and describe. */
  personnel?: GroundingPersonnel[];
  /** Confirmed case studies as proof points — citable for approach/outcome, but ANONYMIZED (never a real client name). */
  caseStudies?: GroundingCaseStudy[];
  /** Retrieved excerpts from APPROVED uploaded source documents (P-SRC). Reference material the agent may paraphrase;
   *  hard specifics (figures, dates, named metrics) still require an approved fact or a [PLACEHOLDER]. */
  sourceExcerpts?: Array<{ documentName: string; text: string }>;
}

/** B1b: pick the RFP's OWN submission-administration statements (deadline, submission email, how/where to send) out of
 *  the full requirement set, so they can be grounded PROPOSAL-WIDE. These are administrative requirements that rarely
 *  belong to a single volume's requirementIds, so without this the per-document requirement grounding misses them and the
 *  drafter ends up raising a human need for the due date / submission email the solicitation already states — the exact
 *  "don't ask the due date, it's sitting right above it" awareness gap. Pure + deterministic: no I/O, order-preserving,
 *  de-duplicated, capped. */
const SUBMISSION_FACT_RE = /\b(no later than|deadline|due date|date and time|time and date|submit(?:ted|ting|s)?|submission|e-?mail|addressed to|delivered to|mailed to|proposals? (?:are|must|shall|should) be)\b/i;
export function selectSubmissionFacts(statements: string[], max = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(statements) ? statements : []) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s || seen.has(s)) continue;
    if (SUBMISSION_FACT_RE.test(s)) { seen.add(s); out.push(s); if (out.length >= max) break; }
  }
  return out;
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
  /** Optional so existing Grounding fixtures (built as literals) stay valid; buildGrounding always sets them to []. */
  solicitationFacts?: string[];
  references?: GroundingReference[];
  personnel?: GroundingPersonnel[];
  caseStudies?: GroundingCaseStudy[];
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
    solicitationFacts: Array.isArray(input?.solicitationFacts) ? input.solicitationFacts : [],
    references: Array.isArray(input?.references) ? input.references : [],
    personnel: Array.isArray(input?.personnel) ? input.personnel : [],
    caseStudies: Array.isArray(input?.caseStudies) ? input.caseStudies : [],
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
  const solicitationFacts = g.solicitationFacts ?? [];
  if (solicitationFacts.length) {
    lines.push('Solicitation facts (authoritative — stated in the RFP itself; assert these directly and NEVER insert a placeholder or raise a question for them, they are not something the operator must supply):');
    for (const s of solicitationFacts) lines.push(`- ${s}`);
  }
  if (g.facts.length) { lines.push('Approved company facts (the ONLY specific facts you may assert):'); for (const f of g.facts) lines.push(`- ${f}`); }
  else lines.push('No approved company facts are available — insert a [PLACEHOLDER: …] for any specific fact rather than inventing one.');
  const references = g.references ?? [];
  if (references.length) {
    const tagged = references.some((r) => r.subject && r.subject !== 'general');
    lines.push('Approved past-performance references (human-approved; you MAY name the client and cite these):'
      + (tagged ? ' Each is tagged with a SUBJECT in brackets. Cite a reference ONLY in a requirement whose topic matches that subject; never use a reference tagged for a different subject (a recruiting reference must not appear in a reporting section).' : ''));
    for (const r of references) {
      const subj = r.subject && r.subject !== 'general' ? ` [subject: ${r.subject}]` : '';
      const parts = [r.scope ? r.scope : null, r.contractValue ? `value ${r.contractValue}` : null, r.dates ? r.dates : null, r.contact ? `contact ${r.contact}` : null].filter(Boolean).join('; ');
      lines.push(`- ${r.client}${subj}${parts ? ` — ${parts}` : ''}`);
    }
  }
  const personnel = g.personnel ?? [];
  if (personnel.length) {
    lines.push('Approved key personnel (human-approved; you MAY name and describe them):');
    for (const p of personnel) lines.push(`- ${p.name}${p.role ? `, ${p.role}` : ''}${p.summary ? `: ${p.summary}` : ''}`);
  }
  const caseStudies = g.caseStudies ?? [];
  if (caseStudies.length) {
    lines.push('Case-study proof points (our own delivered work; you MAY cite the approach and outcome). These are ANONYMIZED — never assert or invent a real client name from a case study. State a metric marked (verified) as fact; attribute a metric marked (reported) as a reported result, not a guarantee:');
    for (const cs of caseStudies) {
      const head = [cs.industry, typeof cs.year === 'number' ? String(cs.year) : null].filter(Boolean).join(', ');
      const metric = cs.metricLabel ? ` — ${cs.metricLabel}: ${cs.metricValue ?? 'n/a'} (${cs.metricVerified ? 'verified' : 'reported'})` : '';
      lines.push(`- ${cs.title}${head ? ` (${head})` : ''}${cs.capability ? ` [${cs.capability}]` : ''}${metric}`);
    }
  }
  const excerpts = g.sourceExcerpts ?? [];
  if (excerpts.length) {
    lines.push('Source excerpts (reference material from uploaded project documents. You MAY paraphrase these, naming the document, but any specific figure, date, dollar, or named metric still requires an approved company fact above or a [PLACEHOLDER]. Never assert a hard specific from an excerpt alone):');
    for (const e of excerpts) lines.push(`- [${e.documentName}] ${e.text}`);
  }
  return lines.join('\n');
}

/**
 * Flatten the grounding's CITABLE proof into compact backing lines for the proof judge. This is the SAME approved
 * facts, past-performance references, key personnel and (anonymized) case studies the drafter may cite in
 * groundingToPromptText — so the judge marks a claim "backed" against exactly the proof we actually hold, instead of
 * being handed "(no backing provided)" and failing every claim. Pure. Mirrors the drafter's guardrails: case studies
 * stay anonymized (the shape carries no client name) and keep the (verified)/(reported) metric label. Source excerpts
 * are deliberately NOT backing — an excerpt cannot assert a hard specific, so it cannot substantiate a claim.
 */
export function groundingToBackingRefs(g: Grounding): string[] {
  const out: string[] = [];
  for (const f of g.facts ?? []) out.push(f);
  for (const r of g.references ?? []) {
    const parts = [r.scope ? r.scope : null, r.contractValue ? `value ${r.contractValue}` : null, r.dates ? r.dates : null].filter(Boolean).join('; ');
    out.push(`Past-performance reference: ${r.client}${parts ? ` - ${parts}` : ''}`);
  }
  for (const cs of g.caseStudies ?? []) {
    const head = [cs.industry, typeof cs.year === 'number' ? String(cs.year) : null].filter(Boolean).join(', ');
    const metric = cs.metricLabel ? `, ${cs.metricLabel}: ${cs.metricValue ?? 'n/a'} (${cs.metricVerified ? 'verified' : 'reported'})` : '';
    out.push(`Case study (anonymized): ${cs.title}${head ? ` (${head})` : ''}${cs.capability ? ` [${cs.capability}]` : ''}${metric}`);
  }
  for (const p of g.personnel ?? []) out.push(`Key personnel: ${p.name}${p.role ? `, ${p.role}` : ''}${p.summary ? `: ${p.summary}` : ''}`);
  return out;
}
