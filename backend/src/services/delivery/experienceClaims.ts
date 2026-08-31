import { evaluateClaim, summarizeLedger, type ClaimCandidate } from '../../modules/delivery/experienceLedger';

/**
 * experienceClaims — the first caller of Gate 11's Experience Ledger.
 *
 * `evaluateClaim` and `summarizeLedger` had no production callers because there was no
 * table: nothing could earn a claim, and nothing could read one back. Scenario A's whole
 * observable lives here.
 *
 * ## The caller does not get to say what the evidence proved
 *
 * `evidenceType` and `evidenceOutcome` are read **from the `delivery_evidence` row**, never
 * from the request. This is the same rule the quality gate follows for the same reason: a
 * caller that supplies its own evidence can substantiate anything it likes, and the ledger
 * would be recording claims about a world it was told existed rather than the one that
 * does.
 *
 * The caller chooses *which* evidence backs the claim. It does not get to describe it.
 *
 * ## Attendance is not achievement
 *
 * `builderDidTheWork` is required here, not optional. `evaluateClaim` rejects an explicit
 * `false`, but the field is optional on `ClaimCandidate`, so omitting it passes — which
 * would let a claim be earned because nobody said otherwise. That is the credit-for-
 * attendance §Gate 11 forbids, arriving through the one door the pure rule leaves open.
 */

export type ClaimRefusalReason =
  | 'no_such_evidence'
  | 'attestation_required'
  | 'not_earned';

export interface ClaimRefusal {
  ok: false;
  reason: ClaimRefusalReason;
  message: string;
  rejections?: Array<{ rule: string; detail: string }>;
}

export interface ClaimResult {
  ok: true;
  claimId: string;
  claimType: string;
  band: string;
  /** False when this claim had already been earned from the same evidence. */
  created: boolean;
}

/**
 * Earn one claim from one piece of recorded evidence.
 *
 * Idempotent on `(builder, claimType, evidence)`: replaying a claim is not a second
 * achievement. Without that, a single passing test run could be claimed repeatedly and the
 * ledger would inflate on replay alone.
 */
export async function claimFromEvidence(input: {
  builderIdentityId: string;
  claimType: string;
  evidenceId: string;
  /** A person's attestation that this builder did this work. Required. */
  builderDidTheWork: boolean;
  humanConfirmed?: boolean;
  attestedByIdentityId?: string | null;
  models: any;
}): Promise<ClaimResult | ClaimRefusal> {
  const { models } = input;

  if (typeof input.builderDidTheWork !== 'boolean') {
    return {
      ok: false,
      reason: 'attestation_required',
      message:
        'A claim requires an explicit statement of whether the builder did this work. ' +
        'Master plan §Gate 11: no credit solely for attendance.',
    };
  }

  const evidence = await models.DeliveryEvidence.findOne({ where: { id: input.evidenceId } });
  if (!evidence) {
    return { ok: false, reason: 'no_such_evidence', message: 'No such evidence row.' };
  }

  const candidate: ClaimCandidate = {
    claimType: input.claimType,
    // From the row. Not from the caller.
    evidenceType: evidence.evidence_type,
    evidenceOutcome: evidence.outcome,
    humanConfirmed: input.humanConfirmed === true,
    builderDidTheWork: input.builderDidTheWork,
  };

  const verdict = evaluateClaim(candidate);
  if (!verdict.earned) {
    // Nothing is written, and the reasons come back. A builder told "not yet" without being
    // told what is missing learns nothing, and a ledger that cannot explain a refusal gets
    // argued with rather than trusted.
    return {
      ok: false,
      reason: 'not_earned',
      message: 'This claim is not earned by that evidence.',
      rejections: verdict.rejections,
    };
  }

  const existing = await models.DeliveryExperienceClaim.findOne({
    where: {
      builder_identity_id: input.builderIdentityId,
      claim_type: verdict.claimType,
      evidence_id: input.evidenceId,
    },
  });
  if (existing) {
    return {
      ok: true,
      claimId: existing.id,
      claimType: existing.claim_type,
      band: existing.band,
      created: false,
    };
  }

  const row = await models.DeliveryExperienceClaim.create({
    builder_identity_id: input.builderIdentityId,
    delivery_project_id: evidence.delivery_project_id,
    evidence_id: input.evidenceId,
    claim_type: verdict.claimType,
    band: verdict.band,
    evidence_type: evidence.evidence_type,
    evidence_outcome: evidence.outcome,
    human_confirmed: input.humanConfirmed === true,
    builder_did_the_work: input.builderDidTheWork,
    attested_by_identity_id: input.attestedByIdentityId ?? null,
  });

  return { ok: true, claimId: row.id, claimType: row.claim_type, band: row.band, created: true };
}

/** A builder's ledger, summarised by Gate 11's own rules. */
export async function ledgerFor(input: {
  builderIdentityId: string;
  models: any;
}): Promise<ReturnType<typeof summarizeLedger> & { claims: Array<Record<string, unknown>> }> {
  const rows = await input.models.DeliveryExperienceClaim.findAll({
    where: { builder_identity_id: input.builderIdentityId },
  });

  // Every stored row was earned when it was written, so it is replayed through the same
  // rules rather than counted. If a rubric tightens, the summary reflects the rules as they
  // are now instead of quietly standing on a verdict from an older version of them.
  const candidates: ClaimCandidate[] = rows.map((r: any) => ({
    claimType: r.claim_type,
    evidenceType: r.evidence_type,
    evidenceOutcome: r.evidence_outcome,
    humanConfirmed: r.human_confirmed,
    builderDidTheWork: r.builder_did_the_work,
  }));

  return {
    ...summarizeLedger(candidates),
    claims: rows.map((r: any) => ({
      id: r.id,
      claimType: r.claim_type,
      band: r.band,
      evidenceId: r.evidence_id,
      evidenceType: r.evidence_type,
      builderDidTheWork: r.builder_did_the_work,
      humanConfirmed: r.human_confirmed,
      earnedAt: r.created_at,
    })),
  };
}
