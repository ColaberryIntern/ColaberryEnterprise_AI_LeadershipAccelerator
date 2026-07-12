import React, { useEffect, useState, useCallback, useMemo } from 'react';
import MissedOpportunitiesHeatMap from '../../components/admin/missedOpportunities/MissedOpportunitiesHeatMap';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';
import {
  missedOpportunitiesApi,
  MissedOpportunitiesReport,
  MissedEmailRow,
  TopicDrilldown,
  FeedbackAction,
} from '../../services/missedOpportunitiesApi';

// Band -> semantic StatusBadge tone (replaces the hardcoded BAND_COLOR/BAND_BG hex maps).
const BAND_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  high: 'success',
  medium: 'warning',
  low: 'neutral',
};

const todayCT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }); } catch { return iso; } };

function ScoreBadge({ score, band }: { score: number; band: string }) {
  return <StatusBadge label={String(score)} tone={BAND_TONE[band] || 'neutral'} />;
}

export default function MissedOpportunitiesPage() {
  const [date, setDate] = useState<string>(todayCT());
  const [report, setReport] = useState<MissedOpportunitiesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<TopicDrilldown | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    missedOpportunitiesApi.getReport(date)
      .then(setReport)
      .catch((e) => setError(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Deep-link from the email's heat-map words: /admin/missed-opportunities?topic=foo
  // opens that topic's trailing-24h drilldown on arrival. Runs once on mount;
  // references only stable setters + module-scope helpers (no eslint-disable —
  // the production build's eslint config rejects those comments).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('topic');
    if (!t) return;
    setDrillLoading(true);
    missedOpportunitiesApi.getTopic(t, todayCT())
      .then(setDrill)
      .catch(() => {})
      .finally(() => setDrillLoading(false));
  }, []);

  const s = report?.summary;

  // Per-page trust signal (Basecamp todo 10027085963) derived from the report freshness.
  const trust: TrustSignal = useMemo(() => {
    const valuable = s?.potentiallyValuable ?? 0;
    const hidden = s?.totalHidden ?? 0;
    return {
      level: 'live',
      source: 'missed opportunities',
      updatedAt: new Date().toISOString(),
      summary: `${hidden.toLocaleString()} emails routed away, ${valuable} flagged as likely-missed.`,
      href: '/admin/trust',
      pillars: [
        {
          name: 'Surfacing',
          status: 'live',
          evidence: [
            { label: 'Hidden', value: hidden.toLocaleString() },
            { label: 'Likely missed', value: String(valuable) },
          ],
        },
      ],
    };
  }, [s]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const openTopic = (topic: string) => {
    setDrillLoading(true);
    setDrill(null);
    missedOpportunitiesApi.getTopic(topic, date)
      .then(setDrill)
      .catch((e) => flash(e?.response?.data?.error || 'Failed to load topic'))
      .finally(() => setDrillLoading(false));
  };

  const act = async (row: MissedEmailRow, action: FeedbackAction) => {
    try {
      await missedOpportunitiesApi.feedback(row.emailId, action);
      flash(`Recorded: ${action.replace(/_/g, ' ')}`);
    } catch (e: any) { flash(e?.response?.data?.error || 'Action failed'); }
  };

  const restorePref = async (row: MissedEmailRow) => {
    try {
      const r = await missedOpportunitiesApi.restorePreference(row.emailId, 'sender');
      flash(`Will always show: ${r.patternValue}`);
    } catch (e: any) { flash(e?.response?.data?.error || 'Failed'); }
  };

  const openEmail = async (row: MissedEmailRow) => {
    try {
      const email = await missedOpportunitiesApi.getEmail(row.emailId);
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(email.body_html || `<pre>${email.body_text || '(no content)'}</pre>`);
        w.document.title = email.subject || 'Email';
      }
      missedOpportunitiesApi.feedback(row.emailId, 'reopened').catch(() => {});
    } catch (e: any) { flash(e?.response?.data?.error || 'Could not open email'); }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const r = await missedOpportunitiesApi.send();
      flash(r.sent ? 'Report emailed.' : `Not sent: ${r.reason || 'unknown'}`);
    } catch (e: any) { flash(e?.response?.data?.error || 'Send failed'); }
    finally { setSending(false); }
  };

  return (
    <>
      <PageHeader
        title="Missed Opportunities"
        icon="mail-close-line"
        subtitle="Executive visibility into filtered, hidden, archived, automated & deleted communications."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Missed Opportunities' }]}
        trust={trust}
        actions={
          <>
            <input
              type="date"
              className="form-control form-control-sm"
              style={{ width: 'auto' }}
              value={date}
              max={todayCT()}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Report date"
            />
            <button className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading}>
              <i className="ri-refresh-line" aria-hidden="true" /> Refresh
            </button>
            <button className="btn btn-primary btn-sm" onClick={sendNow} disabled={sending}>
              {sending ? 'Sending…' : 'Email me this'}
            </button>
          </>
        }
      >
        {s && (
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <StatCard label="Processed" value={s.totalProcessed.toLocaleString()} icon="inbox-line" tone="primary" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Hidden" value={s.totalHidden.toLocaleString()} icon="eye-off-line" tone="neutral" hint="routed away from inbox" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Likely Missed" value={s.potentiallyValuable} icon="error-warning-line" tone="success" hint="high opportunity" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Worth a Glance" value={s.mediumValue} icon="eye-line" tone="warning" hint="medium" />
            </div>
          </div>
        )}
      </PageHeader>

      {loading && <div className="text-center py-5"><div className="spinner-border text-primary" /><div className="text-muted mt-2">Analyzing hidden communications…</div></div>}
      {error && <div className="alert alert-danger">Error: {error}</div>}

      {!loading && !error && s && report && (
        <>
          {/* Executive summary */}
          <SectionCard className="mb-4">
            <div style={{ fontSize: 14 }}>
              <span className="text-muted fw-semibold">{date === todayCT() ? 'Last 24 hours: ' : `${date}: `}</span>
              <strong>{s.totalProcessed.toLocaleString()}</strong> emails processed · <strong>{s.totalHidden.toLocaleString()}</strong> routed away from your Inbox ·{' '}
              <strong style={{ color: 'var(--status-success)' }}>{s.potentiallyValuable}</strong> flagged as potentially valuable and not surfaced
              {s.mediumValue ? <> · <strong style={{ color: 'var(--status-warning)' }}>{s.mediumValue}</strong> worth a glance</> : null}.
            </div>
          </SectionCard>

          {/* Heat map */}
          <SectionCard title="Attention Blind-Spot Heat Map" icon="fire-line" className="mb-4">
            <MissedOpportunitiesHeatMap words={report.heatMap} onSelectTopic={openTopic} />
          </SectionCard>

          {/* Top missed */}
          <SectionCard title="Most Likely Missed Emails" icon="mail-unread-line" padded={false} className="mb-4">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                <thead className="table-light">
                  <tr>
                    <th className="text-center">Score</th>
                    <th>Subject &amp; why surfaced</th>
                    <th>Sender</th>
                    <th>Date</th>
                    <th>Folder · why hidden</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topMissed.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-muted fst-italic py-4">No hidden emails surfaced as likely-missed for this day.</td></tr>
                  )}
                  {report.topMissed.map((r) => (
                    <tr key={r.emailId}>
                      <td className="text-center"><ScoreBadge score={r.score} band={r.band} /></td>
                      <td>
                        <div className="fw-semibold">{r.subject}</div>
                        <div className="text-muted" style={{ fontSize: 12 }}>{r.explanation}</div>
                      </td>
                      <td>
                        <div>{r.fromName || r.fromAddress}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>{r.fromAddress}</div>
                      </td>
                      <td className="text-nowrap text-muted">{fmtDate(r.receivedAt)}</td>
                      <td>
                        <StatusBadge label={r.currentFolder} tone="neutral" />
                        {r.reasonHidden && <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>{r.reasonHidden}</div>}
                      </td>
                      <td className="text-nowrap">
                        <button className="btn btn-sm btn-outline-primary me-1" onClick={() => openEmail(r)}>Open</button>
                        <button className="btn btn-sm btn-outline-primary me-1" onClick={() => act(r, 'moved_to_inbox')}>To Inbox</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => restorePref(r)} title="Always show emails like this">Always show</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Deleted but valuable — Trash/Spam recovery */}
          <SectionCard title="Deleted But Potentially Valuable" icon="delete-bin-line" padded={false} className="mb-4">
            {report.deletedButValuable.length === 0 ? (
              <div className="p-3">
                <div className="alert alert-success mb-0">
                  No deleted or spam emails resemble historically valuable mail. Nothing to recover.
                </div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                  <thead className="table-light">
                    <tr>
                      <th className="text-center">Score</th>
                      <th>Subject &amp; recovery recommendation</th>
                      <th>Sender</th>
                      <th>Folder</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.deletedButValuable.map((r) => (
                      <tr key={r.emailId}>
                        <td className="text-center"><ScoreBadge score={r.score} band={r.band} /></td>
                        <td>
                          <div className="fw-semibold">{r.subject}</div>
                          <div style={{ fontSize: 12, color: 'var(--status-warning)' }}>{r.explanation}</div>
                        </td>
                        <td>
                          <div>{r.fromName || r.fromAddress}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{r.fromAddress}</div>
                        </td>
                        <td>
                          <StatusBadge label={r.currentFolder} tone="danger" />
                        </td>
                        <td className="text-nowrap">
                          <button className="btn btn-sm btn-outline-danger" onClick={() => act(r, 'marked_important')} title="Flag as important — teaches the engine">Flag important</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Learning */}
          <SectionCard title="Learning Loop" icon="brain-line" className="mb-4">
            <div className="d-flex gap-2 flex-wrap" style={{ fontSize: 13 }}>
              {[
                ['Restored', report.learning.restored],
                ['Reopened', report.learning.reopened],
                ['Marked important', report.learning.markedImportant],
                ['Moved to inbox', report.learning.movedToInbox],
                ['Always-show rules', report.learning.surfacePreferences],
              ].map(([label, val]) => (
                <div
                  key={label as string}
                  style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 16px' }}
                >
                  <span className="text-muted">{label}: </span><strong>{val}</strong>
                </div>
              ))}
            </div>
            <div className="text-muted mt-3" style={{ fontSize: 11 }}>Generated {new Date(report.generatedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} · every score is explainable — hover a row's explanation or open a topic for factor detail.</div>
          </SectionCard>
        </>
      )}

      {/* Topic drilldown drawer */}
      {(drill || drillLoading) && (
        <div onClick={() => { setDrill(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px,100%)', background: 'var(--color-bg)', height: '100%', overflowY: 'auto', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
            {drillLoading && <div className="text-muted">Loading topic…</div>}
            {drill && (
              <>
                <div className="d-flex justify-content-between align-items-center">
                  <h2 className="text-capitalize" style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{drill.topic}</h2>
                  <button className="btn btn-link text-muted p-0" style={{ fontSize: 22, lineHeight: 1 }} onClick={() => setDrill(null)} aria-label="Close">×</button>
                </div>
                <div className="text-muted mb-3">{drill.totalEmails} hidden emails · avg score {drill.avgScore}</div>

                <h3 style={subhead}>Routing breakdown</h3>
                <div className="d-flex gap-2 flex-wrap mb-3">
                  {Object.entries(drill.routingBreakdown).map(([k, v]) => (
                    <span key={k} style={{ background: 'var(--surface-subtle)', padding: '4px 10px', borderRadius: 999, fontSize: 12 }}>{k}: <strong>{v}</strong></span>
                  ))}
                </div>

                <h3 style={subhead}>Top senders</h3>
                <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13 }}>
                  {drill.topSenders.map((x) => <li key={x.sender}>{x.sender} <span className="text-muted">({x.count})</span></li>)}
                </ul>

                <h3 style={subhead}>Top organizations</h3>
                <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13 }}>
                  {drill.topOrganizations.map((x) => <li key={x.org}>{x.org} <span className="text-muted">({x.count})</span></li>)}
                </ul>

                <h3 style={subhead}>Hidden emails</h3>
                {drill.emails.map((r) => (
                  <div key={r.emailId} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                    <div className="d-flex justify-content-between gap-2">
                      <strong style={{ fontSize: 13 }}>{r.subject}</strong>
                      <ScoreBadge score={r.score} band={r.band} />
                    </div>
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{r.fromAddress} · {r.currentFolder}</div>
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{r.explanation}</div>
                    <button className="btn btn-sm btn-outline-primary mt-2" onClick={() => openEmail(r)}>Open</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--color-primary)', color: 'var(--color-bg)', padding: '10px 20px', borderRadius: 999, fontSize: 13, zIndex: 70, boxShadow: 'var(--shadow-lg)' }}>{toast}</div>
      )}
    </>
  );
}

const subhead: React.CSSProperties = { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 6px' };
