import React from 'react';
import type { ToolRequestDecision, ToolRequestVerb } from '../../../services/toolRequestReviewApi';

/**
 * AF11.3 — every decision made on one request, oldest first.
 *
 * ## Why this is a list and not a line
 *
 * A send-back happens more than once. A request can be sent back, edited, sent back again and
 * finally approved, and each of those is something somebody decided and may be asked about later.
 * A single "decided by" line would keep only the last one and lose exactly the history that makes
 * an approval auditable.
 *
 * Which also makes "this is the third time this has come back" readable, and that is a fact about
 * the request nobody can derive from its status.
 *
 * ## Each row names the actor and the time, because that is the criterion
 *
 * Not "approved" but "approved by ali@colaberry.com on 5 Nov 2026, 9:14 AM CT". Central, written
 * out, because every time in this product is Central.
 */

const VERB_LABEL: Record<ToolRequestVerb, string> = {
  approve_to_build: 'Approved to build',
  assign_existing_tool: 'Assigned an existing tool',
  send_back: 'Sent back',
  deny: 'Denied',
};

const VERB_BADGE: Record<ToolRequestVerb, string> = {
  approve_to_build: 'bg-success',
  assign_existing_tool: 'bg-info',
  send_back: 'bg-warning text-dark',
  deny: 'bg-secondary',
};

function when(iso: string): string {
  if (!iso) return '';
  return `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT`;
}

export default function DecisionHistory({ decisions }: { decisions: ToolRequestDecision[] }) {
  if (decisions.length === 0) {
    return (
      <div className="text-muted small">
        Nothing has been decided on this request yet.
      </div>
    );
  }

  const sendBacks = decisions.filter((d) => d.verb === 'send_back').length;

  return (
    <div>
      {sendBacks > 1 && (
        <div className="alert alert-warning small" role="status">
          {`This request has been sent back ${sendBacks} times. Either the field being asked for is `}
          not clear, or it is not something the person filing can answer.
        </div>
      )}
      <ol className="list-unstyled mb-0">
        {decisions.map((d) => (
          <li className="border-bottom py-2" key={`${d.decided_at}-${d.verb}`}>
            <div className="d-flex gap-2 align-items-start flex-wrap">
              <span className={`badge ${VERB_BADGE[d.verb] ?? 'bg-light text-dark'}`}>
                {VERB_LABEL[d.verb] ?? d.verb}
              </span>
              <div className="flex-grow-1 small">
                <div>
                  <span className="text-muted">by </span>
                  <strong>{d.decided_by_identity}</strong>
                  <span className="text-muted">{` on ${when(d.decided_at)}`}</span>
                </div>
                {d.missing_field && (
                  <div className="mt-1">
                    <span className="text-muted">Field to fix: </span>
                    <code className="small">{d.missing_field}</code>
                  </div>
                )}
                {d.assigned_tool_name && (
                  <div className="mt-1">
                    <span className="text-muted">Tool named: </span>
                    <code className="small">{d.assigned_tool_name}</code>
                    {/* This said "an intent, not a grant" until AF11.4, which was true of
                        AF11.3's console and stopped being true the day the grant was wired. A
                        history row is a record of what was decided, and the decision no longer
                        stops at an intent — so it now points at where the grant itself is
                        reported rather than denying that one happened. */}
                    <span className="text-muted"> — the grant it asks for is recorded separately</span>
                  </div>
                )}
                {d.reason && <div className="mt-1 text-muted">{d.reason}</div>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
