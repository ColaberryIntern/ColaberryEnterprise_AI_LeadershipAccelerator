/**
 * Case Study OS — Story Studio types.
 *
 * A SEPARATE MODULE FROM `caseStudy.ts`, AND THE SEPARATION IS THE POINT.
 * `caseStudy.ts` types the canonical record and the snapshot content — the
 * things a reader takes as true. This file types the Studio's *scaffolding*:
 * the editorial direction a human gives, the drafts an AI proposes, and the
 * three assets (quote, chart, repo proof) that `STORY_ASSET_MODEL.md` found
 * absent. Nothing here is a claim until something in `caseStudy.ts` carries it.
 *
 * LEAF MODULE: type-only imports from `./caseStudy` and `./caseStudyProvenance`,
 * nothing else.
 */

import type {
  CaseStudyBuiltByType, CaseStudyVerificationClass, IsoDateTime,
} from './caseStudy';

/* ──────────────────────────────────────────── the status vocabulary ──── */

/**
 * THE FIVE WORDS. Every element the Studio renders carries exactly one, and the
 * UI is required to show it, because the whole failure this module exists to
 * prevent is AI-written narrative and verified fact reading identically.
 *
 * They are not a ladder and they are not a score. They answer one question —
 * "what would I be asserting if I published this?" — and `needs_evidence` is
 * deliberately NOT between `generated` and `verified`: it is a different axis,
 * reached from either.
 */
export type StoryElementStatus =
  | 'generated'
  | 'needs_evidence'
  | 'verified'
  | 'human_approved'
  | 'hidden';

export const STORY_ELEMENT_STATUSES = [
  'generated', 'needs_evidence', 'verified', 'human_approved', 'hidden',
] as const;

/**
 * What each word licenses. Read by the UI to pick its treatment and by
 * `caseStudyStoryElementStatus.ts` to answer "may this reach a public page?".
 *
 * `publishable` is the load-bearing column. `generated` is false, and that is
 * the quarantine expressed as data: an AI-drafted value is not one approval
 * away from a page, it is not on the page at all until its status changes.
 */
export interface StoryElementStatusMeta {
  readonly status: StoryElementStatus;
  readonly label: string;
  /** May an element in this status be projected to a public surface? */
  readonly publishable: boolean;
  /** One sentence, shown to the operator. Never a euphemism. */
  readonly meaning: string;
}

export const STORY_ELEMENT_STATUS_META: Readonly<
  Record<StoryElementStatus, StoryElementStatusMeta>
> = {
  generated: {
    status: 'generated',
    label: 'Generated',
    publishable: false,
    meaning: 'Written by AI. Nobody has checked it. It cannot reach a public page in this state.',
  },
  needs_evidence: {
    status: 'needs_evidence',
    label: 'Needs Evidence',
    publishable: false,
    meaning: 'It asserts something no evidence in this record supports yet.',
  },
  verified: {
    status: 'verified',
    label: 'Verified',
    publishable: true,
    meaning: 'Backed by an evidence record or an approved metric, not by an opinion.',
  },
  human_approved: {
    status: 'human_approved',
    label: 'Human Approved',
    publishable: true,
    meaning: 'A named human wrote or accepted this and is accountable for it.',
  },
  hidden: {
    status: 'hidden',
    label: 'Hidden',
    publishable: false,
    meaning: 'Deliberately withheld from every surface. Not deleted, not published.',
  },
};

/** The single predicate. Nothing may re-derive this from the word itself. */
export const isPublishableStatus = (status: StoryElementStatus): boolean =>
  STORY_ELEMENT_STATUS_META[status].publishable;

/* ─────────────────────────────────────────────────────── storyline ──── */

/**
 * The human's answer to "what is the story?".
 *
 * IT IS EDITORIAL DIRECTION AND IT IS NEVER A FACT. It exists to aim the draft
 * generator and to tell the next reviewer what this record was *for*. It is a
 * prompt, not a source.
 *
 * TWO STRUCTURAL GUARANTEES, NOT TWO POLICIES:
 *
 * 1. It is stored in `case_study_storylines`, NOT in `case_studies` and NOT in
 *    `case_study_snapshots.content`. The public projection
 *    (`caseStudyPublicProjection.ts`) reads only from snapshot content plus a
 *    typed allowlist, so there is no expression in that file that could reach
 *    this row. A storyline cannot be published by mistake because there is no
 *    code path from here to a page.
 * 2. The publish gate's claim scan (`collectNarrative`) walks snapshot content.
 *    A storyline is not in snapshot content, so it is never scanned — and that
 *    is correct rather than a gap: scanning it would report the operator's own
 *    planning note as an unbacked public claim.
 *
 * The one thing that must never happen is a storyline being copied into
 * `content` verbatim. `caseStudyStoryDraftGenerator.ts` is the only module that
 * reads it, and it is proved by test never to emit it as a draft value.
 */
