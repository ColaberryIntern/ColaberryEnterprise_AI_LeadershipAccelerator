import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fmtCentralDateTime } from '../../utils/centralTime';
import { timeAgo } from './shell/trust';
import StatusBadge from './shell/StatusBadge';
import { isTicketStale } from '../../utils/ticketTypeMeta';
import StoryTab from './ticketDetailTabs/StoryTab';
import VisualProofTab from './ticketDetailTabs/VisualProofTab';
import DecisionsTab from './ticketDetailTabs/DecisionsTab';
import ReferencesTab from './ticketDetailTabs/ReferencesTab';
import WorkGraphTab from './ticketDetailTabs/WorkGraphTab';

interface Activity {
  id: string;
  actor_type: string;
  actor_id: string;
  // Resolved server-side by getTicketById() (ProofDesk actor-name resolution, round
  // 2 — see backend/src/services/actorIdentity/resolveActorDisplayName.ts). Optional
  // because older/unrelated callers of this same shape may not send it — every
  // render site falls back to actor_id when absent, never shows literal `undefined`.
  actor_display_name?: string;
  action: string;
  from_value: string | null;
  to_value: string | null;
  comment: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface Ticket {
  id: string;
  ticket_number: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  source: string;
  created_by_type: string;
  created_by_id: string;
  assigned_to_type: string | null;
  assigned_to_id: string | null;
  // Resolved server-side by getTicketById() — see the Activity interface's
  // actor_display_name comment above for the same optionality/fallback rationale.
  assigned_to_display_name?: string | null;
  parent_ticket_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, any>;
  confidence: number | null;
  estimated_effort: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface SubTask {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
}

interface Props {
  ticketId: string;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_OPTIONS = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];
const PRIORITY_OPTIONS = ['critical', 'high', 'medium', 'low'];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITY_BADGES: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

const ACTION_ICONS: Record<string, string> = {
  created: 'plus-circle',
  status_changed: 'arrow-right-circle',
  assigned: 'person-plus',
  commented: 'chat-left-text',
  agent_output: 'robot',
  updated: 'pencil',
};

// ProofDesk Milestone 2 — Proof & Ticket Experience (spec §15.3). Six tabs replace the
// old single flat view. This task (T007) moves every pre-existing capability into the
// Technical tab unchanged, as a zero-regression structural refactor; T008-T011 fill in
// the other 5 tabs with real content on top of this shell.
type TabKey = 'story' | 'visual-proof' | 'work-graph' | 'decisions' | 'technical' | 'references';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'story', label: 'Story' },
  { key: 'visual-proof', label: 'Visual Proof' },
  { key: 'work-graph', label: 'Work Graph' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'technical', label: 'Technical' },
  { key: 'references', label: 'References' },
];

