import React, { useCallback, useEffect, useState } from 'react';
import {
  getAgentEmailInbox, approveAgentEmailDraft, discardAgentEmailDraft,
  type AgentEmailInbox, type AgentEmailDraft,
} from '../../../services/agentEmailApi';

/**
 * The agent's own email, on her dashboard (Ali, 2026-10-26).
 *
 * ── WHY THE "WHY" COLUMN IS THE IMPORTANT ONE ───────────────────────────────
 *
 * `agentEmailTool` fails closed: every uncertainty becomes a draft. So a row here does not mean
 * "the agent wants to send this" - it means "something stopped it", and the reason is the
 * difference between waiting on a DECISION (`autonomy_insufficient`, which a human resolves by
 * approving) and waiting on CONFIGURATION (`tool_not_granted`, `no_brand_scope`,
 * `transport_not_wired`, which approving will not fix). Showing the queue without the reason would
 * invite a reviewer to approve their way through a configuration problem.
 *
 * ── APPROVAL DOES NOT SEND, AND THE SCREEN SAYS SO ──────────────────────────
 *
 * Stated on the surface rather than only in the API, because "Approve" on a queue of emails reads
 * as "send it" to anybody who has used any other mail client. The repo's own precedent is explicit
 * (`approvalApply.ts`: "APPROVAL NEVER SENDS"), and a UI that implies otherwise would be the
 * weakest link in a chain that is otherwise careful.
 *
 * ── ABSENCE IS NOT EMPTINESS ────────────────────────────────────────────────
 *
 * The inbound panel renders its `reason` when it has one. An empty list would read as "nobody has
 * replied"; the truth today is "she has no address to be replied to". Opposite actions.
 */

const REASON_LABEL: Record<string, string> = {
  tool_not_granted: 'Not granted the email tool',
  autonomy_unknown: 'Autonomy level unrecognised',
  agent_disabled: 'Agent disabled',
  agent_paused: 'Agent paused',
  agent_not_found: 'Agent record missing',
  agent_lookup_failed: 'Agent record unreadable',
  no_brand_scope: 'No brand campaign, so consent was never checked',
  transport_not_wired: 'Cleared every check; sending is not switched on yet',
  send_evaluation_failed: 'Safety check could not be evaluated',
};

/** Reasons a human can actually clear by approving. Everything else needs configuration. */
function isDecisionReason(reason: string | null): boolean {
  return Boolean(reason && reason.startsWith('autonomy_insufficient'));
}

function reasonText(reason: string | null): string {
  if (!reason) return 'Unknown';
  if (reason.startsWith('autonomy_insufficient:')) {
    return `Autonomy is "${reason.split(':')[1]}" — only "communicate" may send`;
  }
  return REASON_LABEL[reason] ?? reason;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago' }); } catch { return iso; }
}

export default function AgentEmailTab({ agentId }: { agentId: string }) {
  const [inbox, setInbox] = useState<AgentEmailInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInbox(await getAgentEmailInbox(agentId));
    } catch {
      setError('Could not load this agent’s email.');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { void load(); }, [load]);

  const act = async (draftId: string, action: 'approve' | 'discard') => {
    setBusyId(draftId);
    try {
      if (action === 'approve') await approveAgentEmailDraft(agentId, draftId);
      else await discardAgentEmailDraft(agentId, draftId);
      await load();
    } catch {
      setError('That action did not go through. Nothing was changed.');
    } finally {
      setBusyId(null);
    }
  };

  // `&hellip;` and not `…`: JSX TEXT does not process JS escape sequences, so the escape
  // would render as the literal characters. JSX does process HTML entities.
  if (loading) return <div className="text-muted p-3">Loading email&hellip;</div>;
  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!inbox) return <div className="text-muted p-3">No email for this agent.</div>;

  const awaiting = inbox.drafts.filter((d) => d.status === 'agent_draft');
  const approved = inbox.drafts.filter((d) => d.status !== 'agent_draft');

  return (
    <div>
      <div className="alert alert-info py-2 small" role="note">
        <strong>Approving does not send.</strong> It records that a human said yes. Sending is a
        separate step and is not switched on yet.
      </div>

      <DraftTable
        title={`Awaiting a decision (${awaiting.length})`}
        drafts={awaiting}
        busyId={busyId}
        onAct={act}
      />

      {approved.length > 0 && (
        <DraftTable
          title={`Approved, not sent (${approved.length})`}
          drafts={approved}
          busyId={busyId}
          onAct={act}
          readOnly
        />
      )}

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Replies</div>
        <div className="card-body">
          {inbox.inbound.reason === 'no_agent_address' ? (
            <p className="text-muted mb-0 small">
              This agent has no email address yet, so there is nothing for anyone to reply to.
              This is not &ldquo;no replies&rdquo; &mdash; the mailbox does not exist. Replies will
              appear here once an address is configured for her.
            </p>
          ) : (
            <p className="text-muted mb-0 small">No replies yet.</p>
          )}
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Sent ({inbox.sent.length})</div>
        <div className="card-body p-0">
          {inbox.sent.length === 0 ? (
            <p className="text-muted small m-3">Nothing sent yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover table-sm mb-0 align-middle">
                <thead className="table-light">
                  <tr><th>To</th><th>Subject</th><th>Status</th><th>When</th></tr>
                </thead>
                <tbody>
                  {inbox.sent.map((s) => (
                    <tr key={s.id}>
                      <td>{s.toAddress}</td>
                      <td>{s.subject ?? '—'}</td>
                      <td>
                        <span className={`badge ${s.status === 'sent' ? 'bg-success' : 'bg-secondary'}`}>
                          {s.status}
                        </span>
                        {s.errorMessage && (
                          <div className="text-danger small mt-1">{s.errorMessage}</div>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmt(s.sentAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftTable({ title, drafts, busyId, onAct, readOnly }: {
  title: string;
  drafts: AgentEmailDraft[];
  busyId: string | null;
  onAct: (id: string, action: 'approve' | 'discard') => void;
  readOnly?: boolean;
}) {
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">{title}</div>
      <div className="card-body p-0">
        {drafts.length === 0 ? (
          <p className="text-muted small m-3">Nothing here.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover table-sm mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>To</th>
                  <th>Subject</th>
                  <th>Why it is not sent</th>
                  <th>Created</th>
                  {!readOnly && <th className="text-end">Decision</th>}
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id}>
                    <td>{d.toEmail}</td>
                    <td>
                      <div className="fw-medium">{d.subject}</div>
                      <div className="text-muted small">{d.body.slice(0, 120)}</div>
                    </td>
                    <td>
                      <span className={`badge ${isDecisionReason(d.draftReason) ? 'bg-warning text-dark' : 'bg-light text-muted border'}`}>
                        {isDecisionReason(d.draftReason) ? 'Needs a decision' : 'Needs configuration'}
                      </span>
                      <div className="text-muted small mt-1">{reasonText(d.draftReason)}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(d.createdAt)}</td>
                    {!readOnly && (
                      <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                        <button
                          className="btn btn-sm btn-outline-primary me-2"
                          disabled={busyId === d.id}
                          onClick={() => onAct(d.id, 'approve')}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          disabled={busyId === d.id}
                          onClick={() => onAct(d.id, 'discard')}
                        >
                          Discard
                        </button>
                      </td>
                    )}
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
