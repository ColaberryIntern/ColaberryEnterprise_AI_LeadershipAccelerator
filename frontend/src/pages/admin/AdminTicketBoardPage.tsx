import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import TicketDetailModal from '../../components/admin/TicketDetailModal';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

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

type Tone = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

// Board columns. Each column accent maps to a brand chart token in column order,
// replacing the old Bootstrap color-name strings.
const COLUMNS: Array<{ key: keyof BoardData; label: string }> = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'In Review' },
  { key: 'done', label: 'Done' },
];

const columnColor = (index: number): string => `var(--chart-${(index % 7) + 1})`;

// Priority -> StatusBadge tone (replaces hardcoded bg-* badge classes).
const PRIORITY_TONE: Record<string, Tone> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

// Ticket type -> StatusBadge tone.
const TYPE_TONE: Record<string, Tone> = {
  task: 'neutral',
  bug: 'danger',
  feature: 'success',
  curriculum: 'info',
  agent_action: 'primary',
  strategic: 'warning',
};

const SOURCE_ICONS: Record<string, string> = {
  cory: 'cpu-line',
  manual: 'user-line',
  system: 'settings-3-line',
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
    if (source.startsWith('cory')) return 'cpu-line';
    if (source.startsWith('agent')) return 'robot-line';
    return SOURCE_ICONS[source] || 'price-tag-3-line';
  };

  // Per-page trust signal (Basecamp todo 10027085963) derived from ticket stats.
  const trust: TrustSignal = useMemo(() => {
    const total = stats?.total ?? 0;
    const open = stats?.open ?? 0;
    return {
      level: 'live',
      source: 'tickets',
      updatedAt: new Date().toISOString(),
      summary: `${open} open of ${total} total tickets across the board.`,
      href: '/admin/trust',
      pillars: [
        {
          name: 'Coverage',
          status: 'live',
          evidence: [{ label: 'Open / total', value: `${open}/${total}` }],
        },
      ],
    };
  }, [stats]);

  const kpiRow = (
    <div className="row g-3">
      <div className="col-6 col-lg-3">
        <StatCard label="Total" value={stats?.total ?? 0} icon="ticket-2-line" tone="info" />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard label="Open" value={stats?.open ?? 0} icon="record-circle-line" tone="primary" />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard label="Critical" value={stats?.byPriority?.critical ?? 0} icon="alarm-warning-line" tone={stats?.byPriority?.critical ? 'danger' : 'neutral'} />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard label="Done" value={stats?.byStatus?.done ?? 0} icon="checkbox-circle-line" tone="success" />
      </div>
    </div>
  );

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
    <>
      <PageHeader
        title="Tickets"
        icon="ticket-2-line"
        subtitle="Drag tickets between columns to update their status."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Tickets' }]}
        trust={trust}
        actions={
          <button className="btn btn-sm btn-primary" onClick={() => setShowCreateModal(true)}>
            <i className="ri-add-line" aria-hidden="true" /> New Ticket
          </button>
        }
      >
        {kpiRow}
      </PageHeader>

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
      <SectionCard padded={false} className="admin-section-card--bare">
        <div className="d-flex gap-3 overflow-auto p-3" style={{ minHeight: 500 }}>
          {COLUMNS.map(({ key, label }, index) => (
            <div
              key={key}
              className="flex-shrink-0"
              style={{ width: 280, minWidth: 280 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, key)}
            >
              <div
                className="rounded-top px-3 py-2 text-white fw-bold small d-flex justify-content-between align-items-center"
                style={{ backgroundColor: columnColor(index) } as React.CSSProperties}
              >
                <span>{label}</span>
                <StatusBadge label={String(board?.[key]?.length || 0)} tone="neutral" />
              </div>
              <div
                className="rounded-bottom p-2 d-flex flex-column gap-2"
                style={{ minHeight: 400, background: 'var(--surface-subtle)' }}
              >
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
                        <StatusBadge label={ticket.priority} tone={PRIORITY_TONE[ticket.priority] || 'neutral'} />
                      </div>
                      <p className="mb-1 small fw-medium" style={{ lineHeight: 1.3 }}>{ticket.title}</p>
                      <div className="d-flex gap-1 flex-wrap align-items-center">
                        <StatusBadge label={ticket.type} tone={TYPE_TONE[ticket.type] || 'neutral'} />
                        {ticket.assigned_to_id && (
                          <StatusBadge
                            label={ticket.assigned_to_id.length > 20 ? ticket.assigned_to_id.slice(0, 20) + '...' : ticket.assigned_to_id}
                            tone="neutral"
                          />
                        )}
                        {ticket.source.startsWith('cory') && (
                          <StatusBadge label="Cory" tone="primary" icon={getSourceIcon(ticket.source)} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {(!board?.[key] || board[key].length === 0) && (
                  <div className="text-center text-muted small py-4 border rounded" style={{ borderStyle: 'dashed' }}>
                    No tickets
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

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
    </>
  );
}
