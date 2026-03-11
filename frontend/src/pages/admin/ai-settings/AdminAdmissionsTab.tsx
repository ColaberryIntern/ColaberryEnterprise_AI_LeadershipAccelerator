import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';

interface AdmissionsStats {
  total_conversations_today: number;
  active_now: number;
  returning_visitors: number;
  high_intent: number;
  enterprise_prospects: number;
  visitor_types: Record<string, number>;
}

interface Conversation {
  id: string;
  visitor_type: string;
  page_category: string;
  message_count: number;
  summary: string;
  created_at: string;
  lead_email?: string;
  lead_name?: string;
}

interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  priority: number;
  active: boolean;
}

interface OpsStats {
  documents_sent_today: number;
  calls_scheduled_today: number;
  callbacks_pending: number;
  emails_sent_today: number;
  sms_sent_today: number;
  governance_denials_today: number;
  pending_actions: number;
}

interface CallbackEntry {
  id: string;
  visitor_id: string;
  callback_status: string;
  request_timestamp: string;
  requested_time: string | null;
  scheduled_time: string | null;
}

interface CallLogEntry {
  id: string;
  visitor_id: string;
  call_type: string;
  call_status: string;
  call_timestamp: string;
  reason_for_call: string;
}

interface DocumentEntry {
  id: string;
  visitor_id: string;
  document_type: string;
  delivery_method: string;
  recipient_email: string | null;
  status: string;
  created_at: string;
}

