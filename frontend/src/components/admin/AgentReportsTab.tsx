import React, { useEffect, useState, useCallback } from 'react';
import { SectionCard, StatusBadge } from './shell';
import { timeAgo } from './shell/trust';
import {
  ReportSubscription, ReportRunHistory, ReportContentSection, ReportCadence,
  listReportSubscriptions, createReportSubscription, updateReportSubscription, getReportRuns,
} from '../../services/agentReportSubscriptionApi';

// AI Agent Dashboard redesign, Checkpoint C, Reports slice (2026-09-02) —
// the other half of "Talk & Reports". Report subscriptions (already real,
// already tested, zero prior frontend consumers) plus the brand-new
// delivery-history endpoint this checkpoint added. successRatePct === null
// renders as "Not enough data yet" — never a fabricated 0% or 100% — and a
// failed run's real error_message is always shown, never hidden behind a
// bare status badge.

interface Props {
  agentId: string;
}

const CONTENT_SECTIONS: ReportContentSection[] = ['cost', 'activity', 'trust', 'tickets'];
const CADENCES: ReportCadence[] = ['daily', 'weekly'];

export default function AgentReportsTab({ agentId }: Props) {
  const [subscriptions, setSubscriptions] = useState<ReportSubscription[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [subsError, setSubsError] = useState<string | null>(null);

  const [history, setHistory] = useState<ReportRunHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [formSections, setFormSections] = useState<ReportContentSection[]>([]);
  const [formCadence, setFormCadence] = useState<ReportCadence>('daily');
  const [formHour, setFormHour] = useState(8);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    setSubsLoading(true);
    setSubsError(null);
    try {
      setSubscriptions(await listReportSubscriptions(agentId));
    } catch (err: any) {
      setSubsError(err?.response?.data?.error || 'Failed to load report subscriptions');
    } finally {
      setSubsLoading(false);
    }
  }, [agentId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await getReportRuns(agentId));
    } catch (err: any) {
      setHistoryError(err?.response?.data?.error || 'Failed to load delivery history');
    } finally {
      setHistoryLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleToggle = useCallback(async (sub: ReportSubscription) => {
    setTogglingId(sub.id);
    try {
      await updateReportSubscription(agentId, sub.id, { enabled: !sub.enabled });
      await fetchSubscriptions();
    } catch (err: any) {
      setSubsError(err?.response?.data?.error || 'Failed to update subscription');
    } finally {
      setTogglingId(null);
    }
  }, [agentId, fetchSubscriptions]);

  const toggleSection = (section: ReportContentSection) => {
    setFormSections((prev) => (prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]));
  };

  const handleCreate = useCallback(async () => {
    if (formSections.length === 0) {
      setCreateError('Choose at least one section.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createReportSubscription(agentId, { contentScope: formSections, cadence: formCadence, deliveryHourLocal: formHour });
      setFormSections([]);
      setFormCadence('daily');
      setFormHour(8);
      await fetchSubscriptions();
    } catch (err: any) {
      setCreateError(err?.response?.data?.error || 'Failed to create subscription');
    } finally {
      setCreating(false);
    }
  }, [agentId, formSections, formCadence, formHour, fetchSubscriptions]);

  return (
    <>
      <SectionCard title="Report Subscriptions" icon="mail-send-line" padded={false}>
        {subsError && <div className="p-3"><div className="alert alert-warning py-2 mb-0 small">{subsError}</div></div>}
        {subsLoading && <div className="p-3 text-muted small">Loading…</div>}
        {!subsLoading && subscriptions.length === 0 && (
          <p className="text-muted small text-center py-4 mb-0">No one has subscribed to reports about this agent yet.</p>
        )}
        {!subsLoading && subscriptions.map((sub, i) => (
          <div key={sub.id} className={`d-flex align-items-start justify-content-between gap-2 p-3 ${i < subscriptions.length - 1 ? 'border-bottom' : ''}`}>
            <div>
              <StatusBadge label={sub.enabled ? 'Enabled' : 'Disabled'} tone={sub.enabled ? 'success' : 'neutral'} />
              <span className="ms-2 fw-semibold">{sub.cadence === 'daily' ? 'Daily' : 'Weekly'} · {String(sub.deliveryHourLocal).padStart(2, '0')}:00 {sub.timezone}</span>
              <div className="text-muted small mt-1">
                Sections: {sub.contentScope.join(', ')} · Created by {sub.createdByEmail}, {timeAgo(sub.createdAt)}
              </div>
            </div>
            <button className="btn btn-outline-secondary btn-sm flex-shrink-0" disabled={togglingId === sub.id} onClick={() => handleToggle(sub)}>
              {togglingId === sub.id ? 'Working…' : sub.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        ))}

        <div className="p-3 border-top">
          {createError && <div className="alert alert-danger py-2 small">{createError}</div>}
          <label className="form-label small fw-semibold">Sections</label>
          <div className="d-flex gap-3 mb-2 flex-wrap">
            {CONTENT_SECTIONS.map((s) => (
              <div className="form-check" key={s}>
                <input className="form-check-input" type="checkbox" id={`section-${s}`} checked={formSections.includes(s)} onChange={() => toggleSection(s)} />
                <label className="form-check-label small" htmlFor={`section-${s}`}>{s}</label>
              </div>
            ))}
          </div>
          <div className="row g-2 align-items-end">
            <div className="col-auto">
              <label className="form-label small fw-semibold">Cadence</label>
              <select className="form-select form-select-sm" value={formCadence} onChange={(e) => setFormCadence(e.target.value as ReportCadence)}>
                {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-auto">
              <label className="form-label small fw-semibold">Hour (local, 0-23)</label>
              <input type="number" min={0} max={23} className="form-control form-control-sm" style={{ width: '5rem' }} value={formHour} onChange={(e) => setFormHour(Number(e.target.value))} />
            </div>
            <div className="col-auto">
              <button className="btn btn-primary btn-sm" disabled={creating} onClick={handleCreate}>
                {creating ? 'Creating…' : 'Subscribe'}
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Delivery History" icon="history-line" subtitle="Real send attempts, last 30 days.">
        {historyError && <div className="alert alert-warning py-2 small">{historyError}</div>}
        {historyLoading && <div className="text-muted small">Loading…</div>}
        {!historyLoading && history && (
          <>
            <div className="row g-3 mb-3">
              <div className="col-6 col-md-3">
                <div className="border rounded p-2 text-center">
                  <div className="fs-4 fw-bold">{history.sent}</div>
                  <div className="text-muted small">Sent</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="border rounded p-2 text-center">
                  <div className="fs-4 fw-bold">{history.failed}</div>
                  <div className="text-muted small">Failed</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="border rounded p-2 text-center">
                  <div className="fs-4 fw-bold">{history.pending}</div>
                  <div className="text-muted small">Pending</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="border rounded p-2 text-center">
                  <div className="fs-4 fw-bold">{history.successRatePct === null ? '—' : `${history.successRatePct}%`}</div>
                  <div className="text-muted small">{history.successRatePct === null ? 'Not enough data yet' : 'Success rate'}</div>
                </div>
              </div>
            </div>
            {history.runs.length === 0 ? (
              <p className="text-muted small text-center py-3 mb-0">No delivery attempts in the last {history.windowDays} days.</p>
            ) : (
              <table className="table table-sm mb-0">
                <thead><tr><th>Period</th><th>Status</th><th>Generated</th><th>Detail</th></tr></thead>
                <tbody>
                  {history.runs.map((run) => (
                    <tr key={run.id}>
                      <td>{run.periodKey}</td>
                      <td><StatusBadge label={run.deliveryStatus} tone={run.deliveryStatus === 'sent' ? 'success' : run.deliveryStatus === 'failed' ? 'danger' : 'warning'} /></td>
                      <td>{timeAgo(run.generatedAt)}</td>
                      <td className="text-muted small">{run.errorMessage || (run.deliveredAt ? `Delivered ${timeAgo(run.deliveredAt)}` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </SectionCard>
    </>
  );
}
