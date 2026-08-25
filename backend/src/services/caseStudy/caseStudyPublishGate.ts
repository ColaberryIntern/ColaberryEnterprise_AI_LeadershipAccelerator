/**
 * caseStudyPublishGate — spec §15, as one pure function.
 *
 * This is the module the whole Case Study OS is built to protect. Everything
 * upstream of it is editorial: a sync proposes, a builder normalises, a human
 * reviews. Nothing before this point makes a claim in public. This does.
 *
 * IT FAILS CLOSED. Every rule asks "is this demonstrably safe to show?" and
 * blocks on any answer other than yes — INCLUDING the answer "no data". Absent
 * consent is not consent. `visibility: 'unknown'` is not `public`. A provenance
 * map that cannot account for a quotation is not an attribution. There is no
 * default-allow branch, no override argument and no "force" flag anywhere in
 * this file or its two rule siblings: a gate with an override is a suggestion.
 *
 * IT RETURNS EVERY BLOCKER AT ONCE. Not the first one. An admin who fixes a
 * record one round-trip at a time is being served badly, so `evaluate…` runs
 * every rule unconditionally and returns the whole list, formatted into spec
 * §15's own shape by `formatCaseStudyPublishBlockers`:
 *
 *     Cannot publish:
 *     - headline metric "41% fewer stockouts" has no verified evidence
 *     - organization name is visible but naming consent is not approved
 *
 * Each line names the offending FIELD and its VALUE, never the rule that fired.
 * That is the house standard, stated in `docs/REPO_CONNECT_CONTRACT.md`: "there
 * is no generic 400 in this flow — every rejection carries an error_class and a
 * sentence saying what to do."
 *
 * IT IS THE SOLE AUTHORITY. `caseStudyReadinessService` scores COMPLETENESS and
 * says in its own header that it authorises nothing. Nothing here imports it,
 * reads it, or is reachable from it, and no branch below consults a score.
 *
 * A high-scoring record can still be refused, and the suite pins two distinct
 * shapes of that — stated precisely, because an earlier version of this comment
 * described a fixture that cannot exist:
 *
 *   · A record scoring **97** whose only fault is one pending publishable
 *     metric. It cannot score 100: `caseStudyReadinessRubric` awards 3 points
 *     for `evidence.no_pending_publishable`, so a pending metric caps it at 97
 *     by arithmetic.
 *   · A record scoring a genuine **100/100** carrying an unattributed quotation
 *     in an AI-drafted field. The rubric has no check for quote attribution, so
 *     the score is untouched while this gate refuses — which is the sharper
 *     demonstration of the doctrine: the two systems are not measuring the same
 *     thing at all, and the gap is exactly where the gate earns its keep.
 *
 * ── POSITION ON SELF-ATTESTED VERIFICATION ───────────────────────────────────
 * A metric carrying `verification.class: 'verified'` with
 * `verification.method: 'self'` IS REFUSED. Not discounted — refused.
 *
 * Reasoning. The public badge renders the CLASS (`Claim.tsx:25-30`), and the
 * word it renders is "Verified", which asserts that somebody other than the
 * claimant checked. A self-report is the claimant checking themselves.
 * `docs/architecture/case-study-os/PROOF_INTEGRATION.md` §4 rule 1 states this
 * as a rule of the proof model — "method: 'self' may never carry class:
 * 'verified'; a self-report is pending until something or someone else confirms
 * it" — and §9.2 restates it. So the pairing is not weak evidence, it is a
 * MISLABEL, and a gate that admitted a mislabel while blocking a missing
 * evidence pointer would be straining at a gnat.
 *
 * What self-attestation may still do: publish at a class that does not assert
 * third-party verification. `anonymized` and `illustrative` are both publishable
 * with `method: 'self'`, because `PublicCaseStudyMetric` carries
 * `verificationMethod` alongside the class and the surface renders
 * "Self-reported" beside it — the labelled case, and exactly what the method
 * axis was added for (PROOF_INTEGRATION §4: "class answers how much may be
 * shown, method answers who did the verifying"). `pending` stays unpublishable
 * for every method, by rule 3. A self-attested figure is also excluded from the
 * set that can BACK a claim in prose, in `caseStudyPublishClaimScan.ts`.
 *
 * This settles an inconsistency found while verifying T010:
 * `caseStudyReadinessRubric.ts:170` discounts a self-attested `verified` metric
 * to 7 of 9 on `outcome.proof_point` and to 3 of 6 on `evidence.verified_claim`
 * — two different discounts for one fact. Harmless there, because readiness is
 * advisory and a score is a description. Here there is ONE position and it is
 * binary, because a gate that graded proof on a curve would be a readiness score
 * wearing a gate's name.
 *
 * ── WHAT THIS CATCHES THAT PROVENANCE CANNOT ─────────────────────────────────
 * `caseStudyProvenance.ts` screens AI drafts BY FIELD CLASS and says in its own
 * header that an AI draft at a permitted path such as `identity.standfirst` can
 * still contain the sentence "cut costs 40%", because catching that would need a
 * content classifier. Rules 9 and 10 close that residue deterministically, over
 * a fixed narrative surface and a closed vocabulary — see
 * `caseStudyPublishClaimScan.ts`, which also states plainly what they do not
 * catch.
 *
 * FAILURE-FIRST. (1) On failure: nothing is left behind, because this file
 * writes nothing — a throw means the caller publishes nothing, which is the safe
 * direction. (2) Retry: none, and none is needed; the function is pure, so a
 * retry returns the same decision. Callers must not retry a refusal, because a
 * refusal is an answer, not an outage. (3) Recovery: the blockers ARE the
 * recovery path — each names a field, its value and the remedy that closes it.
 * (4) Handled: absent sections, null array members smuggled in from JSONB,
 * absent or unknown provenance, disagreement between the consent columns and the
 * snapshot, and a snapshot that does not exist. NOT handled: content large
 * enough to make the narrative walk slow (bounded upstream by the analyzer's
 * excerpt caps and the manifest reader's 64KB limit), and semantic falsehood in
 * prose that uses none of the scanned vocabulary — no deterministic rule reaches
 * that, and human snapshot approval is what stands in the gap.
 *
 * PURE. No clock, no randomness, no I/O, no database, no logging, no model
 * import. `caseStudyPublicationService.ts` owns all of those and calls this.
 */
