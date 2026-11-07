import React from 'react';
import type {
  AssignExistingToolResult,
  DecisionIssue,
} from '../../../services/toolRequestReviewApi';

/**
 * AF11.4 — what the grant did, said plainly, including when it did nothing useful.
 *
 * ## Why this panel exists rather than a green tick
 *
 * A grant can succeed and leave the tool unusable, and that is the ordinary case rather than an
 * edge: `usable` also requires the agent to be enabled and its autonomy level to allow the
 * action, and 255 of 257 agents are deliberately held at `observe`. A console that answered
 * "granted ✓" would be telling the truth about the write and the wrong thing about the agent,
 * and the next question — "so can it send the email now?" — would be answered by a guess.
 *
 * ## It reports the server's verdict and never computes one
 *
 * `usable` is read straight off the response. The three conditions below are the FACTS the
 * resolver reads, shown so the reader can see which one is false — they are not a second
 * calculation of the verdict. A duplicate of that rule could disagree with the real one, and a
 * screen that disagrees with the gate is worse than a screen that says less.
 *
 * ## Lifting the blocker is not offered here
 *
 * There is no "enable the agent" button and no autonomy control. Both are separate decisions
 * with separate authors, which is the whole reason the grant is its own step.
 */

interface Props {
  result: AssignExistingToolResult | null;
  /** Named refusals from the server. Shown in full: every reason, not the first. */
  issues: DecisionIssue[];
  /** Which 409 it was, so the sentence above the reasons is the right one. */
  code: string;
  /** Fallback sentence when the failure carried no named reasons at all. */
  problem: string;
}

/** One condition the resolver reads, and whether it currently holds. */
function Condition({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className="d-flex align-items-start gap-2">
      <span
        className={`badge ${met ? 'bg-success' : 'bg-secondary'} mt-1`}
        style={{ minWidth: '3.5rem' }}
      >
        {met ? 'yes' : 'no'}
      </span>
      <span className="small">{children}</span>
    </li>
  );
}

export default function GrantOutcomePanel({ result, issues, code, problem }: Props) {
  if (issues.length > 0 || problem) {
    // THE DECISION STILL STANDS. Saying so is the point of the first sentence: the record of
    // what Ali decided is not undone by a grant that could not be carried out, and a reader who
    // thought it had been would go and decide it again.
    const refused = code === 'grant_refused';
    return (
      <div className="alert alert-warning mb-0" role="alert">
        <div className="fw-semibold mb-1">
          {refused
            ? 'The decision is recorded. The grant it asks for cannot be made yet.'
            : 'There is nothing here to carry out.'}
        </div>
        {issues.length > 0 ? (
          <ul className="mb-0 small">
            {issues.map((i) => <li key={i.rule || i.detail}>{i.detail}</li>)}
          </ul>
        ) : (
          <div className="small mb-0">{problem}</div>
        )}
      </div>
    );
  }

  if (!result) return null;

  const { grant, access } = result;

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <span className="badge bg-success">
          {grant.unchanged ? 'Already held' : 'Granted'}
        </span>
        <span className="fw-semibold">{grant.toolName}</span>
        <span className="text-muted small">to</span>
        <span className="fw-semibold">{grant.agentName}</span>
      </div>

      <dl className="row small mb-3">
        <dt className="col-sm-4 text-muted fw-normal">On whose authority</dt>
        <dd className="col-sm-8 mb-1">{grant.approvedBy}</dd>
        <dt className="col-sm-4 text-muted fw-normal">For which capability</dt>
        <dd className="col-sm-8 mb-1"><code>{grant.capabilityId}</code></dd>
        <dt className="col-sm-4 text-muted fw-normal">Answering which request</dt>
        <dd className="col-sm-8 mb-1">
          {grant.changeRequestId
            ? <code>{grant.changeRequestId}</code>
            : <span className="text-muted">none recorded on this grant</span>}
        </dd>
        <dt className="col-sm-4 text-muted fw-normal">Tools it now holds</dt>
        <dd className="col-sm-8 mb-0">{grant.toolsGranted.join(', ') || 'none'}</dd>
      </dl>

      {grant.unchanged && (
        <div className="small text-muted mb-3">
          This agent already held the tool, so nothing was written. The grant that is on the
          record is the earlier one, with the authority and the request it was made under.
        </div>
      )}

      {access ? (
        <div className={`callout-box ${access.usable ? '' : 'mb-0'}`}>
          <div className="fw-semibold mb-2">
            {access.usable
              ? 'The agent can use this tool now.'
              : 'The agent holds this tool and still cannot use it.'}
          </div>
          <ul className="list-unstyled mb-2 d-grid gap-2">
            <Condition met={access.grantedVia.length > 0}>
              Granted — the tool is in this agent&apos;s list
              {access.grantedVia.length > 0 && ` (via ${access.grantedVia.join(', ')})`}
            </Condition>
            <Condition met={access.registered}>
              A handler exists for this agent. Registration is compiled into the backend, so a
              tool cannot be created by granting it.
            </Condition>
            <Condition met={access.agentEnabled}>
              The agent is switched on.
            </Condition>
            <Condition met={Boolean(access.autonomyLevel)}>
              An autonomy level is set
              {access.autonomyLevel ? `: ${access.autonomyLevel}` : ''}. Whether that level
              permits this action is the separate decision this grant deliberately does not make.
            </Condition>
          </ul>
          {!access.usable && (
            <div className="small text-muted mb-0">
              Each of these is somebody&apos;s decision to make, and none of them is this one.
              The grant is on the record either way.
            </div>
          )}
          {access.mismatches.length > 0 && (
            <ul className="small text-muted mb-0 mt-2">
              {access.mismatches.map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <div className="alert alert-secondary small mb-0" role="status">
          The grant is recorded. Whether the agent can use the tool could not be read just now —
          that is unmeasured rather than a no, so it is not being reported as one.
        </div>
      )}
    </>
  );
}
