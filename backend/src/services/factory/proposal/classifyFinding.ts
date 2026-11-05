import type { CheckFinding, FindingResolver, HumanNeed } from './proposalReviewTypes';

/**
 * classifyFinding — the pure rule that decides WHO resolves a check finding (the agent on its next pass, or a human
 * who must supply an input first), per the v3 operating model. For human findings it also produces the typed
 * `HumanNeed` (the exact ask, why, format, blocking) that reaches the Needs-you inbox. Deterministic and table-tested:
 * one test per row of the spec's classification table. The non-check needs (blueprint `needs_input`, unverified
 * stories, demo URL, Gold) are produced directly by the needs aggregator from their own sources, not here.
 */
export interface ClassifyContext {
  docKey?: string;
  sectionKey?: string;
  /** True when an artifact, reference, or approved fact exists that could back a claim (for proof findings). */
  evidenceAvailable?: boolean;
}

export interface Classification {
  resolver: FindingResolver;
  /** Present iff resolver === 'human'. */
  need?: HumanNeed;
  /** Present iff resolver === 'agent'. */
  fixHint?: string;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
const blockingOf = (f: CheckFinding): 'fatal' | 'score' => (f.severity === 'fatal' ? 'fatal' : 'score');
const usedIn = (ctx?: ClassifyContext): HumanNeed['usedIn'] => (ctx?.docKey ? [{ docKey: ctx.docKey, sectionKey: ctx.sectionKey ?? undefined }] : []);

function agentFixHint(f: CheckFinding): string {
  switch (f.check) {
    case 'coverage': return 'Add a section that answers this requirement.';
    case 'format': return 'Fix the format issue (trim to the page limit, add headings, set the file name, or move any price to the sealed cost file).';
    case 'evaluator': return 'Strengthen the draft against the Section M factor this check scores.';
    case 'clarity': return 'Rewrite for clarity and carry the win themes through.';
    default: return 'Revise on the next pass.';
  }
}

export function classifyFinding(f: CheckFinding, ctx?: ClassifyContext): Classification {
  const msg = f.message;

  // Missing required form / pricing file → a human must supply the file. (Fatal: nonresponsive without it.)
  const form = /required form not attached:\s*(.+?)\.?\s*$/i.exec(msg);
  if (f.check === 'format' && form) {
    const name = form[1].trim();
    return { resolver: 'human', need: { kind: 'file', key: `file:form:${norm(name)}`, ask: `Attach the required form: ${name}.`, why: 'The solicitation lists it as required; a missing required form makes the whole response nonresponsive.', usedIn: usedIn(ctx), format: 'PDF of the completed form', blocking: 'fatal' } };
  }

  // Missing required signature → a human must sign and upload. (Fatal.)
  const sig = /required signature missing:\s*(.+?)\.?\s*$/i.exec(msg);
  if (f.check === 'format' && sig) {
    const name = sig[1].trim();
    return { resolver: 'human', need: { kind: 'signature', key: `signature:${norm(name)}`, ask: `Provide the signed copy: ${name}.`, why: 'The form must be signed to be valid; an unsigned required form is nonresponsive.', usedIn: usedIn(ctx), format: 'PDF of the signed form', blocking: 'fatal' } };
  }

  // Placeholders / filler / open questions → human. The specific ask lives on each gap row (one need per gap),
  // so this summary finding is marked human without duplicating a need here.
  if (f.check === 'fact' && /\bplaceholder\b|\bfiller\b|open question/i.test(msg)) {
    return { resolver: 'human' };
  }

  // Unbacked claim. With evidence available the agent cites it; with none, a human must supply it or decide to drop.
  if (f.check === 'proof' && /no evidence|unbacked|provide evidence|needs proof/i.test(msg)) {
    if (ctx?.evidenceAvailable === false) {
      return { resolver: 'human', need: { kind: 'fact', key: `fact:evidence:${norm(msg)}`, ask: `Provide evidence for: ${msg}`, why: 'A claim with no artifact, reference, or approved fact behind it fails the Proof check and risks the bid.', usedIn: usedIn(ctx), format: 'a figure, a reference, or a one-line fact with its source', options: undefined, blocking: blockingOf(f) } };
    }
    return { resolver: 'agent', fixHint: 'Cite the existing artifact or approved fact that backs this claim.' };
  }

  // Everything else — coverage gaps, format/length/headings/file-name/price-leak, evaluator, clarity — the agent fixes.
  return { resolver: 'agent', fixHint: agentFixHint(f) };
}

/** Apply the classification onto a finding (fills resolver/need/fixHint), returning a new finding. Pure. */
export function withClassification(f: CheckFinding, ctx?: ClassifyContext): CheckFinding {
  const c = classifyFinding(f, ctx);
  return { ...f, resolver: c.resolver, need: c.need, fixHint: c.fixHint };
}
