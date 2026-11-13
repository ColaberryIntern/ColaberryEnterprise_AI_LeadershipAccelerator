import React, { useEffect, useState } from 'react';
import {
  getAgentToolRequests,
  postToolRequestMessage,
  recordToolRequestBuildEvent,
  type AgentToolRequestsReport,
  type AgentToolRequestView,
} from '../../../services/agentEffectiveAccessApi';
import { timeAgo } from '../shell/trust';

// Agent Tools Phase 2 (2026-11-11) — the request pipeline for this agent, with the conversation
// on each request.
//
// Ali: "They can request and manage communication between me on the request and keeping track
// until it is built out and handed over and we should track everything associated so all parties
// can see what's going on."
//
// WHY THE CONVERSATION IS SEPARATE FROM THE DECISIONS. The decision log already existed and
// records the four verbs. A verb is not a conversation: "does this need to cover the sandbox
// too?" and "no, production read only" are neither an approval nor a denial, and before this
// they happened in chat and were lost to everyone who was not in that chat. Both are shown, in
// their own lanes, so a reader can tell what was DECIDED from what was DISCUSSED.
//
// WHAT THIS CANNOT DO, on purpose: approve, deny, send back, or grant. Those live in the review
// console. A surface that could both discuss and decide would be the second approval spine the
// AF11 design doc warns against.

interface Props {
  agentId: string;
}

const STATUS_PILL: Record<string, string> = {
  submitted: 'adv2-warn',
  approved: 'adv2-ok',
  declined: 'adv2-bad',
  withdrawn: 'adv2-trust',
};

const VERB_LABEL: Record<string, string> = {
  approve_to_build: 'approved to build',
  deny: 'denied',
  assign_existing_tool: 'assigned an existing tool',
  send_back: 'sent back',
};

/**
 * Phase 3: marking delivery progress on an APPROVED request.
 *
 * Shown only when the request is approved, because the server refuses a milestone on anything
 * else — offering a control the API will refuse is how a UI teaches people it is unreliable.
 * Once handed over, nothing is offered: handover is terminal, and a change after it is a new
 * request.
 */
