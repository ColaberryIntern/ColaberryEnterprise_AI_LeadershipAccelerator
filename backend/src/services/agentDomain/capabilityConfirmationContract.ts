/**
 * capabilityConfirmationContract — what makes it true that a human confirmed a capability.
 *
 * AF11.0. Ali's ruling, 4 Nov 2026: **a Super Admin confirms a capability.** That settles WHO.
 * AF6.3 asked three questions and the ruling answered one, so the other two are decided here and
 * the reasoning is written down rather than left in a commit message:
 *
 *  - **What evidence?** A full `EvidenceRecord` from `promotionCriteria.ts`, and it may not be one
 *    of the non-promoting signals. Reused rather than paralleled, because that file already
 *    learned this lesson the hard way: its own header records a verifier promoting a capability
 *    whose only signal was `elapsed_time`. A confirmation resting on "time passed" is precisely
 *    the fabricated approval `assertDraftOnlyInvariant` exists to catch.
 *  - **Per capability, or per capability and agent?** PER CAPABILITY. A requirement is confirmed
 *    as a requirement: "this is a real thing we want" is a statement about the capability, not
 *    about which employee happens to perform it. Scoping it per agent would mean the same
 *    requirement could be simultaneously real for one agent and not real for another, which is
 *    not a thing a person can mean. The decision is also the reversible one: adding an agent
 *    column later is additive, while removing one would strand rows.
 *
 * ## This file cannot confirm anything
 *
 * It is pure. It takes a proposed confirmation and the rosters, and returns either a refusal list
 * or an accepted record. Writing it down is the caller's job, granting anything on the strength of
 * it is AF3.5's and AF11.4's, and neither is reachable from here.
 *
 * ## Why the refusals are constants rather than sentences at the call site
 *
 * Every refusal a Super Admin can receive is enumerated in one file, so a test can assert the
 * whole vocabulary and a reader can see the complete list without grepping. A sentence written
 * where it is thrown is a sentence no test can find. Same shape, same reason, as
 * `toolRequestContract.ts`.
 */

import {
  isNonPromotingEvidence,
  recordEvidence,
  type EvidenceRecord,
} from './promotionCriteria';

export interface ConfirmationIssue {
  readonly rule: ConfirmationRefusal;
  readonly detail: string;
}

export type ConfirmationRefusal =
  /** No capability carries that id, so there is nothing to confirm. */
  | 'capability_unknown'
  /** The capability's record is already `rejected`; reversing that is not a confirmation. */
  | 'capability_rejected'
  /** A confirmation for this capability is already recorded. */
  | 'already_confirmed'
  /** The confirmer resolves to nobody we hold a record for. */
  | 'confirmer_not_recorded'
  /** The roster came back empty, which is its own refusal and never a pass. */
  | 'human_roster_absent'
  /** The confirmer is a machine identity, by name. */
  | 'confirmer_is_non_human'
  /** Ali's ruling: only a Super Admin may move a capability out of draft. */
  | 'confirmer_not_super_admin'
  /** No evidence was offered at all. */
  | 'evidence_missing'
  /** Evidence was offered but is not a complete record. */
  | 'evidence_incomplete'
  /** The evidence is one of the signals that can never support a promotion. */
  | 'evidence_does_not_support_confirmation';

/**
 * Machine identities that must never read as a person.
 *
 * `system:auto_approve_timeout` is the real production timer and `unknown` is what
 * `approvalRequestController` writes when it cannot resolve anybody. Both are named here, because
 * `isNonHumanIdentity('unknown')` returns FALSE and so the denylist alone cannot catch it. The
 * positive roster check below is the real defence; this is the second one.
 */
export const NON_HUMAN_CONFIRMERS: ReadonlyArray<string> = Object.freeze([
  'system:auto_approve_timeout',
  'auto-approval',
  'unknown',
  'system',
]);

/**
 * True when the evidence itself came from, or was judged by, a machine.
 *
 * Deliberately separate from `isNonPromotingEvidence`, which matches the four signal NAMES and
 * therefore cannot see a machine identity sitting in `source` or `evaluated_by` on a record whose
 * `kind` looks like a person did the work.
 */
function evidenceCameFromAMachine(e: EvidenceRecord): boolean {
  const fields = [e.source, e.evaluated_by].map((f) => String(f ?? '').trim().toLowerCase());
  return NON_HUMAN_CONFIRMERS.some((m) => fields.includes(m));
}

export interface ProposedConfirmation {
  readonly capability_id?: string | null;
  /** The email of the person confirming. Resolved by the caller, never taken from a payload. */
  readonly confirmed_by?: string | null;
  readonly evidence?: Partial<EvidenceRecord> | null;
}

export interface ConfirmedCapability {
  readonly capability_id: string;
  readonly confirmed_by_identity: string;
  readonly evidence: EvidenceRecord;
}

