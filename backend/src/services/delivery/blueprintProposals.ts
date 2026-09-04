/**
 * blueprintProposals — the parts of a blueprint that are ours, not theirs.
 *
 * `buildBlueprint.ts` derives everything the customer actually said. What is left is the
 * half we owe them: what we would build, which agents, what architecture, what the first
 * release should be, and the Trust Before Intelligence picture. Those sections are marked
 * `needs_generation` there. This fills them.
 *
 * ## The one rule that makes this safe to show anyone
 *
 * A generated entry can NEVER be a FACT, and can never carry a quote.
 *
 * It is our proposal. Nobody has agreed to it, nobody said it, and the moment a proposal
 * appears next to the customer's own words wearing the same formatting, the blueprint has
 * quietly told them they asked for something they never mentioned. §16's rule survives into
 * this layer or it does not survive at all - and here it is easy to break, because a good
 * proposal SOUNDS like a conclusion.
 *
 * So generated entries are classified RECOMMENDATION, and the validator drops anything that
 * claims otherwise rather than downgrading it. A model that returns a FACT here has
 * misunderstood its job badly enough that the rest of that entry is not worth trusting.
 *
 * ## §19's trust states, and the maturity claim we must not make
 *
 * The plan is explicit: for pre-build state, use
 *
 *     Required | Planned | Needs decision | Not yet measurable
 *
 * and "do not assign fake operational GOALS maturity". Before a line of code exists there
 * is nothing to be mature ABOUT, and a maturity score on an unbuilt system is a number
 * invented to look rigorous. The four states above are honest because each one describes a
 * decision or its absence, not an achievement.
 *
 * That constraint is enforced here, not requested in the prompt: a trust entry without one
 * of the four states is dropped, and a state on any other section is dropped too.
 */

import { z } from 'zod';
import { chatJson } from '../runtime/runtimeAi';
import { DIMENSION_LABELS, type ProjectUnderstanding } from './projectUnderstanding';
import { BLUEPRINT_SECTIONS, type BuildBlueprint } from './buildBlueprint';

/** §19's four pre-build states, verbatim. */
export const TRUST_STATES = ['Required', 'Planned', 'Needs decision', 'Not yet measurable'] as const;
export type TrustState = (typeof TRUST_STATES)[number];

/** Section keys that must be proposed rather than derived. */
export const PROPOSAL_SECTION_KEYS = BLUEPRINT_SECTIONS.filter((s) => s.kind === 'proposed').map((s) => s.key);

export interface ProposalEntry {
  section: string;
  value: string;
  /** Why we are suggesting it. Optional, but it is what makes a proposal reviewable. */
  rationale?: string;
  /** §19 only. Required on trust_blueprint entries, forbidden everywhere else. */
  trust_state?: TrustState;
}

export interface RejectedProposal {
  reason: string;
  raw: unknown;
}

export type ProposalResult =
  | { ok: true; entries: ProposalEntry[]; rejected: RejectedProposal[]; runtime_ms: number; cost_usd: number }
  | { ok: false; error_class: 'EmptyModelResponse' | 'ContractViolation'; error: string };

const proposalSchema = z.object({
  section: z.string().trim().min(1),
  value: z.string().trim().min(1),
  rationale: z.string().trim().min(1).optional(),
  classification: z.string().optional(),
  source_quote: z.string().optional(),
  trust_state: z.string().optional(),
});

/**
 * Why a proposed entry cannot be used, or null if it can.
 *
 * Exported because the same rules apply wherever a proposal is authored - a PM adding a
 * suggestion in the project room must not be able to mint a FACT either.
 */
export function proposalViolation(raw: unknown): string | null {
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success) {
    // Name the section when the payload carries one. The first live run refused an entry
    // with "value: expected string, received object" and nothing else - true, and useless,
    // because it did not say WHICH section had silently produced nothing. It was the trust
    // blueprint, and the section simply stayed empty with no indication why.
    const section = (raw as any)?.section;
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return section ? `${section}: ${detail}` : detail;
  }

  const entry = parsed.data;

  if (!PROPOSAL_SECTION_KEYS.includes(entry.section)) {
    return `"${entry.section}" is not a section that gets proposed`;
  }

  // A proposal claiming to be a fact is the failure this module exists to prevent.
  if (entry.classification && entry.classification !== 'RECOMMENDATION') {
    return `a proposed entry cannot be classified ${entry.classification}`;
  }

  // Nothing here came from the customer, so nothing here may quote them.
  if (entry.source_quote) {
    return 'a proposed entry cannot carry a source_quote — nobody said it';
  }

  if (entry.section === 'trust_blueprint') {
    if (!entry.trust_state) return 'a trust blueprint entry needs one of §19’s four states';
    if (!TRUST_STATES.includes(entry.trust_state as TrustState)) {
      return `"${entry.trust_state}" is not one of §19’s states; maturity may not be claimed before the build exists`;
    }
  } else if (entry.trust_state) {
    return `trust_state belongs only on the trust blueprint, not on "${entry.section}"`;
  }

  return null;
}

