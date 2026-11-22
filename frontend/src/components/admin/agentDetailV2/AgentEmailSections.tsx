import React, { useState } from 'react';
import {
  approveAgentReply, rejectAgentReply,
  type AgentCall, type AgentInboundPanel, type AgentPendingReply,
} from '../../../services/agentEmailApi';

/**
 * The agent-comms panels of an agent's Email tab (agent comms, Ali 2026-11-22): who she sends as,
 * what people sent her, the replies she drafted that wait on a person, and the calls she placed.
 *
 * Approving a REPLY sends it (unlike the drafts above it on the tab), so the exact text is shown
 * before the button, and the button says "Approve and send". Decisions go through the one outbound
 * review endpoint, which only Ali or a super admin may approve through; anyone else gets a plain
 * sentence, not a stack trace.
 */

function fmt(iso: string | null): string {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago' }); } catch { return iso; }
}

/** The reply body is HTML the server escaped and built; show the person the words it says, as text. */
export function replyText(html: string): string {
  return html
    .replace(/<\/p>\s*/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .trim();
}

function statusOf(err: unknown): number | null {
  const s = (err as { response?: { status?: unknown } })?.response?.status;
  return typeof s === 'number' ? s : null;
}

export function decisionError(err: unknown): string {
  const status = statusOf(err);
  if (status === 403) return 'Only Ali or a super admin can approve sending this reply. Nothing was sent.';
  if (status === 409) return 'This reply was already decided by someone else. Nothing was sent again.';
  if (status === 401) return 'Your session has expired. Sign in again; nothing was changed.';
  return 'That did not go through. Nothing was sent.';
}

export function IdentityLine({ identity }: { identity: { fromHeader: string; replyTo: string } | null | undefined }) {
  if (!identity) {
    return <p className="text-muted small mb-3">This agent has no email address yet, so she cannot be written to.</p>;
  }
  return (
    <div className="small mb-3" data-testid="agent-identity">
      <span className="text-muted">Sends as</span> <strong>{identity.fromHeader}</strong>
      <span className="text-muted"> · replies go to</span> <strong>{identity.replyTo}</strong>
    </div>
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  queued: 'Reply drafted, waiting on a person',
  deduped: 'Already drafted',
  blocked: 'Not answered (unsubscribed or paused)',
  no_persona: 'Not answered (agent has no persona)',
  draft_failed: 'Draft failed; answer by hand',
};

export function InboundSection({ inbound }: { inbound: AgentInboundPanel }) {
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">Received ({inbound.items.length})</div>
      <div className="card-body p-0">
        {inbound.reason === 'no_agent_address' ? (
          <p className="text-muted mb-0 small m-3">
            This agent has no email address yet, so there is nothing for anyone to reply to.
            This is not &ldquo;no replies&rdquo;: the mailbox does not exist. Replies will
            appear here once an address is configured for her.
          </p>
        ) : inbound.reason === 'identity_unavailable' ? (
          <p className="text-muted mb-0 small m-3">Her address could not be read just now, so received mail is not shown. Reload to try again.</p>
        ) : inbound.items.length === 0 ? (
          <p className="text-muted small m-3">No replies yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover table-sm mb-0 align-middle">
              <thead className="table-light"><tr><th>From</th><th>Message</th><th>What happened</th><th>When</th></tr></thead>
              <tbody>
                {inbound.items.map((m) => (
                  <tr key={m.id}>
                    <td>{m.fromAddress ?? '-'}{m.leadId ? <div className="text-muted small">Lead #{m.leadId}</div> : null}</td>
                    <td><div className="fw-medium">{m.subject ?? '(no subject)'}</div><div className="text-muted small">{m.preview.slice(0, 160)}</div></td>
                    <td className="small">{m.draftReason === 'rate_capped' ? 'Not answered (too many from this sender today)' : OUTCOME_LABEL[m.draftOutcome ?? ''] ?? (m.draftOutcome || '-')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(m.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function PendingRepliesSection({ items, agentName, onDecided }: { items: AgentPendingReply[]; agentName: string; onDecided: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const visible = items.filter((r) => !hidden.has(r.id));

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    setError(null);
    try {
      if (decision === 'approve') await approveAgentReply(id);
      else await rejectAgentReply(id, 'Rejected from the agent dashboard');
      setHidden((h) => new Set(h).add(id));
      onDecided();
    } catch (err) {
      setError(decisionError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">Replies waiting on you ({visible.length})</div>
      <div className="card-body">
        {error && <div className="alert alert-warning py-2 small" role="alert">{error}</div>}
        {visible.length === 0 ? (
          <p className="text-muted small mb-0">Nothing waiting.</p>
        ) : visible.map((r) => (
          <div key={r.id} className="border rounded p-3 mb-3" data-testid="pending-reply">
            <div className="small text-muted mb-1">To <strong className="text-body">{r.toAddress}</strong> · {fmt(r.createdAt)}</div>
            <div className="fw-medium mb-2">{r.subject ?? '(no subject)'}</div>
            <div className="small bg-light rounded p-2 mb-2" style={{ whiteSpace: 'pre-wrap' }}>{replyText(r.body)}</div>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-primary" disabled={busy === r.id} onClick={() => decide(r.id, 'approve')}>
                Approve and send as {agentName}
              </button>
              <button className="btn btn-sm btn-outline-danger" disabled={busy === r.id} onClick={() => decide(r.id, 'reject')}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CALL_STATUS: Record<string, string> = {
  dialing: 'Dialing', sent: 'Placed', pending: 'Placed', delivered: 'Completed', failed: 'Did not connect', unconfirmed: 'Could not confirm',
};

export function CallsSection({ calls }: { calls: AgentCall[] }) {
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">Calls ({calls.length})</div>
      <div className="card-body p-0">
        {calls.length === 0 ? (
          <p className="text-muted small m-3">No calls placed.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover table-sm mb-0 align-middle">
              <thead className="table-light"><tr><th>To</th><th>Why</th><th>Status</th><th>Summary</th><th>When</th></tr></thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td>{c.phoneLast4 ? `…${c.phoneLast4}` : '-'}{c.leadId ? <div className="text-muted small">Lead #{c.leadId}</div> : null}</td>
                    <td className="small">{c.purpose ?? '-'}</td>
                    <td><span className="badge bg-light text-dark border">{CALL_STATUS[c.status] ?? c.status}</span></td>
                    <td className="small">{c.summary ?? (c.summaryState === 'summary_failed' ? 'Summary failed; the transcript is on the record' : '-')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
