import React, { useEffect, useState, useCallback } from 'react';
import { SectionCard, StatusBadge } from './shell';
import { timeAgo } from './shell/trust';
import { Conversation, getConversation, sendMessage } from '../../services/agentManagerConversationApi';
import { ManagerDirective, listDirectives, createDirective, revokeDirective } from '../../services/managerDirectiveApi';

// AI Agent Dashboard redesign, Checkpoint C (2026-09-02) — Talk: a real
// conversation (GPT-4o-mini round trip, both turns persisted) plus Ask vs.
// Direct per the original design brief. "Direct" creates a real, durable
// ManagerDirective — never a message-table row — so it's provably subject
// to the same real runtime injection and revocation as every other
// directive on this agent. Deliberately does NOT claim an automated
// conflict check or an "effective behavior preview": neither exists in the
// backend today (confirmed — managerDirectiveService.ts has no conflict
// logic, and predicting how a directive changes real model behavior isn't
// something this codebase can honestly claim to preview). Instead: the
// real active-directive list is shown before every Direct submission so the
// manager can check for conflicts themselves, and the one thing the code
// really does guarantee — a directive can only narrow behavior, never grant
// a new capability or bypass authorization (no code path reads
// ManagerDirective to do either) — is stated plainly.

interface Props {
  agentId: string;
}

type ComposerMode = 'ask' | 'direct';

