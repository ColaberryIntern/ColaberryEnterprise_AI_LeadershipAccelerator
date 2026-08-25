/**
 * clientAcceptanceService — the acceptance state machine. PURE, no I/O.
 *
 * Master plan §Gate 10 makes client acceptance a first-class durable object; §24 lists
 * "client acceptance is not durable" and "design approval can be silently overwritten" as
 * stop conditions. This module owns which acceptance transitions are legal and what a
 * recorded acceptance must contain to mean anything.
 *
 * The write path lives elsewhere. Keeping the rules pure means the refusal cannot be
 * talked out of by a slow database, and the whole table of legal transitions is readable
 * in one screen.
 */

import type {
  ClientAcceptanceScope,
  ClientAcceptanceStatus,
} from '../../models/DeliveryClientAcceptance';

/**
 * Legal transitions.
 *
 * `accepted` is NOT terminal — it can be superseded (a later sign-off replaces it, with
 * the original preserved) or withdrawn. A model where acceptance is terminal forces the
 * only available correction to be an UPDATE on the accepted row, which is precisely the
 * silent-overwrite failure §24 forbids. Making supersession legal is what makes mutation
 * unnecessary.
 */
const TRANSITIONS: Record<ClientAcceptanceStatus, readonly ClientAcceptanceStatus[]> = {
  pending: ['accepted', 'accepted_with_exceptions', 'rejected', 'withdrawn'],
  // A client who accepted can change their mind, and the record must show both facts.
  accepted: ['superseded', 'withdrawn'],
  accepted_with_exceptions: ['accepted', 'superseded', 'withdrawn'],
  // A rejection can be answered by a new submission, which supersedes it.
  rejected: ['superseded', 'pending'],
  withdrawn: ['superseded'],
  superseded: [],
};

export function canTransition(
  from: ClientAcceptanceStatus,
  to: ClientAcceptanceStatus,
): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitions(
  from: ClientAcceptanceStatus,
): readonly ClientAcceptanceStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Statuses that represent the client having said yes, in some form. */
export function isAccepted(status: ClientAcceptanceStatus): boolean {
  return status === 'accepted' || status === 'accepted_with_exceptions';
}

export class InvalidAcceptanceTransitionError extends Error {
  readonly from: ClientAcceptanceStatus;
  readonly to: ClientAcceptanceStatus;

  constructor(from: ClientAcceptanceStatus, to: ClientAcceptanceStatus) {
    super(`illegal client acceptance transition: ${from} -> ${to}`);
    this.name = 'InvalidAcceptanceTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function assertAcceptanceTransition(
  from: ClientAcceptanceStatus,
  to: ClientAcceptanceStatus,
): void {
  if (!canTransition(from, to)) throw new InvalidAcceptanceTransitionError(from, to);
}

export interface AcceptanceSubmission {
  scopeKind: ClientAcceptanceScope;
  releaseId?: string | null;
  storyId?: string | null;
  promisedAcceptance?: unknown[] | null;
  previewRef?: string | null;
  evidenceSummary?: unknown[] | null;
  acceptedByIdentityId?: string | null;
  comments?: string | null;
  exceptions?: unknown[] | null;
  status: ClientAcceptanceStatus;
}

export interface AcceptanceIssue {
  rule: string;
  detail: string;
  severity: 'blocking' | 'warning';
}

/**
 * Validate a proposed acceptance.
 *
 * The blocking rules all answer the same question: **would this record still mean
 * something in a year?** An acceptance with no named acceptor, no promise and no preview
 * is a row that says "someone approved something", which is worse than no record because
 * it looks like evidence.
 */
export function validateAcceptance(input: AcceptanceSubmission): AcceptanceIssue[] {
  const issues: AcceptanceIssue[] = [];
  const add = (rule: string, detail: string, severity: AcceptanceIssue['severity'] = 'blocking') =>
    issues.push({ rule, detail, severity });

  // Scope must be exactly one thing. A row scoped to both a release and a story is
  // ambiguous about what was actually signed off.
  if (input.scopeKind === 'release' && !input.releaseId) {
    add('scope_missing', 'A release-scoped acceptance needs a release_id.');
  }
  if (input.scopeKind === 'story' && !input.storyId) {
    add('scope_missing', 'A story-scoped acceptance needs a story_id.');
  }
  if (input.releaseId && input.storyId) {
    add(
      'scope_ambiguous',
      'An acceptance covers a release or a story, not both — otherwise what was signed off is undefined.',
    );
  }

  if (isAccepted(input.status)) {
    if (!input.acceptedByIdentityId) {
      add('acceptor_missing', 'An acceptance must record WHO accepted it.');
    }
    if (!input.promisedAcceptance?.length) {
      add(
        'promise_missing',
        'An acceptance must snapshot what was promised; without it the record cannot say what was agreed.',
      );
    }
    if (!input.previewRef) {
      add(
        'preview_missing',
        'An acceptance must record what the client actually looked at.',
      );
    }
    if (!input.evidenceSummary?.length) {
      add(
        'evidence_missing',
        'An acceptance must snapshot the evidence that supported it.',
        // A warning rather than blocking: a client is entitled to accept work on their own
        // judgement. Refusing to record that would push the sign-off out of the system
        // entirely, and an unrecorded acceptance is the failure this table exists to stop.
        'warning',
      );
    }
  }

  if (input.status === 'accepted_with_exceptions' && !input.exceptions?.length) {
    add(
      'exceptions_missing',
      "Status is accepted_with_exceptions but no exceptions are listed. The open items are the " +
        'entire difference between this status and a plain acceptance.',
    );
  }

  if (input.status === 'accepted' && input.exceptions?.length) {
    add(
      'exceptions_on_clean_acceptance',
      'Exceptions are recorded but the status is a clean acceptance. Use ' +
        'accepted_with_exceptions so the open items are not lost.',
    );
  }

  if (input.status === 'rejected' && !input.comments?.trim()) {
    add(
      'rejection_unexplained',
      'A rejection with no comment gives the team nothing to act on.',
      'warning',
    );
  }

  return issues;
}

export interface AcceptanceDecision {
  valid: boolean;
  issues: AcceptanceIssue[];
  blockingIssues: AcceptanceIssue[];
}

/** Fail-closed wrapper: any blocking issue refuses the acceptance. */
export function decideAcceptance(input: AcceptanceSubmission): AcceptanceDecision {
  const issues = validateAcceptance(input);
  const blockingIssues = issues.filter((i) => i.severity === 'blocking');
  return { valid: blockingIssues.length === 0, issues, blockingIssues };
}