function BuildProgress({ request, onRecorded }: { request: AgentToolRequestView; onRecorded: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (request.status !== 'approved') return null;

  const events = request.build_events || [];
  const handedOver = events.some((e) => e.event === 'handed_over');
  const started = events.some((e) => e.event === 'started_build');

  const record = async (event: 'started_build' | 'handed_over') => {
    setBusy(event);
    setError(null);
    try {
      await recordToolRequestBuildEvent(request.change_request_id, event);
      onRecorded();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; issues?: Array<{ detail?: string }> } } };
      setError(err?.response?.data?.issues?.[0]?.detail || err?.response?.data?.error || 'Could not record that');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        Delivery <span className="adv2-hint">{events.length}</span>
      </h3>

      {events.map((e) => (
        <div key={e.id} style={{ fontSize: 12, padding: '3px 0' }}>
          <strong>{e.event === 'started_build' ? 'Started building' : 'Handed over'}</strong>{' '}
          by {e.actor_identity} <span className="adv2-muted">{timeAgo(e.occurred_at)}</span>
          {e.note && <div className="adv2-muted">{e.note}</div>}
        </div>
      ))}

      {handedOver ? (
        <p className="adv2-muted" style={{ fontSize: 12 }}>
          Handed over, so this request is finished. A change after handover is a new request.
        </p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {!started && (
            <button className="btn btn-outline-secondary btn-sm" disabled={busy !== null} onClick={() => record('started_build')}>
              {busy === 'started_build' ? 'Recording…' : 'Mark as being built'}
            </button>
          )}
          <button className="btn btn-outline-primary btn-sm" disabled={busy !== null} onClick={() => record('handed_over')}>
            {busy === 'handed_over' ? 'Recording…' : 'Mark as handed over'}
          </button>
          {error && <span className="adv2-gap" style={{ fontSize: 12 }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

function Conversation({ request, onPosted }: { request: AgentToolRequestView; onPosted: () => void }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      await postToolRequestMessage(request.change_request_id, body);
      setDraft('');
      onPosted();
    } catch (e: unknown) {
      // The server names the rule it refused on; show that rather than a generic failure.
      const err = e as { response?: { data?: { error?: string; issues?: Array<{ detail?: string }> } } };
      setError(err?.response?.data?.issues?.[0]?.detail || err?.response?.data?.error || 'Could not post that message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        Conversation <span className="adv2-hint">{request.messages.length}</span>
      </h3>

      {request.messages.length === 0 ? (
        <p className="adv2-muted" style={{ fontSize: 12 }}>
          Nothing said yet. Anything asked or answered here stays on the request, where everyone
          working on it can see it.
        </p>
      ) : (
        request.messages.map((m) => (
          <div key={m.id} style={{ padding: '6px 0', borderTop: '1px solid var(--adv2-line, #e2e8f0)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600 }}>
              {m.author_identity}{' '}
              <span className="adv2-muted" style={{ fontWeight: 400 }}>{timeAgo(m.posted_at)}</span>
            </div>
            <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{m.body}</div>
          </div>
        ))
      )}

      <div style={{ marginTop: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask or answer something about this request"
          rows={2}
          style={{ width: '100%', fontSize: 12.5, padding: 6 }}
          disabled={sending}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={send}
            disabled={sending || draft.trim().length === 0}
          >
            {sending ? 'Posting…' : 'Post'}
          </button>
          {error && <span className="adv2-gap" style={{ fontSize: 12 }}>{error}</span>}
        </div>
      </div>
    </div>
  );
}

export default function AgentToolRequests({ agentId }: Props) {
  const [report, setReport] = useState<AgentToolRequestsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAgentToolRequests(agentId)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch((e) => {
        // Surfaced, never swallowed: an empty pipeline and a failed fetch look identical
        // otherwise, and this section is about seeing what is actually going on.
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Could not load tool requests');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agentId, reloadKey]);

  if (loading) {
    return (
      <section className="adv2-card">
        <h2>Tool requests</h2>
        <p className="adv2-muted" style={{ padding: '0 18px 16px' }}>Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="adv2-card">
        <h2>Tool requests</h2>
        <p className="adv2-gap" style={{ padding: '0 18px 16px' }}>{error}</p>
      </section>
    );
  }

  if (!report) return null;

  return (
    <section className="adv2-card">
      <h2>
        Tool requests{' '}
        <span className="adv2-hint">
          {report.summary.total === 0
            ? 'none filed'
            : `${report.summary.open} open of ${report.summary.total}`}
        </span>
      </h2>

      {report.requests.length === 0 ? (
        <p className="adv2-muted" style={{ padding: '0 18px 16px' }}>
          No tool has been requested for this agent. Requests are filed against the agent's domain
          in Change requests, and every one filed for this agent appears here with its decisions
          and its conversation.
        </p>
      ) : (
        report.requests.map((r) => {
          const open = openId === r.change_request_id;
          return (
            <div className="adv2-tool" key={r.change_request_id} style={{ display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className={`adv2-pill ${STATUS_PILL[r.status] || 'adv2-trust'}`}>{r.status}</span>
                <strong style={{ fontSize: 12.5 }}>{r.title}</strong>
                {r.tool_name && <code style={{ fontSize: 11.5 }}>{r.tool_name}</code>}
                {r.writes && <span className="adv2-pill adv2-warn">writes</span>}
              </div>

              <div className="adv2-what" style={{ marginTop: 4 }}>{r.where_it_stands}</div>

              <div className="adv2-muted" style={{ fontSize: 12, marginTop: 3 }}>
                {r.requested_by_identity && <>Filed by {r.requested_by_identity}</>}
                {r.requested_at && <> {timeAgo(r.requested_at)}</>}
                {r.capability_id && <> · for <code style={{ fontSize: 11 }}>{r.capability_id}</code></>}
                {r.needed_by && <> · needed by {r.needed_by}</>}
              </div>

              <button
                className="btn btn-link btn-sm"
                style={{ padding: 0, fontSize: 12 }}
                onClick={() => setOpenId(open ? null : r.change_request_id)}
              >
                {open ? 'Hide' : `Show decisions (${r.decisions.length}) and conversation (${r.messages.length})`}
              </button>

              {open && (
                <div style={{ marginTop: 6 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    Decisions <span className="adv2-hint">{r.decisions.length}</span>
                  </h3>
                  {r.decisions.length === 0 ? (
                    <p className="adv2-muted" style={{ fontSize: 12 }}>No decision recorded yet.</p>
                  ) : (
                    r.decisions.map((d, i) => (
                      <div key={`${d.decided_at}-${i}`} style={{ fontSize: 12, padding: '3px 0' }}>
                        <strong>{VERB_LABEL[d.verb] || d.verb}</strong> by {d.decided_by_identity}{' '}
                        <span className="adv2-muted">{timeAgo(d.decided_at)}</span>
                        {d.reason && <div className="adv2-muted">{d.reason}</div>}
                        {d.missing_field && <div className="adv2-muted">needs: {d.missing_field}</div>}
                        {d.assigned_tool_name && <div className="adv2-muted">assigned: {d.assigned_tool_name}</div>}
                      </div>
                    ))
                  )}

                  <BuildProgress request={r} onRecorded={() => setReloadKey((k) => k + 1)} />

                  <Conversation request={r} onPosted={() => setReloadKey((k) => k + 1)} />
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
