import type { AcknowledgementState, RequirementKey } from '../../models/InternshipRequirementAcknowledgement';

/**
 * The activation and first-week checklist — the pure part.
 *
 * The contract's "After approval" list, in its order:
 *
 *   1. Download and manually sign offer letter
 *   2. Upload signed documents
 *   3. Wait for document verification
 *   4. Join orientation
 *   5. Confirm Claude Code account readiness
 *   6. Confirm API-key setup through a safe exercise without exposing the key
 *   7. Join internship communication/community areas
 *   8. Receive first project assignment
 *   9. Complete first-week check-in
 *
 * ── WHY THE STEPS DECLARE WHO COMPLETES THEM ───────────────────────────────
 *
 * Each step carries an `actor`. A student staring at "Wait for document
 * verification" needs to know that one is not theirs to do — a checklist that
 * shows nine identical unticked boxes makes someone feel behind on five things
 * they cannot act on. `blocking_activation` then separates "must happen before you
 * start" from "happens in your first week".
 *
 * ── AND WHY PROGRESS IS DERIVED, NEVER STORED ──────────────────────────────
 *
 * "Do not award progress merely for opening a card. Progress must reflect a
 * submitted or verified action." So every step's completion is computed from real
 * evidence — a verified document row, an acknowledgement row, a cohort membership,
 * a project assignment — rather than from a checkbox the student can tick.
 */

export type ChecklistActor = 'student' | 'colaberry';

export type ChecklistStepKey =
  | 'sign_offer_letter'
  | 'upload_signed_documents'
  | 'documents_verified'
  | 'membership_active'
  | 'orientation'
  | 'claude_code_ready'
  | 'api_key_setup_verified'
  | 'join_community'
  | 'first_project_assigned'
  | 'first_week_checkin';

export interface ChecklistStep {
  key: ChecklistStepKey;
  order: number;
  label: string;
  detail: string;
  actor: ChecklistActor;
  /** True when the intern cannot be activated until this is done. */
  blocking_activation: boolean;
}

export const CHECKLIST: readonly ChecklistStep[] = [
  {
    key: 'sign_offer_letter',
    order: 10,
    label: 'Download and sign your offer letter',
    detail: 'Print it, sign it by hand, and scan or photograph it. There is no click-to-sign.',
    actor: 'student',
    blocking_activation: true,
  },
  {
    key: 'upload_signed_documents',
    order: 20,
    label: 'Upload your signed documents',
    detail: 'A clear photo is fine. We will tell you if anything needs correcting.',
    actor: 'student',
    blocking_activation: true,
  },
  {
    key: 'documents_verified',
    order: 30,
    label: 'We check your documents',
    detail: 'A person reads them. Nothing for you to do here.',
    actor: 'colaberry',
    blocking_activation: true,
  },
  {
    key: 'membership_active',
    order: 40,
    label: 'Your membership is active',
    detail: 'The internship is included with membership — $149/month billed annually or $199 month to month. Waived if you already pay Colaberry.',
    actor: 'student',
    // The payment gate, as a visible checklist item rather than a surprise wall.
    blocking_activation: true,
  },
  {
    key: 'orientation',
    order: 50,
    label: 'Join orientation',
    detail: 'Your first meeting with the team. We will send the invitation.',
    actor: 'student',
    blocking_activation: false,
  },
  {
    key: 'claude_code_ready',
    order: 60,
    label: 'Confirm your Claude Code account',
    detail: 'Tell us it is set up. We never ask for the account password.',
    actor: 'student',
    blocking_activation: false,
  },
  {
    key: 'api_key_setup_verified',
    order: 70,
    label: 'Confirm your API key works',
    detail:
      'Run the setup exercise and tell us it succeeded. We check that it WORKS, not what it is — '
      + 'never paste your key anywhere on this platform.',
    actor: 'student',
    blocking_activation: false,
  },
  {
    key: 'join_community',
    order: 80,
    label: 'Join the internship channels',
    detail: 'Where stand-ups, questions and your manager live.',
    actor: 'student',
    blocking_activation: false,
  },
  {
    key: 'first_project_assigned',
    order: 90,
    label: 'Get your first project',
    detail: 'Your manager assigns it. Up to two active projects at a time.',
    actor: 'colaberry',
    blocking_activation: false,
  },
  {
    key: 'first_week_checkin',
    order: 100,
    label: 'Complete your first-week check-in',
    detail: 'A short reflection on how week one went and what you are committing to next.',
    actor: 'student',
    blocking_activation: false,
  },
];