export default function TicketDetailModal({ ticketId, onClose, onUpdate }: Props) {
  const { token } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  // T008: default tab is now 'story', matching spec §15.3's tab order, now that the
  // Story tab has real content. Technical (the old flat view) remains one click away.
  const [activeTab, setActiveTab] = useState<TabKey>('story');

  useEffect(() => {
    fetchDetail();
  }, [ticketId]);

  async function fetchDetail() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTicket(data.ticket);
      setActivities(data.activities || []);
      setSubTasks(data.subTasks || []);
    } catch (err) {
      console.error('Failed to fetch ticket:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!ticket) return;
    try {
      await fetch(`/api/admin/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchDetail();
      onUpdate();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }

  async function handlePriorityChange(newPriority: string) {
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ priority: newPriority }),
      });
      fetchDetail();
      onUpdate();
    } catch (err) {
      console.error('Failed to update priority:', err);
    }
  }

  async function handleComment() {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/admin/tickets/${ticketId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment }),
      });
      setComment('');
      fetchDetail();
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDispatch() {
    setDispatching(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.dispatched) {
        fetchDetail();
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to dispatch:', err);
    } finally {
      setDispatching(false);
    }
  }

  function renderActivityLine(a: Activity) {
    switch (a.action) {
      case 'created':
        return <span>created this ticket</span>;
      case 'status_changed':
        return <span>changed status from <strong>{a.from_value}</strong> to <strong>{a.to_value}</strong></span>;
      case 'assigned':
        return <span>assigned to <strong>{a.to_value}</strong></span>;
      case 'commented':
        return <div><span>commented:</span><div className="bg-light p-2 rounded mt-1 small">{a.comment}</div></div>;
      case 'agent_output':
        return (
          <div>
            <span>agent output received</span>
            {a.metadata && (
              <div className="bg-light p-2 rounded mt-1 small font-monospace">
                {a.metadata.agent_name && <div>Agent: {a.metadata.agent_name}</div>}
                {a.metadata.duration_ms != null && <div>Duration: {a.metadata.duration_ms}ms</div>}
                {a.metadata.actions_taken != null && <div>Actions: {a.metadata.actions_taken}</div>}
                {a.metadata.errors?.length > 0 && <div className="text-danger">Errors: {a.metadata.errors.join(', ')}</div>}
              </div>
            )}
          </div>
        );
      case 'updated':
        return <span>updated {a.metadata?.fields_changed?.join(', ')}</span>;
      default:
        return <span>{a.action}</span>;
    }
  }

  function renderTechnicalTab() {
    // Everything the old flat view showed, unchanged: status/priority controls,
    // dispatch button, meta info, sub-tasks, full activity feed, comment box.
    if (!ticket) return null;
    return (
      <>
        {/* Controls */}
        <div className="row g-2 mb-3">
          <div className="col-auto">
            <label className="form-label small fw-medium mb-1">Status</label>
            <select className="form-select form-select-sm" value={ticket.status} onChange={(e) => handleStatusChange(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="col-auto">
            <label className="form-label small fw-medium mb-1">Priority</label>
            <select className="form-select form-select-sm" value={ticket.priority} onChange={(e) => handlePriorityChange(e.target.value)}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="col-auto d-flex align-items-end">
            <button className="btn btn-sm btn-outline-primary" onClick={handleDispatch} disabled={dispatching}>
              {dispatching ? 'Dispatching...' : 'Dispatch to Agent'}
            </button>
          </div>
        </div>

        {/* Meta info */}
        <div className="d-flex gap-3 flex-wrap mb-3 small text-muted">
          <span>Source: <strong>{ticket.source}</strong></span>
          {ticket.assigned_to_id && (
            <span>
              Assigned: <strong>{ticket.assigned_to_display_name || ticket.assigned_to_id}</strong>
              {/* Raw id kept visible for technical fidelity (this IS the Technical
                  tab) — but only as a secondary, muted parenthetical, never as the
                  only identifier a human sees. Omitted when it would just repeat
                  the name (no resolved name yet, or name === id). */}
              {ticket.assigned_to_display_name && ticket.assigned_to_display_name !== ticket.assigned_to_id && (
                <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>({ticket.assigned_to_id})</span>
              )}
            </span>
          )}
          {ticket.confidence != null && <span>Confidence: <strong>{ticket.confidence}%</strong></span>}
          {ticket.estimated_effort && <span>Effort: <strong>{ticket.estimated_effort}</strong></span>}
          <span>Created: <strong>{fmtCentralDateTime(ticket.created_at)}</strong></span>
          <span>Last activity: <strong>{timeAgo(ticket.updated_at)}</strong></span>
        </div>

        {/* Sub-tasks */}
        {subTasks.length > 0 && (
          <div className="mb-3">
            <h6 className="fw-semibold small mb-2">Sub-tasks ({subTasks.length})</h6>
            <div className="list-group list-group-flush">
              {subTasks.map((st) => (
                <div key={st.id} className="list-group-item px-0 py-1 d-flex align-items-center gap-2 small">
                  <span className={`badge bg-${st.status === 'done' ? 'success' : st.status === 'in_progress' ? 'primary' : 'secondary'}`} style={{ fontSize: '0.6rem', minWidth: 60 }}>
                    {st.status.replace('_', ' ')}
                  </span>
                  <span>TK-{st.ticket_number}</span>
                  <span className="text-truncate">{st.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Timeline */}
        <h6 className="fw-semibold small mb-2">Activity</h6>
        <div className="mb-3" style={{ maxHeight: 300, overflowY: 'auto' }}>
          {activities.map((a) => (
            <div key={a.id} className="d-flex gap-2 mb-2 small">
              <div className="text-muted" style={{ minWidth: 110, fontSize: '0.7rem' }}>{fmtCentralDateTime(a.created_at)}</div>
              <div>
                <span className={`badge bg-${a.actor_type === 'agent' ? 'info' : a.actor_type === 'cory' ? 'primary' : 'secondary'} me-1`} style={{ fontSize: '0.6rem' }}>
                  {a.actor_type}
                </span>
                {/* Resolved name is the visible text; the raw id moves to a hover
                    tooltip rather than disappearing — same "technical fidelity, but
                    never a bare UUID as the only identifier" rule as the Assigned
                    line above. */}
                <span className="text-muted me-1" style={{ fontSize: '0.7rem' }} title={a.actor_id}>
                  {a.actor_display_name || a.actor_id}
                </span>
                {renderActivityLine(a)}
              </div>
            </div>
          ))}
          {activities.length === 0 && <p className="text-muted small">No activity yet</p>}
        </div>

        {/* Comment input */}
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Add a comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleComment()}
          />
          <button className="btn btn-sm btn-outline-primary" onClick={handleComment} disabled={submitting || !comment.trim()}>
            {submitting ? '...' : 'Post'}
          </button>
        </div>
      </>
    );
  }

  function renderTabContent() {
    if (!ticket) return null;
    switch (activeTab) {
      case 'technical':
        return renderTechnicalTab();
      case 'story':
        return <StoryTab ticketId={ticketId} token={token} description={ticket.description} metadata={ticket.metadata} />;
      case 'visual-proof':
        return <VisualProofTab ticketId={ticketId} token={token} />;
      case 'work-graph':
        // ProofDesk Milestone 3: WorkGraphTab went from a static, no-props
        // placeholder (M2) to a real data-fetching component — same ticketId/
        // token props DecisionsTab/VisualProofTab already take, two lines away.
        return <WorkGraphTab ticketId={ticketId} token={token} />;
      case 'decisions':
        return <DecisionsTab ticketId={ticketId} token={token} />;
      case 'references':
        return <ReferencesTab ticket={ticket} />;
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <>
        <div className="modal-backdrop fade show" />
        <div className="modal show d-block" tabIndex={-1} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-body text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!ticket) return null;

  return (
    <>
      <div className="modal-backdrop fade show" onClick={onClose} />
      <div className="modal show d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <span className="text-muted small me-2">TK-{ticket.ticket_number}</span>
                <span className={`badge bg-${PRIORITY_BADGES[ticket.priority] || 'secondary'} me-2`}>{ticket.priority}</span>
                <span className="badge bg-secondary">{ticket.type}</span>
              </div>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>

            <div className="modal-body">
              <h5 className="fw-bold mb-2">{ticket.title}</h5>
              {ticket.description && <p className="text-muted small mb-3">{ticket.description}</p>}

              {/* Stale-ticket flag — "Anything over 3 days old should have a
                  valid reason why it's still open" (Ali, live feedback).
                  Visibility only: never auto-closes, never auto-escalates,
                  never changes status — see isTicketStale's own contract. */}
              {isTicketStale(ticket.updated_at, ticket.status) && (
                <div className="alert alert-warning d-flex align-items-center gap-2 mb-3" role="alert">
                  <StatusBadge label="Stale" tone="warning" icon="time-line" />
                  <span>
                    No activity in{' '}
                    {ticket.updated_at
                      ? Math.floor((Date.now() - new Date(ticket.updated_at).getTime()) / ONE_DAY_MS)
                      : '3+'}{' '}
                    days — needs a reason it&apos;s still open.
                  </span>
                </div>
              )}

              {/* Tab bar */}
              <ul className="nav nav-tabs mb-3" role="tablist">
                {TABS.map((t) => (
                  <li className="nav-item" key={t.key} role="presentation">
                    <button
                      type="button"
                      className={`nav-link${activeTab === t.key ? ' active' : ''}`}
                      onClick={() => setActiveTab(t.key)}
                      role="tab"
                      aria-selected={activeTab === t.key}
                    >
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>

              <div role="tabpanel">
                {renderTabContent()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