/** Deterministic, so the instructions behind any proposal can be reconstructed. */
export function buildProposalPrompt(u: ProjectUnderstanding, blueprint: BuildBlueprint): string {
  const heard = blueprint.sections
    .filter((s) => s.kind !== 'proposed' && s.entries.length > 0)
    .map((s) => `${s.title}:\n${s.entries.map((e) => `  - ${e.value}`).join('\n')}`)
    .join('\n\n');

  const missing = blueprint.readiness.not_discussed;

  return [
    'You are proposing how to build software for a business you have just listened to.',
    '',
    'WHAT THEY TOLD US',
    heard || '(nothing was captured)',
    '',
    missing.length > 0
      ? `NEVER DISCUSSED, so do not pretend to know: ${missing.join(', ')}.`
      : '',
    '',
    'PROPOSE entries for these sections only:',
    ...PROPOSAL_SECTION_KEYS.map((k) => {
      const spec = BLUEPRINT_SECTIONS.find((s) => s.key === k)!;
      return `  ${k} - ${spec.title}`;
    }),
    '',
    'RETURN STRICT JSON: { "entries": [ { "section": "<key>", "value": "<one proposal>", "rationale": "<why, one sentence>" } ] }',
    '',
    'RULES THAT ARE CHECKED AND WILL DROP THE ENTRY:',
    '- Everything here is a RECOMMENDATION. Never state a proposal as a fact, and never attach a quote to one - nobody said it.',
    '- Do not propose an integration, system, or volume the customer never mentioned. Say what you would build, not what you imagine they have.',
    `- trust_blueprint entries MUST carry "trust_state" set to one of: ${TRUST_STATES.join(', ')}.`,
    '- Never assign a maturity level, score, or grade to anything. Nothing has been built yet, so there is nothing to be mature about.',
    '- trust_state belongs ONLY on trust_blueprint entries.',
    '',
    'THE TRUST BLUEPRINT NEEDS SEVERAL SEPARATE ENTRIES, one per concern, each a flat',
    'string with its own trust_state. Do not return one nested object covering all of them -',
    'it will be refused and the section will be empty. Cover: what AI may do, what still',
    'requires a human, what context the AI needs, what data it relies on, what must be',
    'observable, what needs to be explainable. For example:',
    '  { "section": "trust_blueprint", "value": "A person approves any job refusal before it is sent", "trust_state": "Required" }',
    '  { "section": "trust_blueprint", "value": "Report accuracy against the source sheet", "trust_state": "Not yet measurable" }',
    '',
    `Reference vocabulary for the dimensions you heard about: ${Object.values(DIMENSION_LABELS).slice(0, 8).join(', ')}.`,
    'Keep each value to one clear sentence. Fewer, better entries beat coverage.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export async function generateProposals(params: {
  understanding: ProjectUnderstanding;
  blueprint: BuildBlueprint;
  max_tokens?: number;
}): Promise<ProposalResult> {
  const system = buildProposalPrompt(params.understanding, params.blueprint);

  const { parsed, runtime_ms, cost_usd } = await chatJson(
    'blueprint-proposals',
    system,
    `Project: ${params.understanding.title}`,
    undefined,
    params.max_tokens ?? 3000,
  );

  if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
    return { ok: false, error_class: 'EmptyModelResponse', error: 'model returned nothing parseable as JSON' };
  }

  const rawEntries: unknown[] = Array.isArray((parsed as any).entries) ? (parsed as any).entries : [];
  const entries: ProposalEntry[] = [];
  const rejected: RejectedProposal[] = [];

  rawEntries.forEach((raw) => {
    const violation = proposalViolation(raw);
    if (violation) {
      rejected.push({ reason: violation, raw });
      return;
    }
    const e = raw as any;
    entries.push({
      section: e.section,
      value: String(e.value).trim(),
      ...(e.rationale ? { rationale: String(e.rationale).trim() } : {}),
      ...(e.trust_state ? { trust_state: e.trust_state as TrustState } : {}),
    });
  });

  if (entries.length === 0) {
    return {
      ok: false,
      error_class: 'ContractViolation',
      error:
        rejected.length > 0
          ? `every proposed entry was refused: ${rejected.map((r) => r.reason).join('; ')}`
          : 'model proposed nothing',
    };
  }

  return { ok: true, entries, rejected, runtime_ms, cost_usd };
}

/**
 * Fold proposals into a projected blueprint.
 *
 * Returns a NEW blueprint rather than mutating: the projection is derived from the
 * understanding and must stay reproducible from it, so the version with our proposals in it
 * is a separate object and the difference between the two is always visible.
 */
export function applyProposals(blueprint: BuildBlueprint, entries: ProposalEntry[]): BuildBlueprint {
  const bySection = new Map<string, ProposalEntry[]>();
  entries.forEach((e) => bySection.set(e.section, [...(bySection.get(e.section) || []), e]));

  const sections = blueprint.sections.map((s) => {
    const proposed = bySection.get(s.key);
    if (!proposed || s.kind !== 'proposed') return s;

    return {
      ...s,
      entries: proposed.map((p) => ({
        value: p.trust_state ? `[${p.trust_state}] ${p.value}` : p.value,
        classification: 'RECOMMENDATION' as const,
      })),
      needs_generation: false,
    };
  });

  return {
    ...blueprint,
    sections,
    readiness: {
      ...blueprint.readiness,
      sections_needing_generation: sections.filter((s) => s.needs_generation).length,
    },
  };
}