/** The evidence needed to decide whether each step is done. */
export interface ChecklistEvidence {
  offer_letter_generated: boolean;
  signed_documents_uploaded: boolean;
  all_documents_verified: boolean;
  membership_ok: boolean;
  orientation_attended: boolean;
  acknowledgements: ReadonlyMap<RequirementKey, AcknowledgementState>;
  joined_community: boolean;
  active_project_count: number;
  first_week_checkin_submitted: boolean;
}

export interface ChecklistStepStatus extends ChecklistStep {
  complete: boolean;
  /** Why it is not complete yet, when we can say something useful. */
  waiting_on: string | null;
}

/**
 * Resolve the checklist against real evidence.
 *
 * Pure. Every `complete` is derived from something that actually happened, which
 * is the contract's rule about not awarding progress for opening a card.
 *
 * Note `api_key_setup_verified` requires the THIRD acknowledgement state. Self-
 * attestation deliberately does not complete it: "I have a key" is a claim, and
 * this step exists to record that we saw it work.
 */
export function resolveChecklist(evidence: ChecklistEvidence): ChecklistStepStatus[] {
  const ack = (key: RequirementKey): AcknowledgementState | undefined =>
    evidence.acknowledgements.get(key);

  return [...CHECKLIST]
    .sort((a, b) => a.order - b.order)
    .map((step): ChecklistStepStatus => {
      switch (step.key) {
        case 'sign_offer_letter':
          return { ...step, complete: evidence.offer_letter_generated, waiting_on: evidence.offer_letter_generated ? null : 'your offer letter is being prepared' };
        case 'upload_signed_documents':
          return { ...step, complete: evidence.signed_documents_uploaded, waiting_on: evidence.signed_documents_uploaded ? null : 'we need your signed copies' };
        case 'documents_verified':
          return { ...step, complete: evidence.all_documents_verified, waiting_on: evidence.all_documents_verified ? null : 'we are checking your documents' };
        case 'membership_active':
          return { ...step, complete: evidence.membership_ok, waiting_on: evidence.membership_ok ? null : 'your membership is not active yet' };
        case 'orientation':
          return { ...step, complete: evidence.orientation_attended, waiting_on: evidence.orientation_attended ? null : 'orientation has not happened yet' };
        case 'claude_code_ready':
          return {
            ...step,
            // Either attestation or verification completes this one: we cannot
            // check somebody's subscription exists, so their word is the evidence.
            complete: ack('claude_code_account') === 'self_attested_ready'
              || ack('claude_code_account') === 'setup_verified_without_secret_collection',
            waiting_on: 'tell us your Claude Code account is set up',
          };
        case 'api_key_setup_verified':
          return {
            ...step,
            // ONLY the verified state. See the function header.
            complete: ack('own_api_key_with_billing') === 'setup_verified_without_secret_collection',
            waiting_on: ack('own_api_key_with_billing') === 'self_attested_ready'
              ? 'run the setup exercise so we can see it working'
              : 'set up your API key, then run the setup exercise',
          };
        case 'join_community':
          return { ...step, complete: evidence.joined_community, waiting_on: evidence.joined_community ? null : 'join the internship channels' };
        case 'first_project_assigned':
          return { ...step, complete: evidence.active_project_count > 0, waiting_on: evidence.active_project_count > 0 ? null : 'your manager is assigning your first project' };
        case 'first_week_checkin':
          return { ...step, complete: evidence.first_week_checkin_submitted, waiting_on: evidence.first_week_checkin_submitted ? null : 'due at the end of your first week' };
        default:
          return { ...step, complete: false, waiting_on: null };
      }
    });
}

/** Blocking steps still outstanding. Empty means activation may proceed. */
export function activationBlockers(steps: readonly ChecklistStepStatus[]): ChecklistStepStatus[] {
  return steps.filter((s) => s.blocking_activation && !s.complete);
}

/**
 * The single most useful next action for the student.
 *
 * Skips anything only Colaberry can do — telling someone their next action is
 * "wait for us" is not a next action. Returns null when there is genuinely nothing
 * for them to do, and the caller then says so rather than inventing a task.
 */
export function nextStudentAction(steps: readonly ChecklistStepStatus[]): ChecklistStepStatus | null {
  return steps.find((s) => s.actor === 'student' && !s.complete) ?? null;
}

export function checklistProgress(steps: readonly ChecklistStepStatus[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.complete).length, total: steps.length };
}