export interface GateConfirmationArgs {
  readonly proposed: ProposedConfirmation;
  /** Every capability id the registry knows. Empty is a refusal, not a pass. */
  readonly knownCapabilityIds: ReadonlyArray<string>;
  /** Capability ids whose record is `rejected`. A rejection is not reversed by confirming. */
  readonly rejectedCapabilityIds?: ReadonlyArray<string>;
  /** Capability ids already confirmed. */
  readonly alreadyConfirmedIds?: ReadonlyArray<string>;
  /**
   * The confirmer's email IF they resolve to a person we hold a record for, from
   * `resolveRecordedHumans`. Empty means either "not a person" or "the roster could not be read",
   * and the two are told apart by `rosterReadable`.
   */
  readonly recordedHumans: ReadonlyArray<string>;
  /**
   * False when the roster lookup itself failed. An unreadable roster must refuse rather than
   * wave everybody through, which is the fail-open shape this subtree keeps finding.
   */
  readonly rosterReadable?: boolean;
  /** Ali's ruling. True only for a platform super admin. */
  readonly confirmerIsSuperAdmin: boolean;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Judge a proposed confirmation. Returns EVERY reason it is refused, not just the first.
 *
 * All of them, because a Super Admin fixing one field at a time across four round trips is how a
 * confirmation gets abandoned half-made, and a half-made confirmation is the state this whole
 * ticket exists to make impossible.
 */
export function gateCapabilityConfirmation(args: GateConfirmationArgs): ConfirmationIssue[] {
  const issues: ConfirmationIssue[] = [];
  const { proposed } = args;

  const capabilityId = text(proposed.capability_id);
  if (!capabilityId || !args.knownCapabilityIds.includes(capabilityId)) {
    issues.push({
      rule: 'capability_unknown',
      detail: capabilityId
        ? `No capability carries the id "${capabilityId}".`
        : 'A confirmation must name the capability it is about.',
    });
  } else {
    if ((args.rejectedCapabilityIds ?? []).includes(capabilityId)) {
      issues.push({
        rule: 'capability_rejected',
        detail: `"${capabilityId}" is recorded as rejected. Reversing that is a separate decision, `
          + 'not a confirmation.',
      });
    }
    if ((args.alreadyConfirmedIds ?? []).includes(capabilityId)) {
      issues.push({
        rule: 'already_confirmed',
        detail: `"${capabilityId}" already carries a recorded confirmation.`,
      });
    }
  }

  // WHO. The roster is a positive lookup; the denylist is the second check, not the first.
  const confirmer = text(proposed.confirmed_by).toLowerCase();
  if (args.rosterReadable === false) {
    issues.push({
      rule: 'human_roster_absent',
      detail: 'The record of who is a real person could not be read, so nobody can be confirmed '
        + 'as having done this. Refusing rather than assuming.',
    });
  } else if (args.recordedHumans.length === 0) {
    issues.push({
      rule: 'human_roster_absent',
      detail: 'No recorded humans were supplied, which is a refusal in its own right and never a '
        + 'pass.',
    });
  } else if (!confirmer || !args.recordedHumans.map((h) => h.toLowerCase()).includes(confirmer)) {
    issues.push({
      rule: 'confirmer_not_recorded',
      detail: confirmer
        ? `"${proposed.confirmed_by}" does not resolve to anybody we hold a record for.`
        : 'A confirmation must name the human who made it.',
    });
  }

  if (confirmer && NON_HUMAN_CONFIRMERS.includes(confirmer)) {
    issues.push({
      rule: 'confirmer_is_non_human',
      detail: `"${proposed.confirmed_by}" is a machine identity. A capability is confirmed by a `
        + 'person or not at all.',
    });
  }

  if (!args.confirmerIsSuperAdmin) {
    issues.push({
      rule: 'confirmer_not_super_admin',
      detail: 'Only a Super Admin may move a capability out of draft. Owner ruling, 4 Nov 2026.',
    });
  }

  // WHAT EVIDENCE. Shape first, then whether it can support anything.
  if (!proposed.evidence) {
    issues.push({
      rule: 'evidence_missing',
      detail: 'A confirmation must point at the evidence it rests on. A date and a state prove '
        + 'nothing about whether anybody looked.',
    });
  } else {
    const evidence = recordEvidence(proposed.evidence);
    if (!evidence) {
      issues.push({
        rule: 'evidence_incomplete',
        detail: 'Evidence needs all of: kind, source, observed_at and evaluated_by.',
      });
    } else if (isNonPromotingEvidence(evidence)) {
      issues.push({
        rule: 'evidence_does_not_support_confirmation',
        detail: `Evidence of kind "${evidence.kind}" from "${evidence.source}" cannot support a `
          + 'confirmation. Time passing, a story being closed, a pleasant conversation and a '
          + 'mocked test are the four things that look like evidence and are not.',
      });
    } else if (evidenceCameFromAMachine(evidence)) {
      // A SECOND, SEPARATE HOLE, found by a test of this file that assumed the first check
      // covered it. `isNonPromotingEvidence` matches the four signal NAMES, so
      // `{ kind: 'manager_review_completed', source: 'system:auto_approve_timeout' }` sails
      // through it: nothing in that record contains `elapsed_time`.
      //
      // The machine-identity denylist above is applied to the CONFIRMER and was not applied to
      // the evidence, so a Super Admin could confirm a capability while pointing at something a
      // timer produced and evaluated. The person would be real, the evidence would be complete,
      // and nobody would have looked at anything.
      issues.push({
        rule: 'evidence_does_not_support_confirmation',
        detail: `That evidence was produced or evaluated by "${evidence.source}" / `
          + `"${evidence.evaluated_by}", which is a machine identity. A confirmation may rest on `
          + 'what a person observed, not on what a timer emitted.',
      });
    }
  }

  return issues;
}

export type AcceptedConfirmation =
  | { readonly ok: true; readonly confirmation: ConfirmedCapability }
  | { readonly ok: false; readonly issues: ConfirmationIssue[] };

/**
 * Gate, then build the record. Never partially: a refusal returns no confirmation at all.
 */
export function acceptCapabilityConfirmation(args: GateConfirmationArgs): AcceptedConfirmation {
  const issues = gateCapabilityConfirmation(args);
  if (issues.length > 0) return { ok: false, issues };

  // Everything below is non-null because the gate above refused each absence by name.
  const evidence = recordEvidence(args.proposed.evidence as Partial<EvidenceRecord>) as EvidenceRecord;
  return {
    ok: true,
    confirmation: {
      capability_id: text(args.proposed.capability_id),
      confirmed_by_identity: text(args.proposed.confirmed_by),
      evidence,
    },
  };
}
