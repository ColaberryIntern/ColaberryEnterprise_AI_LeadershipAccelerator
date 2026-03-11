import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface Activity {
  id: string;
  actor_type: string;
  actor_id: string;
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
  parent_ticket_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, any>;
  confidence: number | null;
  estimated_effort: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
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

export default function TicketDetailModal({ ticketId, onClose, onUpdate }: Props) {
  const { token } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dispatching, setDispatching] = useState(false);

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

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
                {ticket.assigned_to_id && <span>Assigned: <strong>{ticket.assigned_to_id}</strong></span>}
                {ticket.confidence != null && <span>Confidence: <strong>{ticket.confidence}%</strong></span>}
                {ticket.estimated_effort && <span>Effort: <strong>{ticket.estimated_effort}</strong></span>}
                <span>Created: <strong>{formatDate(ticket.created_at)}</strong></span>
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
                    <div className="text-muted" style={{ minWidth: 100, fontSize: '0.7rem' }}>{formatDate(a.created_at)}</div>
                    <div>
                      <span className={`badge bg-${a.actor_type === 'agent' ? 'info' : a.actor_type === 'cory' ? 'primary' : 'secondary'} me-1`} style={{ fontSize: '0.6rem' }}>
                        {a.actor_type}
                      </span>
                      <span className="text-muted me-1" style={{ fontSize: '0.7rem' }}>{a.actor_id}</span>
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
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