export interface CaseStudyStoryline {
  readonly caseStudyId: string;
  /** Free prose. Direction, audience, angle — whatever aims the draft. */
  readonly text: string;
  /** Who wrote the direction. Not who verified anything. */
  readonly authoredBy: string;
  readonly updatedAt: IsoDateTime;
}

/* ─────────────────────────────────────────────────── the AI drafts ──── */

/** Where a proposed value stands. `proposed` is the quarantine. */
export type CaseStudyAiDraftStatus = 'proposed' | 'promoted' | 'rejected';

/**
 * ONE AI PROPOSAL FOR ONE FIELD.
 *
 * The row is the quarantine. An AI draft is written HERE, against a dotted
 * snapshot path, and it stays here. `caseStudyAiDraftStore.promoteDraft` is the
 * only way its value moves into snapshot content, that function requires a
 * human actor, and it writes through the existing `applyHumanOverride` — so the
 * value arrives in `content` carrying tier `human_override` and the NAME OF THE
 * HUMAN, never the model's.
 *
 * That is deliberate and it is the opposite of laundering. The human is not
 * inheriting the AI's credibility; the AI never had any. The human is taking
 * responsibility for a sentence, which is exactly what `human_override` has
 * always meant, and `generatedBy` below keeps the machine's part of the record
 * visible forever.
 */
export interface CaseStudyAiDraft {
  readonly id: string;
  readonly caseStudyId: string;
  /** The dotted snapshot path this value is proposed FOR. Never written by AI. */
  readonly path: string;
  /** The proposed text. Quarantined until a human promotes it. */
  readonly value: string;
  readonly status: CaseStudyAiDraftStatus;
  /** Model identifier, or `deterministic` for the rule-based generator. */
  readonly generatedBy: string;
  /** Why the generator thinks this path needs a value. Shown to the reviewer. */
  readonly rationale: string;
  readonly createdAt: IsoDateTime;
  /** The human who promoted or rejected it. Null while still proposed. */
  readonly decidedBy: string | null;
  readonly decidedAt: IsoDateTime | null;
}

/**
 * What a generator is allowed to hand back. No id, no status, no actor — the
 * store assigns all three, so a generator cannot propose its own promotion.
 */
export interface CaseStudyAiDraftProposal {
  readonly path: string;
  readonly value: string;
  readonly rationale: string;
}

/* ────────────────────────────────────────────────────────── quotes ──── */

/**
 * A quote, as a discriminated union on consent — the `CaseStudyContributor`
 * shape, for the reason that type states: naming somebody requires
 * `consentRecordedAt`, so "named without consent" has no shape to occupy.
 *
 * THIS IS THE HIGHEST-RISK ASSET IN THE SYSTEM. `frontend/src/config/v2Proof.ts`
 * names the remediation "Case studies containing invented client quotations" —
 * this repository actually shipped them. So:
 *
 * - AI may never write `text`. `caseStudyStoryDraftGenerator.ts` refuses the
 *   `quote` forbidden class before it reaches a model, and the publish gate
 *   refuses `ai_draft` provenance at any quote-classified path independently.
 * - A quote with no recorded consent is not publishable, and there is no field
 *   combination that expresses "named, no consent".
 * - If no approved quote exists, the block does not render. It is never filled.
 */
export type CaseStudyQuoteAttribution =
  | {
      readonly displayMode: 'named';
      readonly displayName: string;
      readonly role: string;
      readonly kind: CaseStudyBuiltByType;
      readonly consentRecordedAt: IsoDateTime;
    }
  | {
      readonly displayMode: 'role_only';
      readonly role: string;
      readonly kind: CaseStudyBuiltByType;
    }
  | {
      readonly displayMode: 'anonymous';
      readonly kind: CaseStudyBuiltByType;
    };

/** How the words were obtained. Mirrors `CaseStudyEvidenceSourceType`'s intent. */
export type CaseStudyQuoteSource =
  | 'client_confirmation'
  | 'recorded_interview'
  | 'written_statement'
  | 'public_statement';

export const CASE_STUDY_QUOTE_SOURCES = [
  'client_confirmation', 'recorded_interview', 'written_statement', 'public_statement',
] as const;

export interface CaseStudyQuote {
  readonly id: string;
  readonly caseStudyId: string;
  /** The words. Human-authored, always. */
  readonly text: string;
  readonly attribution: CaseStudyQuoteAttribution;
  readonly source: CaseStudyQuoteSource;
  /** Defaults `pending`, exactly as metrics and evidence do. */
  readonly verificationClass: CaseStudyVerificationClass;
  /** Defaults `false`. Public exposure is opt-in, never inherited. */
  readonly approved: boolean;
  readonly reviewedBy: string | null;
  readonly reviewedAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
}

/**
 * Does this quote carry a consent record adequate to publish it?
 *
 * A `named` quote needs `consentRecordedAt`; the union already requires it, so
 * this returns false only for a row that reached the database before the type
 * existed or through direct SQL. `role_only` and `anonymous` name nobody and
 * need no consent record — that is what those modes are FOR.
 */
