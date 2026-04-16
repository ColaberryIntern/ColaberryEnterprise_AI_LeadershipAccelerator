import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';
import { useToast } from '../../../components/ui/ToastProvider';
import DraftEditor from '../../../components/admin/inbox/DraftEditor';

type DraftStatus = 'pending_approval' | 'sent' | 'rejected';

interface Draft {
  draft: {
    id: string;
    email_id: string;
    draft_body: string;
    draft_subject: string;
    reply_to_address: string;
    status: DraftStatus;
    created_at: string;
    edited_body?: string;
  };
  email: {
    id: string;
    from_name: string;
    from_address: string;
    subject: string;
    body_text: string;
    received_at: string;
    provider: string;
    has_attachments: boolean;
  } | null;
}

export default function InboxDraftApprovalPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<DraftStatus>('pending_approval');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const fetchDrafts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/api/admin/inbox/drafts', { params: { status: tab } });
      setDrafts(res.data.results || res.data.drafts || []);
      if (tab === 'pending_approval') {
        setPendingCount(res.data.total || res.data.results?.length || 0);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load drafts');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  // Fetch pending count separately when on other tabs
  useEffect(() => {
    if (tab !== 'pending_approval') {
      api.get('/api/admin/inbox/drafts', { params: { status: 'pending_approval' } })
        .then((res) => setPendingCount(res.data.total || res.data.results?.length || 0))
        .catch(() => {});
    }
  }, [tab]);

  const handleApprove = async (draftId: number, editedBody?: string) => {
    try {
      const payload: Record<string, string> = {};
      if (editedBody) payload.edited_body = editedBody;
      await api.post(`/api/admin/inbox/drafts/${draftId}/approve`, payload);
      showToast('Draft approved and sent', 'success');
      setExpandedId(null);
      fetchDrafts();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Approve failed', 'error');
    }
  };

  const handleReject = async (draftId: number) => {
    try {
      await api.post(`/api/admin/inbox/drafts/${draftId}/reject`, {});
      showToast('Draft rejected', 'success');
      setExpandedId(null);
      fetchDrafts();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Reject failed', 'error');
    }
  };

  return (
    <div>
      <h4 className="mb-3">Draft Approvals</h4>

      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${tab === 'pending_approval' ? 'active' : ''}`}
            onClick={() => setTab('pending_approval')}
          >
            Pending
            {pendingCount > 0 && (
              <span className="badge bg-danger ms-2">{pendingCount}</span>
            )}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${tab === 'sent' ? 'active' : ''}`}
            onClick={() => setTab('sent')}
          >
            Sent
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${tab === 'rejected' ? 'active' : ''}`}
            onClick={() => setTab('rejected')}
          >
            Rejected
          </button>
        </li>
      </ul>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-5 text-muted">No drafts found.</div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Original Subject</th>
                  <th>From</th>
                  <th>Draft Preview</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <React.Fragment key={d.draft.id}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedId(expandedId === d.draft.id ? null : d.draft.id)}
                      className={expandedId === d.draft.id ? 'table-active' : ''}
                    >
                      <td className="small fw-medium">{d.email?.subject || d.draft.draft_subject}</td>
                      <td className="small">{d.email?.from_name || d.draft.reply_to_address}</td>
                      <td className="small text-muted text-truncate" style={{ maxWidth: 300 }}>
                        {d.draft.draft_body?.slice(0, 100)}
                        {(d.draft.draft_body?.length || 0) > 100 ? '...' : ''}
                      </td>
                      <td className="small text-muted">{d.draft.created_at ? new Date(d.draft.created_at).toLocaleString() : '--'}</td>
                    </tr>
                    {expandedId === d.draft.id && (
                      <tr>
                        <td colSpan={4} className="p-3 bg-light">
                          <DraftEditor
                            originalEmail={d.email}
                            draft={d.draft}
                            onApprove={(editedBody) => handleApprove(d.draft.id, editedBody)}
                            onReject={() => handleReject(d.draft.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
