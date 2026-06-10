import React, { useEffect, useState, useCallback } from 'react';
import MissedOpportunitiesHeatMap from '../../components/admin/missedOpportunities/MissedOpportunitiesHeatMap';
import {
  missedOpportunitiesApi,
  MissedOpportunitiesReport,
  MissedEmailRow,
  TopicDrilldown,
  FeedbackAction,
} from '../../services/missedOpportunitiesApi';

const NAVY = '#0f172a';
const BAND_COLOR: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#94a3b8' };
const BAND_BG: Record<string, string> = { high: '#dcfce7', medium: '#fef3c7', low: '#f1f5f9' };

const todayCT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }); } catch { return iso; } };

function Tile({ label, value, bg, fg, sub }: { label: string; value: React.ReactNode; bg: string; fg: string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 130, background: bg, color: fg, padding: 18, borderRadius: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ScoreBadge({ score, band }: { score: number; band: string }) {
  return (
    <span style={{ display: 'inline-block', minWidth: 38, background: BAND_BG[band], color: BAND_COLOR[band], fontWeight: 800, borderRadius: 6, padding: '4px 8px', textAlign: 'center' }}>{score}</span>
  );
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

  const s = report?.summary;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1180, margin: '0 auto', fontFamily: 'system-ui,-apple-system,sans-serif', color: NAVY }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#3b82f6', fontWeight: 700 }}>Intelligence</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '4px 0 2px' }}>Missed Opportunities</h1>
          <div style={{ color: '#64748b', fontSize: 14 }}>Executive visibility into filtered, hidden, archived, automated &amp; deleted communications.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="date" value={date} max={todayCT()} onChange={(e) => setDate(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
          <button onClick={load} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 600 }}>Refresh</button>
          <button onClick={sendNow} disabled={sending}
            style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: NAVY, color: 'white', cursor: 'pointer', fontWeight: 700, opacity: sending ? 0.6 : 1 }}>
            {sending ? 'Sending…' : 'Email me this'}
          </button>
        </div>
      </div>

      {loading && <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Analyzing hidden communications…</div>}
      {error && <div style={{ padding: 20, background: '#fef2f2', color: '#991b1b', borderRadius: 8, border: '1px solid #fecaca' }}>Error: {error}</div>}

      {!loading && !error && s && report && (
        <>
          {/* Executive summary */}
          <div style={{ background: '#f8fafc', borderLeft: `4px solid ${NAVY}`, padding: '14px 18px', borderRadius: 6, fontSize: 14, marginBottom: 20 }}>
            <span style={{ color: '#64748b', fontWeight: 600 }}>{date === todayCT() ? 'Last 24 hours: ' : `${date}: `}</span>
            <strong>{s.totalProcessed.toLocaleString()}</strong> emails processed · <strong>{s.totalHidden.toLocaleString()}</strong> routed away from your Inbox ·{' '}
            <strong style={{ color: BAND_COLOR.high }}>{s.potentiallyValuable}</strong> flagged as potentially valuable and not surfaced
            {s.mediumValue ? <> · <strong style={{ color: BAND_COLOR.medium }}>{s.mediumValue}</strong> worth a glance</> : null}.
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
            <Tile label="Processed" value={s.totalProcessed.toLocaleString()} bg={NAVY} fg="white" />
            <Tile label="Hidden" value={s.totalHidden.toLocaleString()} bg="#475569" fg="white" />
            <Tile label="Likely Missed" value={s.potentiallyValuable} bg="#16a34a" fg="white" sub="high opportunity" />
            <Tile label="Worth a Glance" value={s.mediumValue} bg="#d97706" fg="white" sub="medium" />
          </div>

          {/* Heat map */}
          <h2 style={{ fontSize: 18, borderBottom: '2px solid #e2e8f0', paddingBottom: 8, margin: '8px 0 14px' }}>Attention Blind-Spot Heat Map</h2>
          <MissedOpportunitiesHeatMap words={report.heatMap} onSelectTopic={openTopic} />

          {/* Top missed */}
          <h2 style={{ fontSize: 18, borderBottom: '2px solid #e2e8f0', paddingBottom: 8, margin: '32px 0 14px' }}>Most Likely Missed Emails</h2>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: NAVY, color: 'white', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Score</th>
                <th style={{ padding: '10px 12px' }}>Subject &amp; why surfaced</th>
                <th style={{ padding: '10px 12px' }}>Sender</th>
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Folder · why hidden</th>
                <th style={{ padding: '10px 12px' }}>Actions</th>
              </tr></thead>
              <tbody>
                {report.topMissed.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>No hidden emails surfaced as likely-missed for this day.</td></tr>
                )}
                {report.topMissed.map((r) => (
                  <tr key={r.emailId} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}><ScoreBadge score={r.score} band={r.band} /></td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700 }}>{r.subject}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{r.explanation}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div>{r.fromName || r.fromAddress}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.fromAddress}</div>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#64748b' }}>{fmtDate(r.receivedAt)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.currentFolder}</span>
                      {r.reasonHidden && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{r.reasonHidden}</div>}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEmail(r)} style={linkBtn}>Open</button>
                      <button onClick={() => act(r, 'moved_to_inbox')} style={linkBtn}>To Inbox</button>
                      <button onClick={() => restorePref(r)} style={linkBtn} title="Always show emails like this">Always show</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Deleted but valuable — Trash/Spam recovery */}
          <h2 style={{ fontSize: 18, borderBottom: '2px solid #e2e8f0', paddingBottom: 8, margin: '32px 0 14px' }}>Deleted But Potentially Valuable</h2>
          {report.deletedButValuable.length === 0 ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#166534' }}>
              No deleted or spam emails resemble historically valuable mail. Nothing to recover.
            </div>
          ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#7c2d12', color: 'white', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Score</th>
                  <th style={{ padding: '10px 12px' }}>Subject &amp; recovery recommendation</th>
                  <th style={{ padding: '10px 12px' }}>Sender</th>
                  <th style={{ padding: '10px 12px' }}>Folder</th>
                  <th style={{ padding: '10px 12px' }}>Actions</th>
                </tr></thead>
                <tbody>
                  {report.deletedButValuable.map((r) => (
                    <tr key={r.emailId} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}><ScoreBadge score={r.score} band={r.band} /></td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700 }}>{r.subject}</div>
                        <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>{r.explanation}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div>{r.fromName || r.fromAddress}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.fromAddress}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{r.currentFolder}</span>
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => act(r, 'marked_important')} style={linkBtn} title="Flag as important — teaches the engine">Flag important</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Learning */}
          <h2 style={{ fontSize: 18, borderBottom: '2px solid #e2e8f0', paddingBottom: 8, margin: '32px 0 14px' }}>Learning Loop</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
            {[
              ['Restored', report.learning.restored],
              ['Reopened', report.learning.reopened],
              ['Marked important', report.learning.markedImportant],
              ['Moved to inbox', report.learning.movedToInbox],
              ['Always-show rules', report.learning.surfacePreferences],
            ].map(([label, val]) => (
              <div key={label as string} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px' }}>
                <span style={{ color: '#64748b' }}>{label}: </span><strong>{val}</strong>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, fontSize: 11, color: '#94a3b8' }}>Generated {new Date(report.generatedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} · every score is explainable — hover a row's explanation or open a topic for factor detail.</div>
        </>
      )}

      {/* Topic drilldown drawer */}
      {(drill || drillLoading) && (
        <div onClick={() => { setDrill(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px,100%)', background: 'white', height: '100%', overflowY: 'auto', padding: 24, boxShadow: '-8px 0 24px rgba(0,0,0,0.15)' }}>
            {drillLoading && <div style={{ color: '#64748b' }}>Loading topic…</div>}
            {drill && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, textTransform: 'capitalize' }}>{drill.topic}</h2>
                  <button onClick={() => setDrill(null)} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
                </div>
                <div style={{ color: '#64748b', marginBottom: 16 }}>{drill.totalEmails} hidden emails · avg score {drill.avgScore}</div>

                <h3 style={subhead}>Routing breakdown</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  {Object.entries(drill.routingBreakdown).map(([k, v]) => (
                    <span key={k} style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: 999, fontSize: 12 }}>{k}: <strong>{v}</strong></span>
                  ))}
                </div>

                <h3 style={subhead}>Top senders</h3>
                <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13 }}>
                  {drill.topSenders.map((x) => <li key={x.sender}>{x.sender} <span style={{ color: '#94a3b8' }}>({x.count})</span></li>)}
                </ul>

                <h3 style={subhead}>Top organizations</h3>
                <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13 }}>
                  {drill.topOrganizations.map((x) => <li key={x.org}>{x.org} <span style={{ color: '#94a3b8' }}>({x.count})</span></li>)}
                </ul>

                <h3 style={subhead}>Hidden emails</h3>
                {drill.emails.map((r) => (
                  <div key={r.emailId} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{r.subject}</strong>
                      <ScoreBadge score={r.score} band={r.band} />
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{r.fromAddress} · {r.currentFolder}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{r.explanation}</div>
                    <button onClick={() => openEmail(r)} style={{ ...linkBtn, marginLeft: 0, marginTop: 6 }}>Open</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: NAVY, color: 'white', padding: '10px 20px', borderRadius: 999, fontSize: 13, zIndex: 70, boxShadow: '0 6px 20px rgba(0,0,0,0.2)' }}>{toast}</div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = { marginLeft: 6, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 12, color: '#0f172a' };
const subhead: React.CSSProperties = { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#64748b', margin: '0 0 6px' };
