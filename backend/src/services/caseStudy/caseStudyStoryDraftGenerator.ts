/**
 * Case Study OS — step 4 of the Studio: generate a story draft.
 *
 * WHAT THIS ACTUALLY IS TODAY, STATED PLAINLY SO NOBODY INFERS OTHERWISE:
 * a DETERMINISTIC generator behind a model-shaped seam. It composes proposals
 * from the repository proof and the human's storyline. No LLM is called; no
 * provider SDK is imported; `generatedBy` reports `deterministic` and that
 * string reaches the reviewer's screen.
 *
 * That is a deliberate choice, not an unfinished one. Every safety property
 * this feature needs — quarantine, forbidden-class screening, human-only
 * promotion, provenance — is a property of the STORE and the SEAM, not of the
 * engine. Building the governance against a deterministic engine first means
 * the governance is proved by tests that cannot flake, and dropping a model in
 * later changes one function and no rule. The seam is `DraftEngine`, mirroring
 * `fetchImpl` on the repo analyzer, which is this codebase's existing idiom for
 * exactly this.
 *
 * THE HARD RULE THIS FILE ENFORCES FIRST, BEFORE ANY ENGINE RUNS.
 *
 * AI may never invent: metrics, quotes, client names, business outcomes,
 * production claims, consent, verification. Those are the six classes
 * `classifyAiForbiddenPath` already names, and `PROPOSABLE_PATHS` below is an
 * ALLOWLIST rather than the inverse of that denylist. The difference matters: a
 * denylist admits every path nobody thought about, and the next section key
 * added to the snapshot would become AI-writable by default. An allowlist
 * admits nothing by default.
 *
 * `caseStudyAiDraftStore.proposeDrafts` re-screens with the denylist anyway.
 * Two independent gates in opposite directions; neither is load-bearing alone.
 *
 * THE STORYLINE IS READ AND NEVER EMITTED. It aims the draft — it tells the
 * generator what the human thinks the story is — and it never becomes a
 * proposed value, because it is direction rather than fact. Proved by mutation
 * in `caseStudyStoryDraftGenerator.test.ts`.
 */

import type { CaseStudyAiDraftProposal, CaseStudyRepoProof } from '../../types/caseStudyStory';
import { classifyAiForbiddenPath } from './caseStudyProvenance';

/**
 * THE ALLOWLIST. Every path an engine may propose into, and nothing else.
 *
 * Note what is absent and why: no `heroMetrics.*` or `measurement.*` (metrics
 * are verified figures, never drafted), no `identity.organizationDisplayName`
 * (a client name), no `identity.productionStatus` (a production claim), no
 * `contributors.*` (consent), and nothing matching `/quote|testimonial/`.
 *
 * `situation.narrative` and `architecture.narrative` ARE here because they are
 * descriptive prose about work that the repository proof independently
 * establishes — and because after promotion they land in `collectNarrative`'s
 * scanned surface, so a figure smuggled into one is caught by the claim scan.
 */
export const PROPOSABLE_PATHS: readonly string[] = [
  'identity.standfirst',
  'identity.summary',
  'situation.narrative[0]',
  'situation.narrative[1]',
  'architecture.narrative[0]',
  'architecture.narrative[1]',
];

export interface DraftEngineInput {
  readonly storyline: string | null;
  readonly proofs: readonly CaseStudyRepoProof[];
  readonly recordTitle: string;
  /** The paths this engine is permitted to propose into. Already filtered. */
  readonly allowedPaths: readonly string[];
}

/**
 * The seam. Injected in tests; production omits it and gets the deterministic
 * engine. A future model-backed engine implements this and inherits every rule
 * in this file without restating one of them.
 */
export type DraftEngine = (input: DraftEngineInput) => Promise<readonly CaseStudyAiDraftProposal[]>;

const sentence = (parts: readonly string[]): string =>
  parts.filter((p) => p && p.trim().length > 0).join(' ').replace(/\s+/g, ' ').trim();

/**
 * The deterministic engine.
 *
 * It writes descriptions of what was BUILT, drawn from `proof.proves`, and it
 * writes nothing about outcome, client or production, because those are exactly
 * the things the proof's `cannotProve` says a repository cannot establish. Its
 * whole design is "say only the things the analyzer actually read".
 *
 * It states no figure. There is no numeral in any template below, which is why
 * a promoted value cannot introduce an unbacked percentage and why
 * `ruleUnverifiedClaims` has nothing to catch here. That is a property worth
 * keeping if this file is ever edited.
 */