export default function AgentTalkTab({ agentId }: Props) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [conversationError, setConversationError] = useState<string | null>(null);

  const [directives, setDirectives] = useState<ManagerDirective[]>([]);
  const [directivesLoading, setDirectivesLoading] = useState(true);
  const [directivesError, setDirectivesError] = useState<string | null>(null);

  const [mode, setMode] = useState<ComposerMode>('ask');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchConversation = useCallback(async () => {
    setConversationLoading(true);
    setConversationError(null);
    try {
      setConversation(await getConversation(agentId));
    } catch (err: any) {
      setConversationError(err?.response?.data?.error || 'Failed to load the conversation');
    } finally {
      setConversationLoading(false);
    }
  }, [agentId]);

  const fetchDirectives = useCallback(async () => {
    setDirectivesLoading(true);
    setDirectivesError(null);
    try {
      const all = await listDirectives(agentId);
      setDirectives(all);
    } catch (err: any) {
      setDirectivesError(err?.response?.data?.error || 'Failed to load standing directives');
    } finally {
      setDirectivesLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchConversation(); }, [fetchConversation]);
  useEffect(() => { fetchDirectives(); }, [fetchDirectives]);

  const activeDirectives = directives.filter((d) => d.status === 'active');

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (mode === 'direct') {
      const confirmed = window.confirm(
        `Add this as a standing directive for this agent?\n\n"${trimmed}"\n\n` +
        `This can only narrow what the agent does — it can never grant a new capability or bypass authorization. ` +
        `${activeDirectives.length} other directive${activeDirectives.length === 1 ? ' is' : 's are'} already active; review the list below for conflicts before confirming.`,
      );
      if (!confirmed) return;
    }

    setSending(true);
    setSendError(null);
    try {
      if (mode === 'ask') {
        const updated = await sendMessage(agentId, trimmed);
        setConversation(updated);
      } else {
        await createDirective(agentId, trimmed);
        await fetchDirectives();
      }
      setText('');
    } catch (err: any) {
      setSendError(err?.response?.data?.error || `Failed to ${mode === 'ask' ? 'send message' : 'create directive'}`);
    } finally {
      setSending(false);
    }
  }, [agentId, mode, text, activeDirectives.length, fetchDirectives]);

  const handleRevoke = useCallback(async (directiveId: string) => {
    setRevokingId(directiveId);
    try {
      await revokeDirective(agentId, directiveId);
      await fetchDirectives();
    } catch (err: any) {
      setDirectivesError(err?.response?.data?.error || 'Failed to revoke directive');
    } finally {
      setRevokingId(null);
    }
  }, [agentId, fetchDirectives]);

  return (
    <>
      <SectionCard
        title="Talk"
        icon="chat-3-line"
        subtitle="Ask is a normal conversational turn. Direct creates a durable, versioned standing instruction."
      >
        {conversationError && <div className="alert alert-warning py-2 small">Could not load the conversation: {conversationError}</div>}
        {conversationLoading && (
          <div className="text-muted small py-3">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Loading the conversation…
          </div>
        )}
        {!conversationLoading && conversation && (
          <div className="mb-3" style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {conversation.messages.length === 0 ? (
              <p className="text-muted small text-center py-4 mb-0">No messages yet — say hello.</p>
            ) : (
              conversation.messages.map((m) => (
                <div key={m.id} className={`d-flex mb-2 ${m.role === 'manager' ? 'justify-content-end' : 'justify-content-start'}`}>
                  <div className={`p-2 px-3 rounded-3 small ${m.role === 'manager' ? 'bg-primary text-white' : 'bg-light'}`} style={{ maxWidth: '70%' }}>
                    {m.content}
                    <div className={`mt-1 ${m.role === 'manager' ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.68rem' }}>
                      {m.role === 'manager' ? 'You' : 'Agent'} · {timeAgo(m.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="alert alert-light border py-2 small mb-3">
          <i className="ri-information-line" aria-hidden="true" /> Every reply here has real standing directives and any approved memory injected into it — but there is no per-message record of exactly which ones, or the model/cost/duration for a specific reply. Not tracked at that granularity today.
        </div>

        <div className="btn-group mb-2" role="group" aria-label="Composer mode">
          <button type="button" className={`btn btn-sm ${mode === 'ask' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setMode('ask')}>
            <i className="ri-question-line" aria-hidden="true" /> Ask
          </button>
          <button type="button" className={`btn btn-sm ${mode === 'direct' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setMode('direct')}>
            <i className="ri-flag-line" aria-hidden="true" /> Direct
          </button>
        </div>
        {mode === 'ask' ? (
          <p className="text-muted small mb-2">A normal conversational turn. Creates no lasting instruction.</p>
        ) : (
          <p className="text-muted small mb-2">
            Creates a durable, versioned standing instruction. Can only narrow what the agent does — never grants a new capability or bypasses authorization.
            {!directivesLoading && ` ${activeDirectives.length} other directive${activeDirectives.length === 1 ? ' is' : 's are'} already active — see below.`}
          </p>
        )}

        {sendError && <div className="alert alert-danger py-2 small">{sendError}</div>}

        <div className="d-flex gap-2">
          <input
            className="form-control"
            placeholder={mode === 'ask' ? 'Message this agent…' : 'e.g. "Hold anything under $50 impact until Friday\'s review."'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !sending) handleSend(); }}
            disabled={sending}
          />
          <button className="btn btn-primary" onClick={handleSend} disabled={sending || !text.trim()}>
            {sending ? 'Sending…' : mode === 'ask' ? 'Send' : 'Add Directive'}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Standing Directives" icon="file-list-3-line" subtitle="Real, active instructions injected into every reply this agent gives." padded={false}>
        {directivesLoading && <div className="p-3 text-muted small">Loading…</div>}
        {directivesError && <div className="p-3"><div className="alert alert-warning py-2 mb-0 small">{directivesError}</div></div>}
        {!directivesLoading && !directivesError && activeDirectives.length === 0 && (
          <p className="text-muted small text-center py-4 mb-0">No standing directives active for this agent.</p>
        )}
        {!directivesLoading && !directivesError && activeDirectives.map((d, i) => (
          <div key={d.id} className={`d-flex align-items-start justify-content-between gap-2 p-3 ${i < activeDirectives.length - 1 ? 'border-bottom' : ''}`}>
            <div>
              <StatusBadge label="Active" tone="success" />
              <span className="ms-2">{d.directiveText}</span>
              <div className="text-muted small mt-1">Set by {d.createdByEmail}, {timeAgo(d.createdAt)}</div>
            </div>
            <button className="btn btn-outline-danger btn-sm flex-shrink-0" disabled={revokingId === d.id} onClick={() => handleRevoke(d.id)}>
              {revokingId === d.id ? 'Revoking…' : 'Revoke'}
            </button>
          </div>
        ))}
      </SectionCard>
    </>
  );
}
