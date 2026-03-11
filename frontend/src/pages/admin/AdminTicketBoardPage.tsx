import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import TicketDetailModal from '../../components/admin/TicketDetailModal';

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
  updated_at: string;
}

interface BoardData {
  backlog: Ticket[];
  todo: Ticket[];
  in_progress: Ticket[];
  in_review: Ticket[];
  done: Ticket[];
  cancelled: Ticket[];
}

interface Stats {
  total: number;
  open: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
}

const COLUMNS: Array<{ key: keyof BoardData; label: string; color: string }> = [
  { key: 'backlog', label: 'Backlog', color: 'secondary' },
  { key: 'todo', label: 'To Do', color: 'info' },
  { key: 'in_progress', label: 'In Progress', color: 'primary' },
  { key: 'in_review', label: 'In Review', color: 'warning' },
  { key: 'done', label: 'Done', color: 'success' },
];

const PRIORITY_BADGES: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

const TYPE_BADGES: Record<string, string> = {
  task: 'secondary',
  bug: 'danger',
  feature: 'success',
  curriculum: 'info',
  agent_action: 'primary',
  strategic: 'warning',
};

const SOURCE_ICONS: Record<string, string> = {
  cory: 'cpu',
  manual: 'person',
  system: 'gear',
};

export default function AdminTicketBoardPage() {
  const { token } = useAuth();
  const [board, setBoard] = useState<BoardData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTicket, setNewTicket] = useState({ title: '', description: '', priority: 'medium', type: 'task' });
  const [creating, setCreating] = useState(false);

  const fetchBoard = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterPriority) params.set('priority', filterPriority);
      if (filterType) params.set('type', filterType);
      if (filterSource) params.set('source', filterSource);

      const [boardRes, statsRes] = await Promise.all([
        fetch(`/api/admin/tickets/board?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/tickets/stats', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const boardData = await boardRes.json();
      const statsData = await statsRes.json();
      setBoard(boardData.board);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [token, filterPriority, filterType, filterSource]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    e.dataTransfer.setData('ticketId', ticketId);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData('ticketId');
    if (!ticketId) return;

    try {
      await fetch(`/api/admin/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchBoard();
    } catch (err) {
      console.error('Failed to update ticket status:', err);
    }
  };

  const handleCreate = async () => {
    if (!newTicket.title.trim()) return;
    setCreating(true);
    try {
      await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newTicket),
      });
      setShowCreateModal(false);
      setNewTicket({ title: '', description: '', priority: 'medium', type: 'task' });
      fetchBoard();
    } catch (err) {
      console.error('Failed to create ticket:', err);
    } finally {
      setCreating(false);
    }
  };

  const getSourceIcon = (source: string) => {
    if (source.startsWith('cory')) return 'cpu';
    if (source.startsWith('agent')) return 'robot';
    return SOURCE_ICONS[source] || 'tag';
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 400 }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading tickets...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-4 py-3">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>Ticket Board</h4>
          <p className="text-muted small mb-0">
            {stats ? `${stats.open} open · ${stats.total} total` : ''}
          </p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setShowCreateModal(true)}>
          + New Ticket
        </button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="row g-2 mb-3">
          {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
            <div key={p} className="col-auto">
              <span className={`badge bg-${PRIORITY_BADGES[p]} bg-opacity-10 text-${PRIORITY_BADGES[p]} border border-${PRIORITY_BADGES[p]} border-opacity-25`}>
                {p}: {stats.byPriority[p] || 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <select className="form-select form-select-sm" style={{ width: 140 }} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="form-select form-select-sm" style={{ width: 140 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="task">Task</option>
          <option value="bug">Bug</option>
          <option value="feature">Feature</option>
          <option value="curriculum">Curriculum</option>
          <option value="agent_action">Agent Action</option>
          <option value="strategic">Strategic</option>
        </select>
        <select className="form-select form-select-sm" style={{ width: 140 }} value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
          <option value="">All Sources</option>
          <option value="cory">Cory</option>
          <option value="manual">Manual</option>
          <option value="system">System</option>
        </select>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => { setFilterPriority(''); setFilterType(''); setFilterSource(''); }}>
          Clear
        </button>
      </div>

      {/* Kanban Board */}
      <div className="d-flex gap-3 overflow-auto pb-3" style={{ minHeight: 500 }}>
        {COLUMNS.map(({ key, label, color }) => (
          <div
            key={key}
            className="flex-shrink-0"
            style={{ width: 280, minWidth: 280 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, key)}
          >
            <div className="d-flex align-items-center mb-2">
              <span className={`badge bg-${color} me-2`}>{board?.[key]?.length || 0}</span>
              <span className="fw-semibold small">{label}</span>
            </div>
            <div className="d-flex flex-column gap-2" style={{ minHeight: 400 }}>
              {board?.[key]?.map((ticket) => (
                <div
                  key={ticket.id}
                  className="card border-0 shadow-sm"
                  style={{ cursor: 'pointer' }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, ticket.id)}
                  onClick={() => setSelectedTicket(ticket.id)}
                >
                  <div className="card-body p-2">
                    <div className="d-flex justify-content-between align-items-start mb-1">
                      <span className="text-muted" style={{ fontSize: '0.7rem' }}>TK-{ticket.ticket_number}</span>
                      <span className={`badge bg-${PRIORITY_BADGES[ticket.priority] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                        {ticket.priority}
                      </span>
                    </div>
                    <p className="mb-1 small fw-medium" style={{ lineHeight: 1.3 }}>{ticket.title}</p>
                    <div className="d-flex gap-1 flex-wrap">
                      <span className={`badge bg-${TYPE_BADGES[ticket.type] || 'secondary'} bg-opacity-75`} style={{ fontSize: '0.6rem' }}>
                        {ticket.type}
                      </span>
                      {ticket.assigned_to_id && (
                        <span className="badge bg-light text-dark" style={{ fontSize: '0.6rem' }}>
                          {ticket.assigned_to_id.length > 20 ? ticket.assigned_to_id.slice(0, 20) + '...' : ticket.assigned_to_id}
                        </span>
                      )}
                      {ticket.source.startsWith('cory') && (
                        <span className="badge bg-primary bg-opacity-10 text-primary" style={{ fontSize: '0.6rem' }}>Cory</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(!board?.[key] || board[key].length === 0) && (
                <div className="text-center text-muted small py-4 border border-dashed rounded" style={{ borderStyle: 'dashed' }}>
                  No tickets
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticketId={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdate={fetchBoard}
        />
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <>
          <div className="modal-backdrop fade show" />
          <div className="modal show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">New Ticket</h5>
                  <button type="button" className="btn-close" onClick={() => setShowCreateModal(false)} />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Title</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={newTicket.title}
                      onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                      placeholder="Ticket title..."
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Description</label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={3}
                      value={newTicket.description}
                      onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                      placeholder="Details..."
                    />
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-medium">Priority</label>
                      <select className="form-select form-select-sm" value={newTicket.priority} onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-medium">Type</label>
                      <select className="form-select form-select-sm" value={newTicket.type} onChange={(e) => setNewTicket({ ...newTicket, type: e.target.value })}>
                        <option value="task">Task</option>
                        <option value="bug">Bug</option>
                        <option value="feature">Feature</option>
                        <option value="curriculum">Curriculum</option>
                        <option value="strategic">Strategic</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                  <button className="btn btn-sm btn-primary" onClick={handleCreate} disabled={creating || !newTicket.title.trim()}>
                    {creating ? 'Creating...' : 'Create Ticket'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