const deterministicEngine: DraftEngine = async (input) => {
  const proposals: CaseStudyAiDraftProposal[] = [];
  const allowed = new Set(input.allowedPaths);
  const proof = input.proofs[0] ?? null;
  const tech = proof ? proof.technologies.slice(0, 4) : [];
  const signals = proof ? proof.architectureSignals.slice(0, 3) : [];

  const push = (path: string, value: string, rationale: string): void => {
    if (!allowed.has(path)) return;
    if (value.trim().length === 0) return;
    proposals.push({ path, value, rationale });
  };

  if (tech.length > 0) {
    push(
      'identity.standfirst',
      sentence([
        `${input.recordTitle} is built in ${tech.slice(0, 3).join(', ')}.`,
      ]),
      'Composed from the languages and frameworks the repository analyzer read out of the '
        + 'dependency manifest and GitHub language counts. Names technologies only — no outcome, '
        + 'no client, no figure.',
    );
  }

  if (proof && proof.proves.length > 0) {
    push(
      'situation.narrative[0]',
      sentence([
        `This record covers work in ${proof.owner}/${proof.repo}.`,
        tech.length > 0 ? `The codebase is written in ${tech.slice(0, 2).join(' and ')}.` : '',
      ]),
      'States the repository under discussion and the technologies found in it. Deliberately '
        + 'says nothing about why the work was done, which the repository cannot establish.',
    );
  }

  if (signals.length > 0) {
    push(
      'architecture.narrative[0]',
      sentence([
        `The repository carries ${signals.join(', ')}.`,
      ]),
      'Lists architecture signals the analyzer detected as present configuration. Presence only '
        + '— it does not claim these run, pass, or are used.',
    );
  }

  if (tech.length > 3) {
    push(
      'architecture.narrative[1]',
      sentence([`Further dependencies detected include ${tech.slice(3).join(', ')}.`]),
      'The remainder of the detected dependency set, so the architecture section is not a '
        + 'truncated list presented as a complete one.',
    );
  }

  return proposals;
};

export interface GenerateStoryDraftInput {
  readonly recordTitle: string;
  /** Read to aim the draft. NEVER emitted as a proposed value. */
  readonly storyline: string | null;
  readonly proofs: readonly CaseStudyRepoProof[];
  /** Injected in tests. Production omits it and uses the deterministic engine. */
  readonly engine?: DraftEngine;
}

export interface GenerateStoryDraftResult {
  readonly proposals: readonly CaseStudyAiDraftProposal[];
  /** Engine output this module refused, with the reason. Never silent. */
  readonly refused: readonly { readonly path: string; readonly reason: string }[];
  readonly generatedBy: string;
}

/**
 * Generate proposals. RETURNS THEM — it does not store them and does not import
 * the draft store, so this function cannot put anything in a database and
 * certainly cannot put anything on a page.
 *
 * The post-filter is the half that matters. An engine is untrusted output, so
 * whatever it returns is checked against the allowlist AND the forbidden-class
 * denylist before this function will hand it back. A model that ignored its
 * instructions and proposed `identity.organizationDisplayName` is refused here,
 * refused again by the store, and refused a third time by the publish gate.
 */
export async function generateStoryDraft(
  input: GenerateStoryDraftInput,
): Promise<GenerateStoryDraftResult> {
  const engine = input.engine ?? deterministicEngine;
  const generatedBy = input.engine ? 'injected-engine' : 'deterministic';

  const raw = await engine({
    storyline: input.storyline,
    proofs: input.proofs,
    recordTitle: input.recordTitle,
    allowedPaths: PROPOSABLE_PATHS,
  });

  const proposals: CaseStudyAiDraftProposal[] = [];
  const refused: { path: string; reason: string }[] = [];

  for (const proposal of raw) {
    const path = String(proposal?.path ?? '').trim();
    if (!PROPOSABLE_PATHS.includes(path)) {
      refused.push({
        path: path || '(none)',
        reason: 'Not on the generator allowlist. AI may only propose into descriptive prose paths.',
      });
      continue;
    }
    const forbidden = classifyAiForbiddenPath(path);
    if (forbidden) {
      refused.push({
        path,
        reason: `Classified ${forbidden} — one of the six field classes no model may write.`,
      });
      continue;
    }
    // The storyline is direction. If an engine hands it back as a value it has
    // misunderstood its input, and promoting it would turn a planning note into
    // a published sentence.
    if (input.storyline && String(proposal.value ?? '').trim() === input.storyline.trim()) {
      refused.push({
        path,
        reason: 'The proposed value is the storyline verbatim. Editorial direction is not a fact '
          + 'and is never promoted into the record.',
      });
      continue;
    }
    proposals.push({
      path,
      value: String(proposal.value ?? '').trim(),
      rationale: String(proposal.rationale ?? '').trim(),
    });
  }

  return { proposals, refused, generatedBy };
}
