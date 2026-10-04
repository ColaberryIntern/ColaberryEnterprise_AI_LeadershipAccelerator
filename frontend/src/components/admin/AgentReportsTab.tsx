import React, { useEffect, useState, useCallback } from 'react';
import { timeAgo } from './shell/trust';
import { adv2PillClass } from './agentDetailV2/adv2PillTone';
import {
  ReportSubscription, ReportRunHistory, ReportContentSection, ReportCadence, ReportPreview,
  listReportSubscriptions, createReportSubscription, updateReportSubscription, getReportRuns, getReportPreview,
} from '../../services/agentReportSubscriptionApi';

// AI Agent Dashboard redesign, Checkpoint C, Reports slice (2026-09-02) —
// the other half of "Talk & Reports". Report subscriptions (already real,
// already tested, zero prior frontend consumers) plus the brand-new
// delivery-history endpoint this checkpoint added. successRatePct === null
// renders as "Not enough data yet" — never a fabricated 0% or 100% — and a
// failed run's real error_message is always shown, never hidden behind a
// bare status badge.
//
// Track A2 (2026-09-22) — reflowed from SectionCard/StatusBadge/Bootstrap to
// this page's adv2-* visual language, matching Ali's real mockup
// (preview (3).html's "Results & reports" sub-tab). Zero change to any API
// call, request shape, or the honest null-handling above — restyle only.

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

  // Checkpoint G (2026-09-10) — Ali: "you can schedule a report but have no
  // idea what it even looks like." Renders the real content for exactly
  // the sections currently checked in the form, via the same code path the
  // real delivery cron uses — never a mockup.
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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
    setPreview(null);
    setPreviewError(null);
  };

  const handlePreview = useCallback(async () => {
    if (formSections.length === 0) {
      setPreviewError('Choose at least one section.');
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      setPreview(await getReportPreview(agentId, formSections));
    } catch (err: any) {
      setPreviewError(err?.response?.data?.error || 'Failed to render preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [agentId, formSections]);

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
      setPreview(null);
      setPreviewError(null);
      await fetchSubscriptions();
    } catch (err: any) {
      setCreateError(err?.response?.data?.error || 'Failed to create subscription');
    } finally {
      setCreating(false);
    }
  }, [agentId, formSections, formCadence, formHour, fetchSubscriptions]);

  return (
    <>
      <div className="adv2-card">
        <h2>Report Subscriptions</h2>
        <div>
          {subsError && <p className="adv2-body" style={{ color: 'var(--adv2-bad)' }}>{subsError}</p>}
          {subsLoading && <p className="adv2-body adv2-muted">Loading…</p>}
          {!subsLoading && subscriptions.length === 0 && (
            <p className="adv2-body adv2-muted">No one has subscribed to reports about this agent yet.</p>
          )}
          {!subsLoading && subscriptions.map((sub) => (
            <div key={sub.id} className="adv2-task">
              <div>
                <span className={adv2PillClass(sub.enabled ? 'success' : 'neutral')}>{sub.enabled ? 'Enabled' : 'Disabled'}</span>
                <span style={{ marginLeft: 8, fontWeight: 600 }}>{sub.cadence === 'daily' ? 'Daily' : 'Weekly'} · {String(sub.deliveryHourLocal).padStart(2, '0')}:00 {sub.timezone}</span>
                <p className="adv2-muted" style={{ marginTop: 4 }}>
                  Sections: {sub.contentScope.join(', ')} · Created by {sub.createdByEmail}, {timeAgo(sub.createdAt)}
                </p>
              </div>
              <button className={`adv2-switch ${sub.enabled ? '' : 'adv2-off'}`} disabled={togglingId === sub.id} onClick={() => handleToggle(sub)}>
                {togglingId === sub.id ? 'Working…' : sub.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          ))}

          <div className="adv2-body" style={{ borderTop: '1px solid var(--adv2-rule)' }}>
            {createError && <p style={{ color: 'var(--adv2-bad)' }}>{createError}</p>}
            <label className="adv2-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Sections</label>
            <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
              {CONTENT_SECTIONS.map((s) => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14.5 }}>
                  <input type="checkbox" id={`section-${s}`} checked={formSections.includes(s)} onChange={() => toggleSection(s)} />
                  {s}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label className="adv2-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Cadence</label>
                <select value={formCadence} onChange={(e) => setFormCadence(e.target.value as ReportCadence)}>
                  {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="adv2-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Hour (local, 0-23)</label>
                <input type="number" min={0} max={23} style={{ width: '5rem' }} value={formHour} onChange={(e) => setFormHour(Number(e.target.value))} />
              </div>
              <button className="adv2-btn" disabled={previewLoading} onClick={handlePreview}>
                {previewLoading ? 'Rendering…' : 'Preview'}
              </button>
              <button className="adv2-btn adv2-primary" disabled={creating} onClick={handleCreate}>
                {creating ? 'Creating…' : 'Subscribe'}
              </button>
            </div>
            {previewError && <p style={{ color: 'var(--adv2-warn)', marginTop: 8 }}>{previewError}</p>}
            {preview && (
              <div className="adv2-card" style={{ marginTop: 14 }}>
                <div className="adv2-body adv2-muted" style={{ borderBottom: '1px solid var(--adv2-rule)' }}>
                  <strong>Preview</strong> — this is what the email actually looks like, rendered live from this agent's real data. Subject: <strong>{preview.subject}</strong>
                </div>
                {/* Real, server-rendered report content — every interpolated
                    value is HTML-escaped server-side (agentReportRunService.ts's
                    escapeHtml()) before this string is ever built, and this is
                    the exact HTML the real email send uses. Not user input. */}
                <div className="adv2-body" dangerouslySetInnerHTML={{ __html: preview.html }} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="adv2-card" style={{ marginTop: 22 }}>
        <h2>Delivery History<span className="adv2-hint">Real send attempts, last 30 days.</span></h2>
        <div className="adv2-body">
          {historyError && <p style={{ color: 'var(--adv2-bad)' }}>{historyError}</p>}
          {historyLoading && <p className="adv2-muted">Loading…</p>}
          {!historyLoading && history && (
            <>
              <div className="adv2-metrics">
                <div className="adv2-metric">
                  <span className="adv2-k">Sent</span>
                  <div className="adv2-v">{history.sent}</div>
                </div>
                <div className="adv2-metric">
                  <span className="adv2-k">Failed</span>
                  <div className="adv2-v">{history.failed}</div>
                </div>
                <div className="adv2-metric">
                  <span className="adv2-k">Pending</span>
                  <div className="adv2-v">{history.pending}</div>
                </div>
                <div className="adv2-metric">
                  <span className="adv2-k">{history.successRatePct === null ? 'Success rate' : 'Success rate'}</span>
                  <div className="adv2-v">{history.successRatePct === null ? '—' : `${history.successRatePct}%`}</div>
                  {history.successRatePct === null ? (
                    <span className="adv2-hint">Not enough data yet</span>
                  ) : (
                    <div className="adv2-progress"><span style={{ width: `${history.successRatePct}%` }} /></div>
                  )}
                </div>
              </div>
              {history.runs.length === 0 ? (
                <p className="adv2-muted">No delivery attempts in the last {history.windowDays} days.</p>
              ) : (
                <div>
                  {history.runs.map((run) => (
                    <div key={run.id} className="adv2-ticket-row">
                      <span className="adv2-title">{run.periodKey}</span>
                      <span className={adv2PillClass(run.deliveryStatus === 'sent' ? 'success' : run.deliveryStatus === 'failed' ? 'danger' : 'warning')}>{run.deliveryStatus}</span>
                      <span className="adv2-when">{timeAgo(run.generatedAt)}</span>
                      <span className="adv2-muted" style={{ gridColumn: '1 / -1' }}>{run.errorMessage || (run.deliveredAt ? `Delivered ${timeAgo(run.deliveredAt)}` : '—')}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