import {
  Blockers,
  collectMetrics,
  rulePendingMetrics,
  ruleBuilderConsent,
  ruleOrganizationConsent,
  ruleProofMetadata,
  ruleRepositories,
  ruleSnapshot,
  ruleStatus,
  ruleSurface,
} from './caseStudyPublishRules';
import { ruleQuotes, ruleUnverifiedClaims } from './caseStudyPublishClaimScan';
import type {
  CaseStudyPublishBlocker,
  CaseStudyPublishBlockerCode,
  CaseStudyPublishDecision,
  CaseStudyPublishGateInput,
} from './caseStudyPublishRules';

/**
 * One import site for consumers and for the suite. The rules are separate FILES
 * for the line ceiling, not separate CONCEPTS, so a caller should never need to
 * know the gate is split.
 */
export {
  CASE_STUDY_PUBLISH_BLOCKER_CODES,
} from './caseStudyPublishRules';
export type {
  CaseStudyPublishBlocker,
  CaseStudyPublishBlockerCode,
  CaseStudyPublishDecision,
  CaseStudyPublishGateInput,
  CaseStudyPublishRecord,
  CaseStudyPublishSnapshot,
} from './caseStudyPublishRules';

/** Spec §15's block, verbatim in shape. Empty string when nothing is blocking. */
export function formatCaseStudyPublishBlockers(
  blockers: readonly CaseStudyPublishBlocker[],
): string {
  if (blockers.length === 0) return '';
  return ['Cannot publish:', ...blockers.map((x) => `- ${x.message}`)].join('\n');
}

/**
 * Decide whether one Case Study may be published to one surface.
 *
 * Pure, total, and the same answer every time for the same input. Runs every
 * rule, collects every blocker, and allows publication only when the list is
 * empty — `allowed` is a derived fact about that list, never a separate
 * judgement that could disagree with it.
 */
export function evaluateCaseStudyPublishGate(
  input: CaseStudyPublishGateInput,
): CaseStudyPublishDecision {
  const b = new Blockers();
  ruleSurface(input, b);
  ruleStatus(input.caseStudy, b);
  ruleSnapshot(input.snapshot, b);

  // The content rules need content. When no approved snapshot exists rule 2 has
  // already said so in one clear sentence; scanning an invented empty snapshot
  // would bury it under a second wave of blockers about fields nobody has
  // written yet, which is the "generic 400" failure in a longer form.
  if (input.snapshot && input.snapshot.content && typeof input.snapshot.content === 'object') {
    const content = input.snapshot.content;
    const metrics = collectMetrics(content);
    rulePendingMetrics(metrics, b);
    ruleOrganizationConsent(input.caseStudy, content, b);
    ruleBuilderConsent(input.caseStudy, content, b);
    ruleRepositories(content, b);
    ruleProofMetadata(metrics, content, b);
    ruleQuotes(input.snapshot, b);
    ruleUnverifiedClaims(content, metrics, b);
  } else if (input.snapshot) {
    b.add('snapshot_not_approved', 'case_study_snapshots.content',
      `snapshot version ${input.snapshot.version} carries no content object`,
      'rebuild the snapshot from the sync and re-approve it');
  }

  const blockers = b.all();
  const codes: CaseStudyPublishBlockerCode[] = [];
  for (const x of blockers) if (!codes.includes(x.code)) codes.push(x.code);

  return Object.freeze({
    allowed: blockers.length === 0,
    blockers,
    codes: Object.freeze(codes),
    summary: formatCaseStudyPublishBlockers(blockers),
  });
}