const VISITOR_TYPE_COLORS: Record<string, string> = {
  ceo: 'danger',
  executive: 'warning',
  manager: 'info',
  individual: 'secondary',
  student: 'success',
  unknown: 'secondary',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminAdmissionsTab() {
  const [stats, setStats] = useState<AdmissionsStats | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [opsStats, setOpsStats] = useState<OpsStats | null>(null);
  const [callbacks, setCallbacks] = useState<CallbackEntry[]>([]);
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, convRes, kbRes, opsRes, cbRes, clRes, docRes] = await Promise.allSettled([
        api.get('/api/admin/admissions/stats'),
        api.get('/api/admin/admissions/conversations'),
        api.get('/api/admin/admissions/knowledge'),
        api.get('/api/admin/admissions/operations'),
        api.get('/api/admin/admissions/callbacks'),
        api.get('/api/admin/admissions/call-log'),
        api.get('/api/admin/admissions/documents'),
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (convRes.status === 'fulfilled') setConversations(convRes.value.data);
      if (kbRes.status === 'fulfilled') setKnowledge(kbRes.value.data);
      if (opsRes.status === 'fulfilled') setOpsStats(opsRes.value.data);
      if (cbRes.status === 'fulfilled') setCallbacks(cbRes.value.data?.callbacks || []);
      if (clRes.status === 'fulfilled') setCallLog(clRes.value.data?.calls || []);
      if (docRes.status === 'fulfilled') setDocuments(docRes.value.data?.documents || []);
    } catch (err) {
      console.error('Failed to fetch admissions data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading admissions data...</span>
        </div>
      </div>
    );
  }

  const summaryCards = [
    { label: 'Total Conversations Today', value: stats?.total_conversations_today ?? 0, color: 'primary' },
    { label: 'Active Now', value: stats?.active_now ?? 0, color: 'success' },
    { label: 'Returning Visitors', value: stats?.returning_visitors ?? 0, color: 'info' },
    { label: 'High-Intent', value: stats?.high_intent ?? 0, color: 'warning' },
    { label: 'Enterprise Prospects', value: stats?.enterprise_prospects ?? 0, color: 'danger' },
  ];

  return (
    <>
      {/* Summary Cards */}
      <div className="row g-3 mb-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="col">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body text-center py-3">
                <div
                  className="fw-bold mb-1"
                  style={{ fontSize: '1.75rem', color: `var(--color-primary, #1a365d)` }}
                >
                  {card.value}
                </div>
                <div className="text-muted small">{card.label}</div>
              </div>
              <div
                style={{
                  height: '3px',
                  backgroundColor: `var(--bs-${card.color}, #6c757d)`,
                  borderRadius: '0 0 4px 4px',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Visitor Type Distribution */}
      {stats?.visitor_types && Object.keys(stats.visitor_types).length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Visitor Type Distribution</div>
          <div className="card-body">
            <div className="d-flex gap-2 flex-wrap">
              {Object.entries(stats.visitor_types).map(([type, count]) => (
                <span
                  key={type}
                  className={`badge bg-${VISITOR_TYPE_COLORS[type] || 'secondary'}`}
                  style={{ fontSize: '0.85rem' }}
                >
                  {type}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Conversations */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Recent Conversations</span>
          <span className="badge bg-secondary">{conversations.length}</span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Visitor Type</th>
                  <th>Page Category</th>
                  <th>Messages</th>
                  <th>Summary</th>
                  <th>Time</th>
                  <th>Lead Info</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((conv) => (
                  <tr key={conv.id}>
                    <td>
                      <span className={`badge bg-${VISITOR_TYPE_COLORS[conv.visitor_type] || 'secondary'}`}>
                        {conv.visitor_type || 'unknown'}
                      </span>
                    </td>
                    <td className="text-muted">{conv.page_category || '—'}</td>
                    <td>{conv.message_count}</td>
                    <td style={{ maxWidth: '250px' }}>
                      <span className="text-truncate d-inline-block" style={{ maxWidth: '250px' }}>
                        {conv.summary || '—'}
                      </span>
                    </td>
                    <td className="text-muted text-nowrap">{timeAgo(conv.created_at)}</td>
                    <td>
                      {conv.lead_email ? (
                        <span className="text-muted">
                          {conv.lead_name && <span className="fw-medium">{conv.lead_name} </span>}
                          {conv.lead_email}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {conversations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted text-center py-4">
                      No conversations yet today
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Operational Actions */}
      {opsStats && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Operational Actions (Today)</div>
          <div className="card-body">
            <div className="row g-3">
              {[
                { label: 'Documents Sent', value: opsStats.documents_sent_today, color: 'primary' },
                { label: 'Calls Scheduled', value: opsStats.calls_scheduled_today, color: 'success' },
                { label: 'Callbacks Pending', value: opsStats.callbacks_pending, color: 'warning' },
                { label: 'Emails Sent', value: opsStats.emails_sent_today, color: 'info' },
                { label: 'SMS Sent', value: opsStats.sms_sent_today, color: 'secondary' },
                { label: 'Governance Denials', value: opsStats.governance_denials_today, color: 'danger' },
              ].map((card) => (
                <div key={card.label} className="col-md-2 col-sm-4">
                  <div className="text-center">
                    <div className={`fw-bold fs-4 text-${card.color}`}>{card.value}</div>
                    <div className="text-muted small">{card.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Callback Requests */}
      {callbacks.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Callback Requests</span>
            <span className="badge bg-warning">{callbacks.length}</span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th>Visitor</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th>Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {callbacks.map((cb) => (
                    <tr key={cb.id}>
                      <td className="text-muted">{cb.visitor_id.substring(0, 12)}...</td>
                      <td>
                        <span className={`badge bg-${cb.callback_status === 'completed' ? 'success' : cb.callback_status === 'scheduled' ? 'info' : 'warning'}`}>
                          {cb.callback_status}
                        </span>
                      </td>
                      <td className="text-muted text-nowrap">{timeAgo(cb.request_timestamp)}</td>
                      <td className="text-muted text-nowrap">{cb.scheduled_time ? timeAgo(cb.scheduled_time) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Calls */}
      {callLog.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Call Log (7 days)</span>
            <span className="badge bg-secondary">{callLog.length}</span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th>Visitor</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {callLog.map((cl) => (
                    <tr key={cl.id}>
                      <td className="text-muted">{cl.visitor_id.substring(0, 12)}...</td>
                      <td><span className="badge bg-info">{cl.call_type}</span></td>
                      <td>
                        <span className={`badge bg-${cl.call_status === 'completed' ? 'success' : cl.call_status === 'denied' ? 'danger' : 'warning'}`}>
                          {cl.call_status}
                        </span>
                      </td>
                      <td style={{ maxWidth: '200px' }}>
                        <span className="text-truncate d-inline-block" style={{ maxWidth: '200px' }}>
                          {cl.reason_for_call}
                        </span>
                      </td>
                      <td className="text-muted text-nowrap">{timeAgo(cl.call_timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Documents Delivered */}
      {documents.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Documents Delivered (7 days)</span>
            <span className="badge bg-secondary">{documents.length}</span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th>Visitor</th>
                    <th>Document</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="text-muted">{doc.visitor_id.substring(0, 12)}...</td>
                      <td><span className="badge bg-primary">{doc.document_type.replace(/_/g, ' ')}</span></td>
                      <td className="text-muted">{doc.delivery_method}</td>
                      <td>
                        <span className={`badge bg-${doc.status === 'sent' ? 'success' : 'danger'}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="text-muted text-nowrap">{timeAgo(doc.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Knowledge Base */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Knowledge Base</span>
          <span className="badge bg-secondary">{knowledge.length} entries</span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Category</th>
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {knowledge.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <span className="badge bg-info">{entry.category}</span>
                    </td>
                    <td className="fw-medium">{entry.title}</td>
                    <td>
                      <span className={`badge bg-${entry.priority <= 1 ? 'danger' : entry.priority <= 3 ? 'warning' : 'secondary'}`}>
                        P{entry.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`badge bg-${entry.active ? 'success' : 'secondary'}`}>
                        {entry.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
                {knowledge.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-muted text-center py-4">
                      No knowledge base entries
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