export function quoteHasConsent(quote: CaseStudyQuote): boolean {
  const a = quote.attribution;
  if (a.displayMode !== 'named') return true;
  return typeof a.consentRecordedAt === 'string' && a.consentRecordedAt.length > 0;
}

/** Publishable = approved AND consented AND not a pending verification class. */
export function quoteIsPublishable(quote: CaseStudyQuote): boolean {
  return quote.approved
    && quoteHasConsent(quote)
    && quote.verificationClass !== 'pending';
}

/* ────────────────────────────────────────────────────────── charts ──── */

/**
 * Only what the pilot justifies. A bar over discrete metric keys and a
 * horizontal ranking of the same. Both render from `(label, value)` pairs the
 * metrics already carry.
 *
 * NO LINE, NO AREA, NO SCATTER. They interpolate, and this record's metrics are
 * discrete verified figures with no time series behind them —
 * `CaseStudyArchitecture.tsx` refuses to draw the node/edge list for the same
 * stated reason: "a chart drawn from that same list would have to invent a
 * layout the data does not contain."
 */
export type CaseStudyChartType = 'bar' | 'ranking';

export const CASE_STUDY_CHART_TYPES = ['bar', 'ranking'] as const;

/**
 * A chart specification.
 *
 * THERE IS NO `values` FIELD AND THERE IS NO `values` COLUMN. That is the whole
 * asset. A chart names `metricKeys`; the projection resolves each one through
 * `projectMetric`, which already returns `null` for anything not `publishable`
 * and verified. A chart therefore cannot display a number the measurement
 * section would refuse to display, because it is the same number resolved by
 * the same function.
 *
 * The guarantee is enforced four times, deliberately, at four layers that fail
 * independently: this type has no such field; the Zod schema is `.strict()` so
 * an extra key is a 400; the table has no such column so a write would throw;
 * and `caseStudyChartContract.test.ts` greps the DDL and the type for
 * `value`-bearing names. Three of those are compile- or request-time and one is
 * a test, so removing any single one still leaves the invariant standing.
 */
export interface CaseStudyChartSpec {
  readonly id: string;
  readonly caseStudyId: string;
  readonly chartType: CaseStudyChartType;
  readonly title: string;
  /** Optional prose under the chart. Claim-scanned like any other caption. */
  readonly caption: string | null;
  /**
   * `case_study_metrics.metric_key` values, in render order. The ONLY route to
   * a number. An empty list renders nothing rather than an empty axis.
   */
  readonly metricKeys: readonly string[];
  readonly approved: boolean;
  readonly createdAt: IsoDateTime;
}

/* ────────────────────────────────────────────────── the repo proof ──── */

/**
 * What analysing a repository established, and — the half that matters — what
 * it could not.
 *
 * `STORY_STUDIO_CURRENT_STATE.md` §7 confirms `analyzeRepository` takes
 * `{owner, repo}`, touches no database and carries no CaseStudy identity, so it
 * serves this unchanged. What it does NOT do is tell an operator the limits of
 * what it read, and an analyze step that lists twenty findings and no limits
 * reads as a completed investigation.
 *
 * `cannotProve` is therefore REQUIRED and non-empty by construction — every
 * builder of this type appends the four structural limits before returning. A
 * repository can never prove business outcome, client identity, production
 * usage, or that anybody other than its committers was involved.
 */
export interface CaseStudyRepoProof {
  readonly owner: string;
  readonly repo: string;
  /** Statements the repository's contents support. */
  readonly proves: readonly string[];
  /** Statements it structurally cannot support. Never empty. */
  readonly cannotProve: readonly string[];
  readonly technologies: readonly string[];
  readonly architectureSignals: readonly string[];
  /** ISO dates bounding what the repository shows, or null when unreadable. */
  readonly firstCommitAt: IsoDateTime | null;
  readonly lastCommitAt: IsoDateTime | null;
  /** Artifact candidates the analyzer noticed. Candidates, never approvals. */
  readonly candidateArtifacts: readonly string[];
  /** `ok`, or the analyzer's own error class. Never invented. */
  readonly accessStatus: string;
}

/**
 * The four limits every repository analysis carries, whatever it found.
 *
 * They are constants rather than derived because they are properties of what a
 * git repository IS, not of what this one contains. A repository with a
 * `TESTIMONIALS.md` still cannot prove a client said those words.
 */
export const REPO_STRUCTURAL_LIMITS: readonly string[] = [
  'Business outcome. A repository shows what was built, never what it was worth to anyone.',
  'Client or organisation identity. Nothing in a repository establishes who it was for, or that they consent to being named.',
  'Production usage. A deployment config proves an intent to deploy, not that anybody uses it.',
  'Who did the work. Commit authorship names accounts, not the people or the division of labour behind them.',
];
