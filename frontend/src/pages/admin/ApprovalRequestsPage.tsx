import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard, StatusBadge } from '../../components/admin/shell';
import { timeAgo } from '../../components/admin/shell/trust';
import {
  ApprovalRequestItem,
  listApprovalRequests,
  approveApprovalRequestItem,
  rejectApprovalRequestItem,
  bulkApproveApprovalRequestItems,
} from '../../services/approvalRequestApi';

// Real-enforcement scoping, Phase 1 (2026-09-20) — the first real UI anyone
// can use to approve/reject a real ApprovalRequest. The backend routes have
// existed since Phase 1 slice 1; no page ever called them until this one.
//
// Approve has a real, immediate, irreversible effect once Phase 1 ships in
// full (the replay executor actually sends the held message) — this page
// says so plainly, not as boilerplate. prepared_action is shown verbatim,
// never summarized away, so a reviewer can see exactly what would send
// before clicking Approve.

function VerdictBadge({ verdict }: { verdict: ApprovalRequestItem['verdict'] }) {
  const tone = verdict === 'would_block' ? 'danger' : verdict === 'would_require_approval' ? 'warning' : 'success';
  return <StatusBadge label={verdict.replace(/_/g, ' ')} tone={tone} />;
}

export default function ApprovalRequestsPage() {
  const [items, setItems] = useState<ApprovalRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const real = await listApprovalRequests();
      setItems(real);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load approval requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleApprove = useCallback(async (id: string) => {
    setDecidingId(id);
    setDecisionError(null);
    try {
      await approveApprovalRequestItem(id);
      await load();
    } catch (err: any) {
      setDecisionError(err?.response?.data?.error || 'Failed to approve this request.');
    } finally {
      setDecidingId(null);
    }
  }, [load]);

  const handleReject = useCallback(async (id: string) => {
    setDecidingId(id);
    setDecisionError(null);
    try {
      await rejectApprovalRequestItem(id);
      await load();
    } catch (err: any) {
      setDecisionError(err?.response?.data?.error || 'Failed to reject this request.');
    } finally {
      setDecidingId(null);
    }
  }, [load]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkApprove = useCallback(async () => {
    setBulkBusy(true);
    setDecisionError(null);
    try {
      await bulkApproveApprovalRequestItems(Array.from(selected));
      setSelected(new Set());
      await load();
    } catch (err: any) {
      setDecisionError(err?.response?.data?.error || 'Failed to bulk-approve.');
    } finally {
      setBulkBusy(false);
    }
  }, [selected, load]);

  return (
    <div className="container-fluid py-4">
      <SectionCard
        title="Approval Requests"
        icon="shield-check-line"
        subtitle="Real agent actions held for human review. Approve sends the real held action — see exactly what before you click."
        actions={selected.size > 0 ? (
          <button className="btn btn-sm btn-primary" disabled={bulkBusy} onClick={handleBulkApprove}>
            {bulkBusy ? 'Working…' : `Approve ${selected.size} selected`}
          </button>
        ) : undefined}
        padded={false}
      >
        {loading && (
          <div className="p-3 text-muted small">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Loading…
          </div>
        )}
        {error && (
          <div className="p-3">
            <div className="alert alert-warning py-2 mb-0 small">{error}</div>
          </div>
        )}
        {decisionError && (
          <div className="p-3 pb-0">
            <div className="alert alert-danger py-2 mb-0 small">{decisionError}</div>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="text-muted small text-center py-4 mb-0">Nothing is waiting for review right now.</p>
        )}
        {!loading && !error && items.map((item, i) => (
          <div key={item.id} className={`p-3 ${i < items.length - 1 ? 'border-bottom' : ''}`}>
            <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap mb-2">
              <div className="d-flex align-items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelected(item.id)}
                  aria-label={`Select ${item.agent_name} — ${item.action}`}
                />
                <strong>{item.agent_name}</strong>
                <span className="text-muted">· {item.action}</span>
              </div>
              <VerdictBadge verdict={item.verdict} />
            </div>
            <dl className="row small mb-2">
              <dt className="col-sm-3">Risk tier</dt>
              <dd className="col-sm-9">{item.risk_tier}</dd>
              <dt className="col-sm-3">Reason</dt>
              <dd className="col-sm-9">{item.reason_code || '—'}</dd>
              <dt className="col-sm-3">Expires</dt>
              <dd className="col-sm-9">{item.expires_at ? timeAgo(item.expires_at) : 'No expiration set'}</dd>
              <dt className="col-sm-3">What would send</dt>
              <dd className="col-sm-9">
                {item.prepared_action
                  ? <pre className="mb-0 small bg-light p-2 rounded">{JSON.stringify(item.prepared_action, null, 2)}</pre>
                  : <span className="text-muted">Nothing recorded — approving this will not send anything.</span>}
              </dd>
            </dl>
            <div className="alert alert-warning py-2 small mb-2">
              <i className="ri-error-warning-line" aria-hidden="true" /> Approve has a real, immediate effect — it
              sends the message shown above. This cannot be undone once sent.
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary btn-sm" disabled={decidingId === item.id} onClick={() => handleApprove(item.id)}>
                {decidingId === item.id ? 'Working…' : 'Approve'}
              </button>
              <button className="btn btn-outline-danger btn-sm" disabled={decidingId === item.id} onClick={() => handleReject(item.id)}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}
